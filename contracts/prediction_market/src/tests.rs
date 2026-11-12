use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_700_000_000; // seconds
const NEAR: u128 = ONE_NEAR;

fn admin() -> AccountId {
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
    b.current_account_id("market.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(now_sec * SEC);
    testing_env!(b.build());
}

fn setup(fee_bps: u16) -> Contract {
    ctx(admin(), 0, T0);
    Contract::new(vec![admin()], Some(operator()), fee_bps, None)
}

fn make_market(c: &mut Contract, id: &str, b: u64) {
    let req = c.get_required_liquidity(b).0;
    ctx(admin(), req, T0);
    c.create_market(id.into(), "Will it rain?".into(), "desc".into(), b, T0 + 3600, None);
}

fn fund(c: &mut Contract, who: AccountId, amount: u128) {
    ctx(who, amount, T0);
    c.deposit(None);
}

#[test]
fn init_and_config() {
    let c = setup(100);
    let cfg = c.get_config();
    assert_eq!(cfg.admins, vec![admin()]);
    assert_eq!(cfg.operator, Some(operator()));
    assert_eq!(cfg.fee_bps, 100);
    assert_eq!(cfg.default_share_value.0, NEAR);
}

#[test]
#[should_panic(expected = "fee_bps must be < 10000")]
fn init_rejects_bad_fee() {
    ctx(admin(), 0, T0);
    Contract::new(vec![admin()], None, 10_000, None);
}

#[test]
fn create_market_works_and_refunds() {
    let mut c = setup(100);
    let req = c.get_required_liquidity(10).0;
    // ~ 10 * ln2 NEAR
    assert!(req > 6 * NEAR && req < 7 * NEAR);
    ctx(admin(), req + NEAR, T0);
    let m = c.create_market("m1".into(), "Q".into(), "d".into(), 10, T0 + 100, Some(bob()));
    assert_eq!(m.collateral.0, req);
    assert_eq!(m.creator, bob());
    assert_eq!(m.status, MarketStatus::Active);
    assert_eq!(c.list_markets(None, None).len(), 1);
    assert!(c.get_market("m1".into()).is_some());
    let p = c.get_prices("m1".into());
    assert!((p.yes - 0.5).abs() < 1e-12);
}

#[test]
#[should_panic(expected = "Attach at least")]
fn create_market_requires_liquidity() {
    let mut c = setup(100);
    ctx(admin(), NEAR, T0);
    c.create_market("m1".into(), "Q".into(), "d".into(), 10, T0 + 100, None);
}

#[test]
#[should_panic(expected = "Only an admin or the operator")]
fn create_market_rejects_random_user() {
    let mut c = setup(100);
    ctx(alice(), 10 * NEAR, T0);
    c.create_market("m1".into(), "Q".into(), "d".into(), 10, T0 + 100, None);
}

#[test]
#[should_panic(expected = "Market already exists")]
fn create_market_duplicate() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    make_market(&mut c, "m1", 10);
}

#[test]
fn buy_updates_state_and_fees() {
    let mut c = setup(100); // 1%
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);

    let quote = c.quote_buy("m1".into(), true, 3);
    ctx(alice(), 0, T0 + 10);
    let q = c.buy_shares("m1".into(), true, 3, None, None);
    assert_eq!(q.total.0, quote.total.0);
    assert_eq!(q.fee.0, q.base.0 / 100);

    let m = c.get_market("m1".into()).unwrap();
    assert_eq!(m.yes_shares, 3);
    assert_eq!(m.no_shares, 0);
    assert_eq!(m.collateral.0, m.initial_deposit.0 + q.base.0);
    assert_eq!(c.get_config().treasury.0, q.fee.0);
    assert_eq!(c.get_balance(alice()).0, 10 * NEAR - q.total.0);

    let pos = c.get_position("m1".into(), alice()).unwrap();
    assert_eq!(pos.yes_shares, 3);
    assert_eq!(pos.spent.0, q.total.0);
    assert_eq!(c.get_positions(alice()).len(), 1);

    // price moved toward YES
    assert!(c.get_prices("m1".into()).yes > 0.5);
    // bettor net profit is negative cost so far
    assert_eq!(c.get_bettor(alice()).unwrap().net_profit.0, -(q.total.0 as i128));
}

