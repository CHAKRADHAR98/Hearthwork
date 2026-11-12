//! Hearthwork prediction markets (NEAR port of the Solana `gather` program).
//!
//! * One contract instance hosts many YES/NO markets keyed by `market_id`.
//! * Bettors keep an internal NEAR balance (the Solana "bettor wallet" PDA).
//!   `deposit` adds to it, `buy_shares` / `sell_shares` / `claim` move value
//!   between it and the market collateral, `withdraw` sends NEAR out.
//! * Pricing is LMSR (see `pricing.rs`); 1 winning share pays `share_value`
//!   yoctoNEAR (1 NEAR by default, mirroring 1 share = 1 SOL on Solana).
//! * An optional `operator` (the game-server relayer) may act for users by
//!   passing `on_behalf_of`; the argument is rejected for anyone else.

pub mod pricing;

use near_sdk::json_types::{I128, U128};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Minimum deposit into a bettor balance (0.01 NEAR).
pub const MIN_DEPOSIT: u128 = ONE_NEAR / 100;
/// Minimum LMSR liquidity parameter (same as Solana MINIMUM_LMSR_B).
pub const MINIMUM_LMSR_B: u64 = 1;
pub const MAX_MARKET_ID_LEN: usize = 64;
pub const MAX_NAME_LEN: usize = 50;
pub const MAX_DESCRIPTION_LEN: usize = 280;
pub const MAX_BETTOR_NAME_LEN: usize = 30;
pub const MAX_ADMINS: usize = 5;
pub const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Markets,
    Bettors,
    Positions,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Active,
    Resolved,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Yes,
    No,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Market {
    pub market_id: String,
    pub name: String,
    pub description: String,
    /// Realm owner / creator; may resolve the market (as can any admin).
    pub creator: AccountId,
    /// LMSR liquidity parameter, in shares.
    pub lmsr_b: u64,
    /// Unix timestamp (seconds). Trading closes and resolution opens here.
    pub deadline_sec: u64,
    pub created_at_sec: u64,
    /// yoctoNEAR paid out per winning share.
    pub share_value: U128,
    /// Creator subsidy deposited at creation (b * ln2 * share_value).
    pub initial_deposit: U128,
    /// NEAR currently backing this market's payouts.
    pub collateral: U128,
    /// Total protocol fees this market has generated.
    pub fees_collected: U128,
    pub status: MarketStatus,
    pub outcome: Option<Outcome>,
    /// Outstanding YES shares (q_yes). After resolution: unclaimed.
    pub yes_shares: u64,
    /// Outstanding NO shares (q_no). After resolution: unclaimed.
    pub no_shares: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Bettor {
    pub name: Option<String>,
    /// Spendable internal balance (yoctoNEAR).
    pub balance: U128,
    /// Running realized P&L on bets: sells + claims - buys (yoctoNEAR).
    pub net_profit: I128,
    pub is_banned: bool,
    /// Markets this bettor has traded in.
    pub markets: Vec<String>,
}

impl Default for Bettor {
    fn default() -> Self {
        Self { name: None, balance: U128(0), net_profit: I128(0), is_banned: false, markets: vec![] }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Position {
    pub yes_shares: u64,
    pub no_shares: u64,
    /// Total yoctoNEAR spent buying (incl. fees).
    pub spent: U128,
    /// Total yoctoNEAR received from sells and claims.
    pub earned: U128,
}

#[near(serializers = [json])]
pub struct PositionView {
    pub market_id: String,
    pub account_id: AccountId,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub spent: U128,
    pub earned: U128,
}

#[near(serializers = [json])]
pub struct QuoteView {
    /// LMSR cost delta (yoctoNEAR) moved into/out of the market.
    pub base: U128,
    pub fee: U128,
    /// Buy: total debited. Sell: net credited.
    pub total: U128,
}

#[near(serializers = [json])]
pub struct PricesView {
    pub yes: f64,
    pub no: f64,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub admins: Vec<AccountId>,
    pub operator: Option<AccountId>,
    pub fee_bps: u16,
    pub default_share_value: U128,
    /// Fees + reclaimed surplus withdrawable by admins.
    pub treasury: U128,
    pub market_count: u32,
    pub min_deposit: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    admins: Vec<AccountId>,
    operator: Option<AccountId>,
    fee_bps: u16,
    default_share_value: u128,
    treasury: u128,
    markets: IterableMap<String, Market>,
    bettors: LookupMap<AccountId, Bettor>,
    positions: LookupMap<(String, AccountId), Position>,
}

fn now_sec() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b).unwrap_or_else(|| env::panic_str("Arithmetic overflow"))
}

fn sub(a: u128, b: u128, msg: &str) -> u128 {
    a.checked_sub(b).unwrap_or_else(|| env::panic_str(msg))
}

fn i128_add(a: i128, b: u128, negate: bool) -> i128 {
    let b = i128::try_from(b).unwrap_or_else(|_| env::panic_str("Arithmetic overflow"));
    let r = if negate { a.checked_sub(b) } else { a.checked_add(b) };
    r.unwrap_or_else(|| env::panic_str("Arithmetic overflow"))
}

fn validate_fee(fee_bps: u16) {
    require!((fee_bps as u128) < pricing::BPS_DENOMINATOR, "fee_bps must be < 10000");
}

#[near]
impl Contract {
    /// `admins`: global admins (max 5). `operator`: game-server relayer allowed to
    /// use `on_behalf_of`. `fee_bps`: protocol fee in basis points (< 10000).
    /// `share_value`: yoctoNEAR paid per winning share (default 1 NEAR).
    #[init]
    pub fn new(
        admins: Vec<AccountId>,
        operator: Option<AccountId>,
        fee_bps: u16,
        share_value: Option<U128>,
    ) -> Self {
        require!(!admins.is_empty(), "At least one admin is required");
        require!(admins.len() <= MAX_ADMINS, "Too many admins");
        validate_fee(fee_bps);
        let sv = share_value.map(|v| v.0).unwrap_or(ONE_NEAR);
        require!(sv > 0, "share_value must be > 0");
        let mut dedup: Vec<AccountId> = Vec::new();
        for a in admins {
            if !dedup.contains(&a) {
                dedup.push(a);
            }
        }
        Self {
            admins: dedup,
            operator,
            fee_bps,
            default_share_value: sv,
            treasury: 0,
            markets: IterableMap::new(StorageKey::Markets),
            bettors: LookupMap::new(StorageKey::Bettors),
            positions: LookupMap::new(StorageKey::Positions),
        }
    }

    // ------------------------------------------------------------------
    // Admin configuration
    // ------------------------------------------------------------------

    pub fn add_admin(&mut self, account_id: AccountId) {
        self.assert_admin();
        require!(!self.admins.contains(&account_id), "Admin already exists");
        require!(self.admins.len() < MAX_ADMINS, "Too many admins");
        self.admins.push(account_id);
    }

    pub fn remove_admin(&mut self, account_id: AccountId) {
        self.assert_admin();
        require!(self.admins.len() > 1, "Cannot remove the last admin");
        let before = self.admins.len();
        self.admins.retain(|a| a != &account_id);
        require!(self.admins.len() < before, "Not an admin");
    }

    pub fn set_operator(&mut self, operator: Option<AccountId>) {
        self.assert_admin();
        self.operator = operator;
    }

    /// Applies to future trades on all markets.
    pub fn set_fee_bps(&mut self, fee_bps: u16) {
        self.assert_admin();
        validate_fee(fee_bps);
        self.fee_bps = fee_bps;
    }

    /// Applies to markets created afterwards only.
    pub fn set_default_share_value(&mut self, share_value: U128) {
        self.assert_admin();
        require!(share_value.0 > 0, "share_value must be > 0");
        self.default_share_value = share_value.0;
    }

    pub fn ban_bettor(&mut self, account_id: AccountId) {
        self.assert_admin();
        let mut b = self.bettors.get(&account_id).cloned().unwrap_or_default();
        b.is_banned = true;
        self.bettors.insert(account_id.clone(), b);
        log!("Banned bettor {}", account_id);
    }

    pub fn unban_bettor(&mut self, account_id: AccountId) {
        self.assert_admin();
        let b = self.bettors.get_mut(&account_id).unwrap_or_else(|| env::panic_str("Bettor not found"));
        b.is_banned = false;
    }

    // ------------------------------------------------------------------
    // Markets
    // ------------------------------------------------------------------

    /// Admin or operator creates a market. Must attach at least
    /// `get_required_liquidity(lmsr_b)` yoctoNEAR (the LMSR subsidy
    /// b * ln2 * share_value); any excess is refunded to the caller.
    /// `creator` (realm owner, may resolve) defaults to the caller.
    #[payable]
    pub fn create_market(
        &mut self,
        market_id: String,
        name: String,
        description: String,
        lmsr_b: u64,
        deadline_sec: u64,
        creator: Option<AccountId>,
    ) -> Market {
        let caller = env::predecessor_account_id();
        require!(
            self.is_admin(&caller) || self.operator.as_ref() == Some(&caller),
            "Only an admin or the operator can create markets"
        );
        require!(!market_id.is_empty(), "market_id cannot be empty");
        require!(market_id.len() <= MAX_MARKET_ID_LEN, "market_id too long");
        require!(!name.is_empty() && name.len() <= MAX_NAME_LEN, "name must be 1..=50 bytes");
        require!(description.len() <= MAX_DESCRIPTION_LEN, "description too long");
        require!(lmsr_b >= MINIMUM_LMSR_B, "The liquidity parameter b is too low");
        require!(deadline_sec > now_sec(), "deadline must be in the future");
        require!(!self.markets.contains_key(&market_id), "Market already exists");

        let sv = self.default_share_value;
        let required = pricing::initial_liquidity(lmsr_b, sv);
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= required,
            format!("Attach at least {} yoctoNEAR initial liquidity", required)
        );

        let market = Market {
            market_id: market_id.clone(),
            name,
            description,
            creator: creator.unwrap_or_else(|| caller.clone()),
            lmsr_b,
            deadline_sec,
            created_at_sec: now_sec(),
            share_value: U128(sv),
            initial_deposit: U128(required),
            collateral: U128(required),
            fees_collected: U128(0),
            status: MarketStatus::Active,
            outcome: None,
            yes_shares: 0,
            no_shares: 0,
        };
        self.markets.insert(market_id.clone(), market.clone());
        log!("Market {} created", market_id);

        let refund = attached - required;
        if refund > 0 {
            Promise::new(caller).transfer(NearToken::from_yoctonear(refund)).detach();
        }
        market
    }

    /// Market creator or any admin resolves after the deadline.
    pub fn resolve_market(&mut self, market_id: String, outcome: Outcome) {
        let caller = env::predecessor_account_id();
        let is_admin = self.is_admin(&caller);
        let m = self.market_mut(&market_id);
        require!(is_admin || m.creator == caller, "you are not authorized to resolve this market");
        require!(m.status == MarketStatus::Active, "Market already resolved");
        require!(now_sec() >= m.deadline_sec, "Market deadline has not passed yet");
        m.status = MarketStatus::Resolved;
        m.outcome = Some(outcome);
        log!("Market {} resolved {:?}", market_id, outcome);
    }

    // ------------------------------------------------------------------
    // Bettor balance
    // ------------------------------------------------------------------

    /// Optional: create/rename a bettor profile. Attached deposit (if any)
    /// is credited to the balance.
    #[payable]
    pub fn register_bettor(&mut self, name: Option<String>, on_behalf_of: Option<AccountId>) -> Bettor {
        let who = self.actor(on_behalf_of);
        if let Some(n) = &name {
            require!(n.len() <= MAX_BETTOR_NAME_LEN, "name too long (max 30)");
        }
        let attached = env::attached_deposit().as_yoctonear();
        let mut b = self.bettors.get(&who).cloned().unwrap_or_default();
        require!(!b.is_banned, "Bettor is banned");
        if attached > 0 {
            require!(attached >= MIN_DEPOSIT, "Minimum deposit is 0.01 NEAR");
            b.balance = U128(add(b.balance.0, attached));
        }
        b.name = name;
        self.bettors.insert(who, b.clone());
        b
    }

    /// Credit the attached NEAR (min 0.01) to the bettor's balance.
    /// Creates the bettor profile if needed. Returns the new balance.
    #[payable]
    pub fn deposit(&mut self, on_behalf_of: Option<AccountId>) -> U128 {
        let who = self.actor(on_behalf_of);
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= MIN_DEPOSIT, "Minimum deposit is 0.01 NEAR");
        let mut b = self.bettors.get(&who).cloned().unwrap_or_default();
        require!(!b.is_banned, "Bettor is banned");
        b.balance = U128(add(b.balance.0, attached));
        let bal = b.balance;
        self.bettors.insert(who, b);
        bal
    }

    /// Withdraw from the internal balance (default: everything) to
    /// `receiver` (default: the bettor). State is debited first and
    /// restored by a callback if the transfer fails.
    pub fn withdraw(
        &mut self,
        amount: Option<U128>,
        on_behalf_of: Option<AccountId>,
        receiver: Option<AccountId>,
    ) -> Promise {
        let who = self.actor(on_behalf_of);
        let b = self.bettors.get_mut(&who).unwrap_or_else(|| env::panic_str("Bettor not found"));
        require!(!b.is_banned, "Bettor is banned");
        let amt = amount.map(|a| a.0).unwrap_or(b.balance.0);
        require!(amt > 0, "Amount cannot be zero");
        b.balance = U128(sub(b.balance.0, amt, "Not enough balance"));
        let to = receiver.unwrap_or_else(|| who.clone());
        Promise::new(to).transfer(NearToken::from_yoctonear(amt)).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_bettor_withdraw(who, U128(amt)),
        )
    }

    #[private]
    pub fn on_bettor_withdraw(&mut self, account_id: AccountId, amount: U128) -> bool {
        if transfer_succeeded() {
            return true;
        }
        let mut b = self.bettors.get(&account_id).cloned().unwrap_or_default();
        b.balance = U128(add(b.balance.0, amount.0));
        self.bettors.insert(account_id.clone(), b);
        log!("Withdraw to {} failed; {} yoctoNEAR restored", account_id, amount.0);
        false
    }

    // ------------------------------------------------------------------
    // Trading
    // ------------------------------------------------------------------

    /// Buy `shares` whole YES/NO shares, paid from the internal balance.
    /// `max_cost` (optional) is slippage protection on the total debited.
    pub fn buy_shares(
        &mut self,
        market_id: String,
        is_yes: bool,
        shares: u64,
        max_cost: Option<U128>,
        on_behalf_of: Option<AccountId>,
    ) -> QuoteView {
        let who = self.actor(on_behalf_of);
        require!(shares > 0, "Amount cannot be zero");
        let fee_bps = self.fee_bps;
        let mut bettor = self.active_bettor(&who);

        let m = self.market_mut(&market_id);
        require!(m.status == MarketStatus::Active, "Market is resolved");
        require!(now_sec() < m.deadline_sec, "Market trading has closed");
        let q = pricing::quote_buy(m.yes_shares, m.no_shares, m.lmsr_b, is_yes, shares, m.share_value.0, fee_bps);
        if let Some(mc) = max_cost {
            require!(q.total <= mc.0, "Cost exceeds max_cost (slippage)");
        }
        require!(bettor.balance.0 >= q.total, "Not enough balance");

        if is_yes {
            m.yes_shares = m.yes_shares.checked_add(shares).expect("Arithmetic overflow");
        } else {
            m.no_shares = m.no_shares.checked_add(shares).expect("Arithmetic overflow");
        }
        m.collateral = U128(add(m.collateral.0, q.base));
        m.fees_collected = U128(add(m.fees_collected.0, q.fee));
        self.treasury = add(self.treasury, q.fee);

        bettor.balance = U128(bettor.balance.0 - q.total);
        bettor.net_profit = I128(i128_add(bettor.net_profit.0, q.total, true));
        if !bettor.markets.contains(&market_id) {
            bettor.markets.push(market_id.clone());
        }
        self.bettors.insert(who.clone(), bettor);

        let key = (market_id, who);
        let mut p = self.positions.get(&key).cloned().unwrap_or_default();
        if is_yes {
            p.yes_shares = p.yes_shares.checked_add(shares).expect("Arithmetic overflow");
        } else {
            p.no_shares = p.no_shares.checked_add(shares).expect("Arithmetic overflow");
        }
        p.spent = U128(add(p.spent.0, q.total));
        self.positions.insert(key, p);

        QuoteView { base: U128(q.base), fee: U128(q.fee), total: U128(q.total) }
    }

    /// Sell `shares` back to the market maker before resolution; proceeds
    /// (minus fee) go to the internal balance. `min_proceeds` = slippage guard.
    pub fn sell_shares(
        &mut self,
        market_id: String,
        is_yes: bool,
        shares: u64,
        min_proceeds: Option<U128>,
        on_behalf_of: Option<AccountId>,
    ) -> QuoteView {
        let who = self.actor(on_behalf_of);
        require!(shares > 0, "Amount cannot be zero");
        let fee_bps = self.fee_bps;
        let mut bettor = self.active_bettor(&who);

        let key = (market_id.clone(), who.clone());
        let mut p = self.positions.get(&key).cloned().unwrap_or_else(|| env::panic_str("No position in this market"));
        let held = if is_yes { p.yes_shares } else { p.no_shares };
        require!(held >= shares, "You don't have enough shares");

        let m = self.market_mut(&market_id);
        require!(m.status == MarketStatus::Active, "Market is resolved");
        require!(now_sec() < m.deadline_sec, "Market trading has closed");
        let q = pricing::quote_sell(m.yes_shares, m.no_shares, m.lmsr_b, is_yes, shares, m.share_value.0, fee_bps);
        if let Some(mp) = min_proceeds {
            require!(q.total >= mp.0, "Proceeds below min_proceeds (slippage)");
        }
        if is_yes {
            m.yes_shares -= shares;
        } else {
            m.no_shares -= shares;
        }
        m.collateral = U128(sub(m.collateral.0, q.base, "Market collateral underflow"));
        m.fees_collected = U128(add(m.fees_collected.0, q.fee));
        self.treasury = add(self.treasury, q.fee);

        if is_yes {
            p.yes_shares -= shares;
        } else {
            p.no_shares -= shares;
        }
        p.earned = U128(add(p.earned.0, q.total));
        self.positions.insert(key, p);

        bettor.balance = U128(add(bettor.balance.0, q.total));
        bettor.net_profit = I128(i128_add(bettor.net_profit.0, q.total, false));
        self.bettors.insert(who, bettor);

        QuoteView { base: U128(q.base), fee: U128(q.fee), total: U128(q.total) }
    }

    /// After resolution, redeem winning shares (default: all) for
    /// `share_value` each, credited to the internal balance. Returns payout.
    pub fn claim(&mut self, market_id: String, shares: Option<u64>, on_behalf_of: Option<AccountId>) -> U128 {
        let who = self.actor(on_behalf_of);
        let mut bettor = self.active_bettor(&who);
        let key = (market_id.clone(), who.clone());
        let mut p = self.positions.get(&key).cloned().unwrap_or_else(|| env::panic_str("No position in this market"));

        let m = self.market_mut(&market_id);
        require!(m.status == MarketStatus::Resolved, "Market is not resolved");
        let outcome = m.outcome.unwrap_or_else(|| env::panic_str("Market is not resolved"));
        let held = match outcome {
            Outcome::Yes => p.yes_shares,
            Outcome::No => p.no_shares,
        };
        let n = shares.unwrap_or(held);
        require!(n > 0, "Amount cannot be zero");
        require!(held >= n, "You don't have enough winning shares");
        let payout = (n as u128).checked_mul(m.share_value.0).expect("Arithmetic overflow");
        m.collateral = U128(sub(m.collateral.0, payout, "Market collateral insufficient"));
        match outcome {
            Outcome::Yes => {
                m.yes_shares -= n;
                p.yes_shares -= n;
            }
            Outcome::No => {
                m.no_shares -= n;
                p.no_shares -= n;
            }
        }
        p.earned = U128(add(p.earned.0, payout));
        self.positions.insert(key, p);

        bettor.balance = U128(add(bettor.balance.0, payout));
        bettor.net_profit = I128(i128_add(bettor.net_profit.0, payout, false));
        self.bettors.insert(who, bettor);
        U128(payout)
    }

    // ------------------------------------------------------------------
    // Admin treasury
    // ------------------------------------------------------------------

    /// After resolution, move collateral not needed for unclaimed winning
    /// shares (leftover LMSR subsidy + losers' stakes) into the treasury.
    pub fn withdraw_market_surplus(&mut self, market_id: String) -> U128 {
        self.assert_admin();
        let m = self.market_mut(&market_id);
        require!(m.status == MarketStatus::Resolved, "Market is not resolved");
        let outstanding = match m.outcome.expect("Market is not resolved") {
            Outcome::Yes => m.yes_shares,
            Outcome::No => m.no_shares,
        };
        let needed = (outstanding as u128).checked_mul(m.share_value.0).expect("Arithmetic overflow");
        let surplus = m.collateral.0.saturating_sub(needed);
        m.collateral = U128(m.collateral.0 - surplus);
        self.treasury = add(self.treasury, surplus);
        U128(surplus)
    }

    /// Admin withdraws accumulated fees/surplus (default: all) to
    /// `receiver` (default: caller). Restored on transfer failure.
    pub fn admin_withdraw(&mut self, amount: Option<U128>, receiver: Option<AccountId>) -> Promise {
        self.assert_admin();
        let amt = amount.map(|a| a.0).unwrap_or(self.treasury);
        require!(amt > 0, "Amount cannot be zero");
        self.treasury = sub(self.treasury, amt, "Not enough treasury balance");
        let to = receiver.unwrap_or_else(env::predecessor_account_id);
        Promise::new(to).transfer(NearToken::from_yoctonear(amt)).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_admin_withdraw(U128(amt)),
        )
    }

    #[private]
    pub fn on_admin_withdraw(&mut self, amount: U128) -> bool {
        if transfer_succeeded() {
            return true;
        }
        self.treasury = add(self.treasury, amount.0);
        log!("Admin withdraw failed; {} yoctoNEAR restored", amount.0);
        false
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            admins: self.admins.clone(),
            operator: self.operator.clone(),
            fee_bps: self.fee_bps,
            default_share_value: U128(self.default_share_value),
            treasury: U128(self.treasury),
            market_count: self.markets.len(),
            min_deposit: U128(MIN_DEPOSIT),
        }
    }

    pub fn get_required_liquidity(&self, lmsr_b: u64) -> U128 {
        U128(pricing::initial_liquidity(lmsr_b, self.default_share_value))
    }

    pub fn list_markets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Market> {
        self.markets
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    pub fn get_market(&self, market_id: String) -> Option<Market> {
        self.markets.get(&market_id).cloned()
    }

    pub fn get_prices(&self, market_id: String) -> PricesView {
        let m = self.market(&market_id);
        let yes = pricing::yes_price(m.yes_shares, m.no_shares, m.lmsr_b);
        PricesView { yes, no: 1.0 - yes }
    }

    pub fn quote_buy(&self, market_id: String, is_yes: bool, shares: u64) -> QuoteView {
        require!(shares > 0, "Amount cannot be zero");
        let m = self.market(&market_id);
        let q = pricing::quote_buy(m.yes_shares, m.no_shares, m.lmsr_b, is_yes, shares, m.share_value.0, self.fee_bps);
        QuoteView { base: U128(q.base), fee: U128(q.fee), total: U128(q.total) }
    }

    pub fn quote_sell(&self, market_id: String, is_yes: bool, shares: u64) -> QuoteView {
        require!(shares > 0, "Amount cannot be zero");
        let m = self.market(&market_id);
        let q = pricing::quote_sell(m.yes_shares, m.no_shares, m.lmsr_b, is_yes, shares, m.share_value.0, self.fee_bps);
        QuoteView { base: U128(q.base), fee: U128(q.fee), total: U128(q.total) }
    }

    pub fn get_bettor(&self, account_id: AccountId) -> Option<Bettor> {
        self.bettors.get(&account_id).cloned()
    }

    pub fn get_balance(&self, account_id: AccountId) -> U128 {
        self.bettors.get(&account_id).map(|b| b.balance).unwrap_or(U128(0))
    }

    pub fn get_position(&self, market_id: String, account_id: AccountId) -> Option<PositionView> {
        self.positions
            .get(&(market_id.clone(), account_id.clone()))
            .map(|p| to_view(market_id, account_id, p))
    }

    /// All positions of an account (markets it has traded in).
    pub fn get_positions(&self, account_id: AccountId) -> Vec<PositionView> {
        let Some(b) = self.bettors.get(&account_id) else { return vec![] };
        b.markets
            .iter()
            .filter_map(|mid| {
                self.positions
                    .get(&(mid.clone(), account_id.clone()))
                    .map(|p| to_view(mid.clone(), account_id.clone(), p))
            })
            .collect()
    }
}

