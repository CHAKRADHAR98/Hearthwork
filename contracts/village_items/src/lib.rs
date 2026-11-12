//! Hearthwork village goods — a NEP-245 multi-token contract.
//!
//! Every good in the village (wheat, bread, iron, tools, fish, ...) and the
//! village currency (`coin`) is a token id inside this single contract.
//!
//! Two ways to move tokens:
//! * The standard NEP-245 interface (`mt_transfer`, `mt_batch_transfer`,
//!   `mt_transfer_call`, ...) for any NEAR account that holds its own keys.
//! * Game methods (`mint`, `burn`, `craft`, `trade`, `game_transfer`) that only
//!   an *operator* (the Hearthwork game server) may call. Players sign in with
//!   Google and never see a key or a gas prompt, so the server executes their
//!   moves; shopkeeper NPCs each own a real NEAR account whose balance lives here.

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    assert_one_yocto, env, ext_contract, log, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, PromiseOrValue,
};

pub type TokenId = String;

pub const COIN: &str = "coin";
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(15);
const GAS_FOR_MT_TRANSFER_CALL: Gas = Gas::from_tgas(40);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Operators,
    Tokens,
    Balances,
}

/// Static info about one kind of good.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct TokenInfo {
    pub token_id: TokenId,
    pub name: String,
    pub symbol: String,
    /// Emoji or data URI shown in the UI.
    pub icon: Option<String>,
    pub decimals: u8,
    pub supply: U128,
}

/// NEP-245 `Token` view.
#[near(serializers = [json])]
pub struct Token {
    pub token_id: TokenId,
    pub owner_id: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
pub struct MtTokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
}

#[near(serializers = [json])]
pub struct MtTokenMetadataAll {
    pub base: MtContractMetadata,
    pub token: MtTokenMetadata,
}

#[near(serializers = [json])]
pub struct Balance {
    pub token_id: TokenId,
    pub amount: U128,
}

#[near(serializers = [json])]
pub struct DeltaEntry {
    pub account_id: AccountId,
    pub token_id: TokenId,
    pub amount: U128,
    /// true = mint to the account, false = burn from it
    pub increase: bool,
}

#[near(serializers = [json])]
pub struct ItemAmount {
    pub token_id: TokenId,
    pub amount: U128,
}

#[ext_contract(ext_mt_receiver)]
pub trait MultiTokenReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[ext_contract(ext_self)]
pub trait SelfResolver {
    fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Vec<(AccountId, u64, U128)>>>>,
    ) -> Vec<U128>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    operators: IterableSet<AccountId>,
    tokens: IterableMap<TokenId, TokenInfo>,
    balances: LookupMap<(TokenId, AccountId), u128>,
}

#[near]
impl Contract {
    /// `operator_id` is the game server account allowed to run game methods.
    #[init]
    pub fn new(owner_id: AccountId, operator_id: AccountId) -> Self {
        let mut c = Self {
            owner_id,
            operators: IterableSet::new(StorageKey::Operators),
            tokens: IterableMap::new(StorageKey::Tokens),
            balances: LookupMap::new(StorageKey::Balances),
        };
        c.operators.insert(operator_id);
        c.add_token(COIN.into(), "Village Coin".into(), "COIN".into(), Some("🪙".into()));
        c
    }

    // ───────────────────────── admin ─────────────────────────

    pub fn add_operator(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.operators.insert(account_id);
    }

    pub fn remove_operator(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.operators.remove(&account_id);
    }

    /// Register a new kind of good. Owner or operator.
    pub fn register_token(
        &mut self,
        token_id: TokenId,
        name: String,
        symbol: String,
        icon: Option<String>,
    ) {
        self.assert_operator_or_owner();
        require!(!self.tokens.contains_key(&token_id), "Token already registered");
        self.add_token(token_id, name, symbol, icon);
    }

    // ───────────────────── game methods (operator) ─────────────────────

    /// Create goods out of thin air: a player gathered wheat, a farmer harvested, etc.
    pub fn mint(&mut self, account_id: AccountId, token_id: TokenId, amount: U128, memo: Option<String>) {
        self.assert_operator();
        self.internal_mint(&account_id, &token_id, amount.0);
        emit("mt_mint", json!([{ "owner_id": account_id, "token_ids": [token_id], "amounts": [amount], "memo": memo }]));
    }