#[test]
#[should_panic(expected = "Not enough balance")]
fn buy_requires_balance() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), NEAR / 10);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 5, None, None);
}

#[test]
#[should_panic(expected = "slippage")]
fn buy_slippage_guard() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 3, Some(U128(1)), None);
}

#[test]
#[should_panic(expected = "Market trading has closed")]
fn buy_after_deadline_fails() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0 + 3600);
    c.buy_shares("m1".into(), true, 1, None, None);
}

#[test]
fn sell_returns_less_than_paid() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    let b = c.buy_shares("m1".into(), false, 4, None, None);
    let quote = c.quote_sell("m1".into(), false, 4);
    let s = c.sell_shares("m1".into(), false, 4, None, None);
    assert_eq!(s.total.0, quote.total.0);
    assert!(s.total.0 < b.total.0);
    let m = c.get_market("m1".into()).unwrap();
    assert_eq!(m.no_shares, 0);
    // collateral back to (approximately, never below) the initial subsidy
    assert!(m.collateral.0 >= m.initial_deposit.0);
    assert!(m.collateral.0 - m.initial_deposit.0 < 10_000_000_000_000);
    assert_eq!(c.get_config().treasury.0, b.fee.0 + s.fee.0);
    assert_eq!(c.get_balance(alice()).0, 10 * NEAR - b.total.0 + s.total.0);
    let pos = c.get_position("m1".into(), alice()).unwrap();
    assert_eq!(pos.no_shares, 0);
    assert_eq!(pos.earned.0, s.total.0);
}

#[test]
#[should_panic(expected = "You don't have enough shares")]
fn sell_more_than_held_fails() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 2, None, None);
    c.sell_shares("m1".into(), true, 3, None, None);
}

#[test]
fn resolve_and_claim_full_flow() {
    let mut c = setup(200); // 2%
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 20 * NEAR);
    fund(&mut c, bob(), 20 * NEAR);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 5, None, None);
    ctx(bob(), 0, T0);
    c.buy_shares("m1".into(), false, 8, None, None);

    ctx(admin(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::Yes);
    let m = c.get_market("m1".into()).unwrap();
    assert_eq!(m.status, MarketStatus::Resolved);
    assert_eq!(m.outcome, Some(Outcome::Yes));

    let before = c.get_balance(alice()).0;
    ctx(alice(), 0, T0 + 3700);
    let paid = c.claim("m1".into(), None, None);
    assert_eq!(paid.0, 5 * NEAR);
    assert_eq!(c.get_balance(alice()).0, before + 5 * NEAR);
    assert_eq!(c.get_position("m1".into(), alice()).unwrap().yes_shares, 0);

    // Market stays solvent; surplus goes to treasury
    let fees = c.get_config().treasury.0;
    ctx(admin(), 0, T0 + 3700);
    let surplus = c.withdraw_market_surplus("m1".into());
    let m = c.get_market("m1".into()).unwrap();
    assert_eq!(m.collateral.0, 0);
    assert_eq!(c.get_config().treasury.0, fees + surplus.0);
}

#[test]
#[should_panic(expected = "No position in this market")]
fn loser_cannot_claim_without_position() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(admin(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::No);
    ctx(alice(), 0, T0 + 3600);
    c.claim("m1".into(), None, None);
}

#[test]
#[should_panic(expected = "Amount cannot be zero")]
fn loser_claims_zero() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 1, None, None);
    ctx(admin(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::No);
    ctx(alice(), 0, T0 + 3600);
    c.claim("m1".into(), None, None);
}

#[test]
#[should_panic(expected = "Market is not resolved")]
fn claim_before_resolution_fails() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 1, None, None);
    c.claim("m1".into(), None, None);
}

