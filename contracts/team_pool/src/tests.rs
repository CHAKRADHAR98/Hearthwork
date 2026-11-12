use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_700_000_000;
const NEAR: u128 = ONE_NEAR;

fn owner() -> AccountId {
    accounts(0)
}
fn operator() -> AccountId {
    accounts(1)
}
fn alice() -> AccountId {
    accounts(2)
}
fn bob() -> AccountId {
    accounts(3)
}

fn ctx(predecessor: AccountId, deposit: u128, now_sec: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("pool.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(now_sec * SEC);
    testing_env!(b.build());
}

fn setup() -> Contract {
    ctx(owner(), 0, T0);
    Contract::new(owner(), Some(operator()))
}

fn pool_with(c: &mut Contract, realm: &str, amount: u128) {
    ctx(alice(), 0, T0);
    c.initialize_pool(realm.into(), None);
    ctx(bob(), amount, T0);
    c.deposit(realm.into(), None);
}

#[test]
fn init_pool_first_caller_is_authority() {
    let mut c = setup();
    ctx(alice(), 0, T0);
    let p = c.initialize_pool("realm-1".into(), None);
    assert_eq!(p.authority, alice());
    assert_eq!(c.get_pool("realm-1".into()).unwrap().authority, alice());
    assert_eq!(c.list_pools(None, None).len(), 1);
    assert_eq!(c.get_config().pool_count, 1);
}

#[test]
#[should_panic(expected = "Pool already exists")]
fn init_pool_twice_fails() {
    let mut c = setup();
    ctx(alice(), 0, T0);
    c.initialize_pool("r".into(), None);
    ctx(bob(), 0, T0);
    c.initialize_pool("r".into(), None);
}

#[test]
#[should_panic(expected = "realm_id cannot be empty")]
fn init_pool_empty_id() {
    let mut c = setup();
    c.initialize_pool("".into(), None);
}

#[test]
#[should_panic(expected = "realm_id is too long")]
fn init_pool_long_id() {
    let mut c = setup();
    c.initialize_pool("x".repeat(51), None);
}

#[test]
fn operator_inits_on_behalf() {
    let mut c = setup();
    ctx(operator(), 0, T0);
    let p = c.initialize_pool("r".into(), Some(bob()));
    assert_eq!(p.authority, bob());
}

#[test]
#[should_panic(expected = "Only the operator may use on_behalf_of")]
fn non_operator_on_behalf_rejected() {
    let mut c = setup();
    ctx(alice(), 0, T0);
    c.initialize_pool("r".into(), Some(bob()));
}

#[test]
fn deposit_updates_totals() {
    let mut c = setup();
    pool_with(&mut c, "r", 5 * NEAR);
    ctx(operator(), NEAR, T0);
    let bal = c.deposit("r".into(), Some(alice()));
    assert_eq!(bal.0, 6 * NEAR);
    let p = c.get_pool("r".into()).unwrap();
    assert_eq!(p.total_deposited.0, 6 * NEAR);
    assert_eq!(p.balance.0, 6 * NEAR);
}

#[test]
#[should_panic(expected = "Deposit amount is too small")]
fn deposit_minimum() {
    let mut c = setup();
    pool_with(&mut c, "r", MIN_DEPOSIT_YOCTO - 1);
}

#[test]
fn deposit_exact_minimum_ok() {
    let mut c = setup();
    pool_with(&mut c, "r", MIN_DEPOSIT_YOCTO);
    assert_eq!(c.get_pool("r".into()).unwrap().balance.0, MIN_DEPOSIT_YOCTO);
}

#[test]
#[should_panic(expected = "Pool not found")]
fn deposit_unknown_pool() {
    let mut c = setup();
    ctx(alice(), NEAR, T0);
    c.deposit("nope".into(), None);
}

#[test]
fn withdraw_within_cap() {
    let mut c = setup();
    pool_with(&mut c, "r", 50 * NEAR);
    ctx(alice(), 0, T0 + 10);
    let _ = c.withdraw("r".into(), U128(4 * NEAR), None, None);
    let _ = c.withdraw("r".into(), U128(6 * NEAR), None, None);
    let p = c.get_pool("r".into()).unwrap();
    assert_eq!(p.balance.0, 40 * NEAR);
    assert_eq!(p.total_withdrawn.0, 10 * NEAR);
    assert_eq!(c.get_remaining_daily_limit("r".into(), alice()).0, 0);
    // other accounts have their own cap
    assert_eq!(c.get_remaining_daily_limit("r".into(), bob()).0, 10 * NEAR);
    let lim = c.get_withdraw_limit("r".into(), alice());
    assert_eq!(lim.window_resets_at_sec, T0 + 10 + DAILY_WINDOW_SECONDS);
}

#[test]
#[should_panic(expected = "Exceeds daily withdrawal limit")]
fn withdraw_over_cap_fails() {
    let mut c = setup();
    pool_with(&mut c, "r", 50 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(7 * NEAR), None, None);
    let _ = c.withdraw("r".into(), U128(3 * NEAR + 1), None, None);
}

#[test]
#[should_panic(expected = "Exceeds daily withdrawal limit")]
fn withdraw_over_cap_single() {
    let mut c = setup();
    pool_with(&mut c, "r", 50 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(10 * NEAR + 1), None, None);
}

#[test]
fn window_resets_after_24h() {
    let mut c = setup();
    pool_with(&mut c, "r", 50 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(10 * NEAR), None, None);

    // still blocked just before the window ends
    ctx(alice(), 0, T0 + DAILY_WINDOW_SECONDS - 1);
    assert_eq!(c.get_remaining_daily_limit("r".into(), alice()).0, 0);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.withdraw("r".into(), U128(1), None, None);
    }));
    assert!(r.is_err());

    // reset at 24h
    ctx(alice(), 0, T0 + DAILY_WINDOW_SECONDS);
    assert_eq!(c.get_remaining_daily_limit("r".into(), alice()).0, 10 * NEAR);
    let _ = c.withdraw("r".into(), U128(10 * NEAR), None, None);
    let rec = c.get_withdrawal_record("r".into(), alice()).unwrap();
    assert_eq!(rec.window_start_sec, T0 + DAILY_WINDOW_SECONDS);
    assert_eq!(rec.withdrawn_in_window.0, 10 * NEAR);
    assert_eq!(c.get_pool("r".into()).unwrap().balance.0, 30 * NEAR);
}