    /// Destroy goods: bread was eaten, a tool broke.
    pub fn burn(&mut self, account_id: AccountId, token_id: TokenId, amount: U128, memo: Option<String>) {
        self.assert_operator();
        self.internal_burn(&account_id, &token_id, amount.0);
        emit("mt_burn", json!([{ "owner_id": account_id, "token_ids": [token_id], "amounts": [amount], "memo": memo }]));
    }

    /// Atomically turn inputs into outputs (e.g. 2 wheat -> 1 bread).
    pub fn craft(&mut self, account_id: AccountId, inputs: Vec<ItemAmount>, outputs: Vec<ItemAmount>, memo: Option<String>) {
        self.assert_operator();
        for i in &inputs {
            self.internal_burn(&account_id, &i.token_id, i.amount.0);
        }
        for o in &outputs {
            self.internal_mint(&account_id, &o.token_id, o.amount.0);
        }
        let ids = |v: &Vec<ItemAmount>| v.iter().map(|x| x.token_id.clone()).collect::<Vec<_>>();
        let amts = |v: &Vec<ItemAmount>| v.iter().map(|x| x.amount).collect::<Vec<_>>();
        emit("mt_burn", json!([{ "owner_id": account_id, "token_ids": ids(&inputs), "amounts": amts(&inputs), "memo": memo }]));
        emit("mt_mint", json!([{ "owner_id": account_id, "token_ids": ids(&outputs), "amounts": amts(&outputs), "memo": memo }]));
    }

    /// Atomic swap: `buyer` pays `price` coins to `seller`, `seller` hands `amount` of `token_id` to `buyer`.
    /// Either both legs happen or the call panics and nothing moves.
    pub fn trade(
        &mut self,
        buyer_id: AccountId,
        seller_id: AccountId,
        token_id: TokenId,
        amount: U128,
        price: U128,
        memo: Option<String>,
    ) {
        self.assert_operator();
        require!(token_id != COIN, "Cannot trade coin for coin");
        require!(buyer_id != seller_id, "Buyer and seller must differ");
        self.internal_transfer(&buyer_id, &seller_id, COIN, price.0);
        self.internal_transfer(&seller_id, &buyer_id, &token_id, amount.0);
        emit(
            "mt_transfer",
            json!([
                { "old_owner_id": buyer_id, "new_owner_id": seller_id, "token_ids": [COIN], "amounts": [price], "memo": memo },
                { "old_owner_id": seller_id, "new_owner_id": buyer_id, "token_ids": [token_id], "amounts": [amount], "memo": memo }
            ]),
        );
    }