#[test]
#[should_panic(expected = "Market deadline has not passed yet")]
fn resolve_before_deadline_fails() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    ctx(admin(), 0, T0 + 10);
    c.resolve_market("m1".into(), Outcome::Yes);
}

#[test]
fn creator_can_resolve() {
    let mut c = setup(100);
    let req = c.get_required_liquidity(5).0;
    ctx(operator(), req, T0);
    c.create_market("m1".into(), "Q".into(), "d".into(), 5, T0 + 10, Some(bob()));
    ctx(bob(), 0, T0 + 10);
    c.resolve_market("m1".into(), Outcome::No);
    assert_eq!(c.get_market("m1".into()).unwrap().outcome, Some(Outcome::No));
}

#[test]
#[should_panic(expected = "not authorized to resolve")]
fn random_cannot_resolve() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    ctx(alice(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::Yes);
}

#[test]
#[should_panic(expected = "Market already resolved")]
fn cannot_resolve_twice() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    ctx(admin(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::Yes);
    c.resolve_market("m1".into(), Outcome::No);
}

#[test]
#[should_panic(expected = "Market is resolved")]
fn cannot_buy_after_resolution() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(admin(), 0, T0 + 3600);
    c.resolve_market("m1".into(), Outcome::Yes);
    ctx(alice(), 0, T0 + 3600);
    c.buy_shares("m1".into(), true, 1, None, None);
}

#[test]
fn operator_acts_on_behalf_of_user() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    ctx(operator(), 5 * NEAR, T0);
    c.deposit(Some(alice()));
    assert_eq!(c.get_balance(alice()).0, 5 * NEAR);
    assert_eq!(c.get_balance(operator()).0, 0);
    ctx(operator(), 0, T0);
    c.buy_shares("m1".into(), true, 2, None, Some(alice()));
    assert_eq!(c.get_position("m1".into(), alice()).unwrap().yes_shares, 2);
    c.sell_shares("m1".into(), true, 1, None, Some(alice()));
    assert_eq!(c.get_position("m1".into(), alice()).unwrap().yes_shares, 1);
    let _ = c.withdraw(Some(U128(NEAR)), Some(alice()), None);
}

#[test]
#[should_panic(expected = "Only the operator may use on_behalf_of")]
fn non_operator_cannot_use_on_behalf_of() {
    let mut c = setup(100);
    fund(&mut c, alice(), NEAR);
    ctx(bob(), 0, T0);
    let _ = c.withdraw(None, Some(alice()), None);
}

#[test]
fn ban_blocks_actions_and_unban_restores() {
    let mut c = setup(100);
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 5 * NEAR);
    ctx(admin(), 0, T0);
    c.ban_bettor(alice());
    assert!(c.get_bettor(alice()).unwrap().is_banned);

    ctx(alice(), 0, T0);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.buy_shares("m1".into(), true, 1, None, None);
    }));
    assert!(r.is_err());

    ctx(admin(), 0, T0);
    c.unban_bettor(alice());
    ctx(alice(), 0, T0);
    c.buy_shares("m1".into(), true, 1, None, None);
}

#[test]
#[should_panic(expected = "Bettor is banned")]
fn banned_cannot_withdraw() {
    let mut c = setup(100);
    fund(&mut c, alice(), NEAR);
    ctx(admin(), 0, T0);
    c.ban_bettor(alice());
    ctx(alice(), 0, T0);
    let _ = c.withdraw(None, None, None);
}

#[test]
#[should_panic(expected = "admin only")]
fn non_admin_cannot_ban() {
    let mut c = setup(100);
    ctx(alice(), 0, T0);
    c.ban_bettor(bob());
}

#[test]
#[should_panic(expected = "Minimum deposit is 0.01 NEAR")]
fn deposit_minimum() {
    let mut c = setup(100);
    fund(&mut c, alice(), MIN_DEPOSIT - 1);
}