fn to_view(market_id: String, account_id: AccountId, p: &Position) -> PositionView {
    PositionView {
        market_id,
        account_id,
        yes_shares: p.yes_shares,
        no_shares: p.no_shares,
        spent: p.spent,
        earned: p.earned,
    }
}

fn transfer_succeeded() -> bool {
    near_sdk::is_promise_success()
}

impl Contract {
    fn is_admin(&self, a: &AccountId) -> bool {
        self.admins.contains(a)
    }

    fn assert_admin(&self) {
        require!(self.is_admin(&env::predecessor_account_id()), "you are not authorized to do this (admin only)");
    }

    /// The account an action applies to: `on_behalf_of` if the caller is
    /// the operator, otherwise the caller itself.
    fn actor(&self, on_behalf_of: Option<AccountId>) -> AccountId {
        let caller = env::predecessor_account_id();
        match on_behalf_of {
            Some(a) => {
                require!(
                    self.operator.as_ref() == Some(&caller),
                    "Only the operator may use on_behalf_of"
                );
                a
            }
            None => caller,
        }
    }

    fn active_bettor(&self, who: &AccountId) -> Bettor {
        let b = self
            .bettors
            .get(who)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Bettor not found; deposit first"));
        require!(!b.is_banned, "Bettor is banned");
        b
    }

    fn market(&self, id: &String) -> &Market {
        self.markets.get(id).unwrap_or_else(|| env::panic_str("Market not found"))
    }

    fn market_mut(&mut self, id: &String) -> &mut Market {
        self.markets.get_mut(id).unwrap_or_else(|| env::panic_str("Market not found"))
    }
}

#[cfg(test)]
mod tests;