    /// Generic operator transfer: wages, investments, gifts between village accounts.
    pub fn game_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        memo: Option<String>,
    ) {
        self.assert_operator();
        require!(token_ids.len() == amounts.len(), "token_ids and amounts length mismatch");
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.internal_transfer(&sender_id, &receiver_id, t, a.0);
        }
        emit("mt_transfer", json!([{ "old_owner_id": sender_id, "new_owner_id": receiver_id, "token_ids": token_ids, "amounts": amounts, "memo": memo }]));
    }

    /// Settle a batch of balance changes from the village simulation (shopkeeper production,
    /// townsfolk purchases, upkeep...). Increases are applied first so a batch that is valid as a
    /// whole never fails on ordering. Emits NEP-245 mint/burn events with the memo.
    pub fn apply_deltas(&mut self, entries: Vec<DeltaEntry>, memo: Option<String>) {
        self.assert_operator();
        let (ups, downs): (Vec<_>, Vec<_>) = entries.into_iter().partition(|e| e.increase);
        let mut minted = Vec::new();
        let mut burned = Vec::new();
        for e in ups {
            self.internal_mint(&e.account_id, &e.token_id, e.amount.0);
            minted.push(json!({ "owner_id": e.account_id, "token_ids": [e.token_id], "amounts": [e.amount], "memo": memo }));
        }
        for e in downs {
            self.internal_burn(&e.account_id, &e.token_id, e.amount.0);
            burned.push(json!({ "owner_id": e.account_id, "token_ids": [e.token_id], "amounts": [e.amount], "memo": memo }));
        }
        if !minted.is_empty() {
            emit("mt_mint", json!(minted));
        }
        if !burned.is_empty() {
            emit("mt_burn", json!(burned));
        }
    }

    // ───────────────────────── NEP-245 core ─────────────────────────

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        self.mt_batch_transfer(receiver_id, vec![token_id], vec![amount], approval.map(|a| vec![Some(a)]), memo);
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approvals.is_none(), "Approvals are not supported");
        let sender_id = env::predecessor_account_id();
        self.internal_batch_transfer(&sender_id, &receiver_id, &token_ids, &amounts);
        emit("mt_transfer", json!([{ "old_owner_id": sender_id, "new_owner_id": receiver_id, "token_ids": token_ids, "amounts": amounts, "memo": memo }]));
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        self.mt_batch_transfer_call(receiver_id, vec![token_id], vec![amount], approval.map(|a| vec![Some(a)]), memo, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(approvals.is_none(), "Approvals are not supported");
        require!(env::prepaid_gas() > GAS_FOR_MT_TRANSFER_CALL.saturating_add(GAS_FOR_RESOLVE), "More gas is required");
        let sender_id = env::predecessor_account_id();
        self.internal_batch_transfer(&sender_id, &receiver_id, &token_ids, &amounts);
        emit("mt_transfer", json!([{ "old_owner_id": sender_id, "new_owner_id": receiver_id, "token_ids": token_ids, "amounts": amounts, "memo": memo }]));

        let previous_owner_ids = vec![sender_id.clone(); token_ids.len()];
        ext_mt_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_MT_TRANSFER_CALL)
            .mt_on_transfer(sender_id, previous_owner_ids.clone(), token_ids.clone(), amounts.clone(), msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .mt_resolve_transfer(previous_owner_ids, receiver_id, token_ids, amounts, None),
            )
            .into()
    }

    /// Refund whatever the receiver reports as unused. Returns the amounts actually kept.
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        #[allow(unused_variables)] approvals: Option<Vec<Option<Vec<(AccountId, u64, U128)>>>>,
    ) -> Vec<U128> {
        let unused: Vec<U128> = match env::promise_result_checked(0, 16 * 1024) {
            Ok(v) => match serde_json::from_slice::<Vec<U128>>(&v) {
                Ok(u) if u.len() == amounts.len() => u.into_iter().zip(amounts.iter()).map(|(u, a)| U128(u.0.min(a.0))).collect(),
                _ => amounts.clone(),
            },
            Err(_) => amounts.clone(),
        };
        let mut kept = Vec::with_capacity(amounts.len());
        for i in 0..token_ids.len() {
            let refund = unused[i].0.min(self.balance(&token_ids[i], &receiver_id));
            if refund > 0 {
                self.internal_transfer(&receiver_id, &previous_owner_ids[i], &token_ids[i], refund);
                emit("mt_transfer", json!([{ "old_owner_id": receiver_id, "new_owner_id": previous_owner_ids[i], "token_ids": [token_ids[i]], "amounts": [U128(refund)], "memo": "refund" }]));
            }
            kept.push(U128(amounts[i].0 - refund));
        }
        kept
    }

    // ───────────────────────── NEP-245 views ─────────────────────────

    pub fn mt_token(&self, token_ids: Vec<TokenId>) -> Vec<Option<Token>> {
        token_ids
            .into_iter()
            .map(|t| self.tokens.get(&t).map(|_| Token { token_id: t, owner_id: None }))
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: TokenId) -> U128 {
        U128(self.balance(&token_id, &account_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<TokenId>) -> Vec<U128> {
        token_ids.iter().map(|t| U128(self.balance(t, &account_id))).collect()
    }

    pub fn mt_supply(&self, token_id: TokenId) -> Option<U128> {
        self.tokens.get(&token_id).map(|t| t.supply)
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<TokenId>) -> Vec<Option<U128>> {
        token_ids.iter().map(|t| self.mt_supply(t.clone())).collect()
    }

    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        contract_metadata()
    }

    pub fn mt_metadata_token_all(&self, token_ids: Vec<TokenId>) -> Vec<Option<MtTokenMetadataAll>> {
        token_ids
            .iter()
            .map(|t| {
                self.tokens.get(t).map(|info| MtTokenMetadataAll {
                    base: contract_metadata(),
                    token: MtTokenMetadata { title: Some(info.name.clone()), description: Some(info.symbol.clone()), media: info.icon.clone() },
                })
            })
            .collect()
    }

    /// Enumeration: all registered goods.
    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        let from = from_index.map(|f| f.0 as usize).unwrap_or(0);
        self.tokens
            .keys()
            .skip(from)
            .take(limit.unwrap_or(100) as usize)
            .map(|t| Token { token_id: t.clone(), owner_id: None })
            .collect()
    }

    // ───────────────────────── game views ─────────────────────────

    pub fn list_tokens(&self) -> Vec<TokenInfo> {
        self.tokens.values().cloned().collect()
    }

    /// Every non-zero balance an account holds (the village has a small, fixed set of goods).
    pub fn balances_of(&self, account_id: AccountId) -> Vec<Balance> {
        self.tokens
            .keys()
            .filter_map(|t| {
                let b = self.balance(t, &account_id);
                (b > 0).then(|| Balance { token_id: t.clone(), amount: U128(b) })
            })
            .collect()
    }

    pub fn get_operators(&self) -> Vec<AccountId> {
        self.operators.iter().cloned().collect()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

// ───────────────────────── internals ─────────────────────────

impl Contract {
    fn add_token(&mut self, token_id: TokenId, name: String, symbol: String, icon: Option<String>) {
        require!(!token_id.is_empty() && token_id.len() <= 32, "Invalid token id");
        self.tokens.insert(token_id.clone(), TokenInfo { token_id, name, symbol, icon, decimals: 0, supply: U128(0) });
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner can do this");
    }

    fn assert_operator(&self) {
        require!(self.operators.contains(&env::predecessor_account_id()), "Only a game operator can do this");
    }

    fn assert_operator_or_owner(&self) {
        let p = env::predecessor_account_id();
        require!(p == self.owner_id || self.operators.contains(&p), "Only the owner or an operator can do this");
    }

    fn balance(&self, token_id: &str, account_id: &AccountId) -> u128 {
        self.balances.get(&(token_id.to_string(), account_id.clone())).copied().unwrap_or(0)
    }

    fn set_balance(&mut self, token_id: &str, account_id: &AccountId, amount: u128) {
        let key = (token_id.to_string(), account_id.clone());
        if amount == 0 {
            self.balances.remove(&key);
        } else {
            self.balances.insert(key, amount);
        }
    }

    fn internal_mint(&mut self, account_id: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "Amount must be positive");
        let mut info = self.tokens.get(token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        info.supply = U128(info.supply.0.checked_add(amount).unwrap_or_else(|| env::panic_str("Supply overflow")));
        self.tokens.insert(token_id.to_string(), info);
        let b = self.balance(token_id, account_id);
        self.set_balance(token_id, account_id, b + amount);
    }

    fn internal_burn(&mut self, account_id: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "Amount must be positive");
        let b = self.balance(token_id, account_id);
        if b < amount {
            env::panic_str(&format!("{} has {} {}, needs {}", account_id, b, token_id, amount));
        }
        self.set_balance(token_id, account_id, b - amount);
        let mut info = self.tokens.get(token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        info.supply = U128(info.supply.0 - amount);
        self.tokens.insert(token_id.to_string(), info);
    }

    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "Amount must be positive");
        require!(from != to, "Sender and receiver must differ");
        require!(self.tokens.contains_key(token_id), "Unknown token");
        let fb = self.balance(token_id, from);
        if fb < amount {
            env::panic_str(&format!("{} has {} {}, needs {}", from, fb, token_id, amount));
        }
        self.set_balance(token_id, from, fb - amount);
        let tb = self.balance(token_id, to);
        self.set_balance(token_id, to, tb.checked_add(amount).unwrap_or_else(|| env::panic_str("Balance overflow")));
    }

    fn internal_batch_transfer(&mut self, from: &AccountId, to: &AccountId, token_ids: &[TokenId], amounts: &[U128]) {
        require!(!token_ids.is_empty(), "No tokens given");
        require!(token_ids.len() == amounts.len(), "token_ids and amounts length mismatch");
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.internal_transfer(from, to, t, a.0);
        }
    }
}