#[test]
fn withdraw_debits_then_callback_restores_on_failure() {
    let mut c = setup(100);
    fund(&mut c, alice(), 3 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw(Some(U128(NEAR)), None, None);
    assert_eq!(c.get_balance(alice()).0, 2 * NEAR);

    // simulate failed transfer callback
    let mut b = VMContextBuilder::new();
    b.current_account_id("market.testnet".parse().unwrap())
        .predecessor_account_id("market.testnet".parse().unwrap());
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    assert!(!c.on_bettor_withdraw(alice(), U128(NEAR)));
    assert_eq!(c.get_balance(alice()).0, 3 * NEAR);

    // success leaves state untouched
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(c.on_bettor_withdraw(alice(), U128(NEAR)));
    assert_eq!(c.get_balance(alice()).0, 3 * NEAR);
}

#[test]
fn withdraw_all_by_default() {
    let mut c = setup(100);
    fund(&mut c, alice(), 3 * NEAR);
    ctx(alice(), 0, T0);
    let _ = c.withdraw(None, None, None);
    assert_eq!(c.get_balance(alice()).0, 0);
}

#[test]
fn admin_withdraw_fees() {
    let mut c = setup(500); // 5%
    make_market(&mut c, "m1", 10);
    fund(&mut c, alice(), 10 * NEAR);
    ctx(alice(), 0, T0);
    let q = c.buy_shares("m1".into(), true, 3, None, None);
    assert!(q.fee.0 > 0);
    ctx(admin(), 0, T0);
    let _ = c.admin_withdraw(None, None);
    assert_eq!(c.get_config().treasury.0, 0);

    // failure restores
    let mut b = VMContextBuilder::new();
    b.current_account_id("market.testnet".parse().unwrap())
        .predecessor_account_id("market.testnet".parse().unwrap());
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    c.on_admin_withdraw(q.fee);
    assert_eq!(c.get_config().treasury.0, q.fee.0);
}

#[test]
#[should_panic(expected = "admin only")]
fn non_admin_cannot_withdraw_fees() {
    let mut c = setup(100);
    ctx(alice(), 0, T0);
    let _ = c.admin_withdraw(None, None);
}

#[test]
fn solvency_under_many_trades() {
    // Random-ish trading, then both outcomes must be fully payable.
    for (idx, outcome) in [Outcome::Yes, Outcome::No].into_iter().enumerate() {
        // mocked storage persists across setup() calls, so use distinct ids
        let mid = format!("solv{}", idx);
        let mut c = setup(150);
        make_market(&mut c, &mid, 3);
        let users = [alice(), bob(), accounts(4), accounts(5)];
        for u in users.iter() {
            fund(&mut c, u.clone(), 500 * NEAR);
        }
        let mut seed: u64 = 42;
        for i in 0..200u64 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let u = users[(seed >> 33) as usize % users.len()].clone();
            let is_yes = (seed >> 20) & 1 == 1;
            let n = 1 + (seed >> 40) % 7;
            ctx(u.clone(), 0, T0 + i);
            let held = c
                .get_position(mid.clone(), u.clone())
                .map(|p| if is_yes { p.yes_shares } else { p.no_shares })
                .unwrap_or(0);
            if (seed >> 50) & 3 == 0 && held > 0 {
                c.sell_shares(mid.clone(), is_yes, held.min(n), None, None);
            } else {
                c.buy_shares(mid.clone(), is_yes, n, None, None);
            }
        }
        ctx(admin(), 0, T0 + 3600);
        c.resolve_market(mid.clone(), outcome);
        for u in users.iter() {
            ctx(u.clone(), 0, T0 + 3600);
            let p = c.get_position(mid.clone(), u.clone()).unwrap();
            let w = if outcome == Outcome::Yes { p.yes_shares } else { p.no_shares };
            if w > 0 {
                c.claim(mid.clone(), None, None);
            }
        }
        let m = c.get_market(mid.clone()).unwrap();
        assert_eq!(m.yes_shares.min(m.no_shares), 0);
    }
}
