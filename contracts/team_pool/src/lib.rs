//! Hearthwork per-realm community pools (NEAR port of the Solana `sol_pool` program).
//!
//! * One contract instance hosts one pool per `realm_id`.
//! * `initialize_pool(realm_id)`: first caller becomes the pool authority.
//! * `deposit(realm_id)`: attach >= 0.01 NEAR.
//! * `withdraw(realm_id, amount)`: anyone may withdraw, capped at 10 NEAR per
//!   account per pool per 24h window.
//! * An optional `operator` (game-server relayer) may act for users via
//!   `on_behalf_of`; the argument is rejected for anyone else.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// 0.01 NEAR (Solana: MIN_DEPOSIT_LAMPORTS = 0.01 SOL)
pub const MIN_DEPOSIT_YOCTO: u128 = ONE_NEAR / 100;
/// 10 NEAR per account per window (Solana: MAX_WITHDRAWAL_LAMPORTS = 10 SOL)
pub const MAX_WITHDRAWAL_YOCTO: u128 = 10 * ONE_NEAR;
/// 24 hours (Solana: DAILY_WINDOW_SECONDS)
pub const DAILY_WINDOW_SECONDS: u64 = 86_400;
pub const MAX_REALM_ID_LEN: usize = 50;
pub const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Pools,
    Records,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Pool {
    pub realm_id: String,
    /// Account that created the pool.
    pub authority: AccountId,
    /// Cumulative yoctoNEAR ever deposited.
    pub total_deposited: U128,
    /// Cumulative yoctoNEAR ever withdrawn (successfully or in flight).
    pub total_withdrawn: U128,
    /// Current pool balance (total_deposited - total_withdrawn).
    pub balance: U128,
    pub created_at_sec: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct WithdrawalRecord {
    /// Unix seconds when the current 24h window started.
    pub window_start_sec: u64,
    /// yoctoNEAR withdrawn in the current window.
    pub withdrawn_in_window: U128,
    /// Unix seconds of the last withdrawal.
    pub last_withdrawal_sec: u64,
}

#[near(serializers = [json])]
pub struct WithdrawLimitView {
    pub remaining: U128,
    pub withdrawn_in_window: U128,
    pub max_per_window: U128,
    /// Unix seconds when the window resets (0 if no active window).
    pub window_resets_at_sec: u64,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub operator: Option<AccountId>,
    pub min_deposit: U128,
    pub max_withdrawal_per_window: U128,
    pub window_seconds: u64,
    pub pool_count: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    operator: Option<AccountId>,
    pools: IterableMap<String, Pool>,
    records: LookupMap<(String, AccountId), WithdrawalRecord>,
}

fn now_sec() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b).unwrap_or_else(|| env::panic_str("Arithmetic overflow"))
}

/// Usage in the current window, accounting for expiry.
fn active_usage(rec: Option<&WithdrawalRecord>, now: u64) -> (u128, u64) {
    match rec {
        Some(r) if now < r.window_start_sec.saturating_add(DAILY_WINDOW_SECONDS) => {
            (r.withdrawn_in_window.0, r.window_start_sec)
        }
        _ => (0, now),
    }
}

#[near]
impl Contract {
    /// `owner` may change the operator. `operator` is the game-server relayer.
    #[init]
    pub fn new(owner: AccountId, operator: Option<AccountId>) -> Self {
        Self {
            owner,
            operator,
            pools: IterableMap::new(StorageKey::Pools),
            records: LookupMap::new(StorageKey::Records),
        }
    }