fn contract_metadata() -> MtContractMetadata {
    MtContractMetadata { spec: "mt-1.0.0".into(), name: "Hearthwork Village Goods".into() }
}

/// NEP-297 event log for NEP-245.
fn emit(event: &str, data: serde_json::Value) {
    log!("EVENT_JSON:{}", json!({ "standard": "nep245", "version": "1.0.0", "event": event, "data": data }));
}

#[allow(dead_code)]
const _ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(predecessor: &str) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("items.test")).predecessor_account_id(acc(predecessor));
        b
    }

    fn setup() -> Contract {
        testing_env!(ctx("owner.test").build());
        let mut c = Contract::new(acc("owner.test"), acc("server.test"));
        c.register_token("wheat".into(), "Wheat".into(), "WHEAT".into(), Some("🌾".into()));
        c.register_token("bread".into(), "Bread".into(), "BREAD".into(), Some("🍞".into()));
        c
    }

    #[test]
    fn mint_and_balances() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("alice.test"), "wheat".into(), U128(10), None);
        c.mint(acc("alice.test"), COIN.into(), U128(50), None);
        assert_eq!(c.mt_balance_of(acc("alice.test"), "wheat".into()).0, 10);
        assert_eq!(c.mt_supply("wheat".into()).unwrap().0, 10);
        assert_eq!(c.balances_of(acc("alice.test")).len(), 2);
        assert!(get_logs()[0].starts_with("EVENT_JSON:"));
    }

    #[test]
    #[should_panic(expected = "Only a game operator")]
    fn only_operator_mints() {
        let mut c = setup();
        testing_env!(ctx("alice.test").build());
        c.mint(acc("alice.test"), "wheat".into(), U128(10), None);
    }

    #[test]
    fn craft_burns_and_mints() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("baker.test"), "wheat".into(), U128(4), None);
        c.craft(
            acc("baker.test"),
            vec![ItemAmount { token_id: "wheat".into(), amount: U128(2) }],
            vec![ItemAmount { token_id: "bread".into(), amount: U128(1) }],
            Some("bake".into()),
        );
        assert_eq!(c.mt_balance_of(acc("baker.test"), "wheat".into()).0, 2);
        assert_eq!(c.mt_balance_of(acc("baker.test"), "bread".into()).0, 1);
        assert_eq!(c.mt_supply("wheat".into()).unwrap().0, 2);
    }

    #[test]
    fn trade_is_atomic_swap() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("baker.test"), "bread".into(), U128(5), None);
        c.mint(acc("alice.test"), COIN.into(), U128(30), None);
        c.trade(acc("alice.test"), acc("baker.test"), "bread".into(), U128(2), U128(12), None);
        assert_eq!(c.mt_balance_of(acc("alice.test"), "bread".into()).0, 2);
        assert_eq!(c.mt_balance_of(acc("alice.test"), COIN.into()).0, 18);
        assert_eq!(c.mt_balance_of(acc("baker.test"), COIN.into()).0, 12);
        assert_eq!(c.mt_balance_of(acc("baker.test"), "bread".into()).0, 3);
    }

    #[test]
    #[should_panic(expected = "has 5 coin, needs 12")]
    fn trade_fails_when_buyer_is_broke() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("baker.test"), "bread".into(), U128(5), None);
        c.mint(acc("alice.test"), COIN.into(), U128(5), None);
        c.trade(acc("alice.test"), acc("baker.test"), "bread".into(), U128(2), U128(12), None);
    }

    #[test]
    fn user_mt_transfer() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("alice.test"), "wheat".into(), U128(10), None);
        testing_env!(ctx("alice.test").attached_deposit(NearToken::from_yoctonear(1)).build());
        c.mt_transfer(acc("bob.test"), "wheat".into(), U128(4), None, None);
        assert_eq!(c.mt_balance_of(acc("bob.test"), "wheat".into()).0, 4);
        assert_eq!(c.mt_balance_of(acc("alice.test"), "wheat".into()).0, 6);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn mt_transfer_needs_one_yocto() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("alice.test"), "wheat".into(), U128(10), None);
        testing_env!(ctx("alice.test").build());
        c.mt_transfer(acc("bob.test"), "wheat".into(), U128(4), None, None);
    }

    #[test]
    fn apply_deltas_settles_batch() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("baker.test"), "wheat".into(), U128(2), None);
        c.apply_deltas(
            vec![
                DeltaEntry { account_id: acc("baker.test"), token_id: "wheat".into(), amount: U128(3), increase: false },
                DeltaEntry { account_id: acc("baker.test"), token_id: "wheat".into(), amount: U128(5), increase: true },
                DeltaEntry { account_id: acc("baker.test"), token_id: "bread".into(), amount: U128(3), increase: true },
            ],
            Some("day 1".into()),
        );
        assert_eq!(c.mt_balance_of(acc("baker.test"), "wheat".into()).0, 4);
        assert_eq!(c.mt_balance_of(acc("baker.test"), "bread".into()).0, 3);
    }

    #[test]
    fn game_transfer_moves_batches() {
        let mut c = setup();
        testing_env!(ctx("server.test").build());
        c.mint(acc("smith.test"), COIN.into(), U128(100), None);
        c.mint(acc("smith.test"), "wheat".into(), U128(3), None);
        c.game_transfer(acc("smith.test"), acc("alice.test"), vec![COIN.into(), "wheat".into()], vec![U128(40), U128(3)], Some("wages".into()));
        assert_eq!(c.mt_batch_balance_of(acc("alice.test"), vec![COIN.into(), "wheat".into()]), vec![U128(40), U128(3)]);
    }
}