#[test]
fn caps_are_per_pool() {
    let mut c = setup();
    pool_with(&mut c, "r1", 20 * NEAR);
    ctx(alice(), 0, T0);
    c.initialize_pool("r2".into(), None);
    ctx(bob(), 20 * NEAR, T0);
    c.deposit("r2".into(), None);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r1".into(), U128(10 * NEAR), None, None);
    let _ = c.withdraw("r2".into(), U128(10 * NEAR), None, None);
}

#[test]
#[should_panic(expected = "Insufficient pool balance")]
fn withdraw_more_than_pool() {
    let mut c = setup();
    pool_with(&mut c, "r", NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(2 * NEAR), None, None);
}

#[test]
#[should_panic(expected = "Withdraw amount must be greater than zero")]
fn withdraw_zero() {
    let mut c = setup();
    pool_with(&mut c, "r", NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(0), None, None);
}

#[test]
fn operator_withdraws_on_behalf_counts_against_user_cap() {
    let mut c = setup();
    pool_with(&mut c, "r", 50 * NEAR);
    ctx(operator(), 0, T0);
    let _ = c.withdraw("r".into(), U128(8 * NEAR), Some(alice()), None);
    assert_eq!(c.get_remaining_daily_limit("r".into(), alice()).0, 2 * NEAR);
    assert_eq!(c.get_remaining_daily_limit("r".into(), operator()).0, 10 * NEAR);
}

#[test]
fn failed_transfer_restores_state() {
    let mut c = setup();
    pool_with(&mut c, "r", 20 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(5 * NEAR), None, None);
    assert_eq!(c.get_pool("r".into()).unwrap().balance.0, 15 * NEAR);

    let mut b = VMContextBuilder::new();
    b.current_account_id("pool.testnet".parse().unwrap())
        .predecessor_account_id("pool.testnet".parse().unwrap())
        .block_timestamp(T0 * SEC);
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    assert!(!c.on_withdraw("r".into(), alice(), U128(5 * NEAR), T0));
    let p = c.get_pool("r".into()).unwrap();
    assert_eq!(p.balance.0, 20 * NEAR);
    assert_eq!(p.total_withdrawn.0, 0);
    assert_eq!(c.get_remaining_daily_limit("r".into(), alice()).0, 10 * NEAR);
}

#[test]
fn successful_transfer_callback_keeps_state() {
    let mut c = setup();
    pool_with(&mut c, "r", 20 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw("r".into(), U128(5 * NEAR), None, None);
    let mut b = VMContextBuilder::new();
    b.current_account_id("pool.testnet".parse().unwrap())
        .predecessor_account_id("pool.testnet".parse().unwrap())
        .block_timestamp(T0 * SEC);
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(c.on_withdraw("r".into(), alice(), U128(5 * NEAR), T0));
    assert_eq!(c.get_pool("r".into()).unwrap().balance.0, 15 * NEAR);
}

#[test]
#[should_panic(expected = "Only the owner can set the operator")]
fn only_owner_sets_operator() {
    let mut c = setup();
    ctx(alice(), 0, T0);
    c.set_operator(Some(alice()));
}