    pub fn set_operator(&mut self, operator: Option<AccountId>) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can set the operator");
        self.operator = operator;
    }

    /// Create the pool for `realm_id`. The caller (or `on_behalf_of` when
    /// the caller is the operator) becomes the pool authority.
    pub fn initialize_pool(&mut self, realm_id: String, on_behalf_of: Option<AccountId>) -> Pool {
        let who = self.actor(on_behalf_of);
        require!(!realm_id.is_empty(), "realm_id cannot be empty");
        require!(realm_id.len() <= MAX_REALM_ID_LEN, "realm_id is too long. Maximum 50 characters");
        require!(!self.pools.contains_key(&realm_id), "Pool already exists for this realm");
        let pool = Pool {
            realm_id: realm_id.clone(),
            authority: who,
            total_deposited: U128(0),
            total_withdrawn: U128(0),
            balance: U128(0),
            created_at_sec: now_sec(),
        };
        self.pools.insert(realm_id.clone(), pool.clone());
        log!("Pool {} initialized by {}", realm_id, pool.authority);
        pool
    }

    /// Deposit the attached NEAR (min 0.01) into the realm pool.
    /// `on_behalf_of` is only for attribution in logs. Returns new balance.
    #[payable]
    pub fn deposit(&mut self, realm_id: String, on_behalf_of: Option<AccountId>) -> U128 {
        let who = self.actor(on_behalf_of);
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount >= MIN_DEPOSIT_YOCTO, "Deposit amount is too small. Minimum is 0.01 NEAR");
        let pool = self.pools.get_mut(&realm_id).unwrap_or_else(|| env::panic_str("Pool not found"));
        pool.total_deposited = U128(add(pool.total_deposited.0, amount));
        pool.balance = U128(add(pool.balance.0, amount));
        log!("{} deposited {} yoctoNEAR into pool {}", who, amount, realm_id);
        pool.balance
    }

    /// Withdraw `amount` yoctoNEAR from the pool to `receiver` (default:
    /// the acting account). Limited to 10 NEAR per account per 24h window.
    /// State is updated before the transfer and rolled back on failure.
    pub fn withdraw(
        &mut self,
        realm_id: String,
        amount: U128,
        on_behalf_of: Option<AccountId>,
        receiver: Option<AccountId>,
    ) -> Promise {
        let who = self.actor(on_behalf_of);
        let amount = amount.0;
        require!(amount > 0, "Withdraw amount must be greater than zero");
        let now = now_sec();
        let key = (realm_id.clone(), who.clone());

        let (used, window_start) = active_usage(self.records.get(&key), now);
        let new_total = add(used, amount);
        require!(new_total <= MAX_WITHDRAWAL_YOCTO, "Exceeds daily withdrawal limit of 10 NEAR");

        let pool = self.pools.get_mut(&realm_id).unwrap_or_else(|| env::panic_str("Pool not found"));
        require!(pool.balance.0 >= amount, "Insufficient pool balance");
        pool.balance = U128(pool.balance.0 - amount);
        pool.total_withdrawn = U128(add(pool.total_withdrawn.0, amount));

        self.records.insert(
            key,
            WithdrawalRecord {
                window_start_sec: window_start,
                withdrawn_in_window: U128(new_total),
                last_withdrawal_sec: now,
            },
        );

        let to = receiver.unwrap_or_else(|| who.clone());
        Promise::new(to).transfer(NearToken::from_yoctonear(amount)).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_withdraw(realm_id, who, U128(amount), window_start),
        )
    }

    /// Callback: on failed transfer, restore the pool balance and the
    /// account's window usage (if the same window is still active).
    #[private]
    pub fn on_withdraw(
        &mut self,
        realm_id: String,
        account_id: AccountId,
        amount: U128,
        window_start_sec: u64,
    ) -> bool {
        if near_sdk::is_promise_success() {
            return true;
        }
        if let Some(pool) = self.pools.get_mut(&realm_id) {
            pool.balance = U128(add(pool.balance.0, amount.0));
            pool.total_withdrawn = U128(pool.total_withdrawn.0.saturating_sub(amount.0));
        }
        if let Some(rec) = self.records.get_mut(&(realm_id.clone(), account_id.clone())) {
            if rec.window_start_sec == window_start_sec {
                rec.withdrawn_in_window = U128(rec.withdrawn_in_window.0.saturating_sub(amount.0));
            }
        }
        log!("Withdraw from pool {} to {} failed; {} yoctoNEAR restored", realm_id, account_id, amount.0);
        false
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            operator: self.operator.clone(),
            min_deposit: U128(MIN_DEPOSIT_YOCTO),
            max_withdrawal_per_window: U128(MAX_WITHDRAWAL_YOCTO),
            window_seconds: DAILY_WINDOW_SECONDS,
            pool_count: self.pools.len(),
        }
    }

    pub fn get_pool(&self, realm_id: String) -> Option<Pool> {
        self.pools.get(&realm_id).cloned()
    }

    pub fn list_pools(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Pool> {
        self.pools
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    pub fn get_withdrawal_record(&self, realm_id: String, account_id: AccountId) -> Option<WithdrawalRecord> {
        self.records.get(&(realm_id, account_id)).cloned()
    }

    /// Remaining amount `account_id` may withdraw from `realm_id` right now
    /// (ignores pool balance; see `get_pool().balance`).
    pub fn get_remaining_daily_limit(&self, realm_id: String, account_id: AccountId) -> U128 {
        self.get_withdraw_limit(realm_id, account_id).remaining
    }

    pub fn get_withdraw_limit(&self, realm_id: String, account_id: AccountId) -> WithdrawLimitView {
        let now = now_sec();
        let rec = self.records.get(&(realm_id, account_id));
        let (used, start) = active_usage(rec, now);
        WithdrawLimitView {
            remaining: U128(MAX_WITHDRAWAL_YOCTO.saturating_sub(used)),
            withdrawn_in_window: U128(used),
            max_per_window: U128(MAX_WITHDRAWAL_YOCTO),
            window_resets_at_sec: if used > 0 { start + DAILY_WINDOW_SECONDS } else { 0 },
        }
    }
}

impl Contract {
    fn actor(&self, on_behalf_of: Option<AccountId>) -> AccountId {
        let caller = env::predecessor_account_id();
        match on_behalf_of {
            Some(a) => {
                require!(self.operator.as_ref() == Some(&caller), "Only the operator may use on_behalf_of");
                a
            }
            None => caller,
        }
    }
}

#[cfg(test)]
mod tests;
