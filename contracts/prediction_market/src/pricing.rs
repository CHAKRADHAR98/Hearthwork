//! LMSR (Logarithmic Market Scoring Rule) pricing, ported from the Solana
//! `gather` program (`utils/helper.rs`).
//!
//! Cost function: C(q_yes, q_no) = b * ln(e^(q_yes/b) + e^(q_no/b))
//! Trade cost:    |C(after) - C(before)| (in "share units", 1 share pays out
//!                `share_value` yoctoNEAR if it wins)
//! Fees:          buy  -> buyer pays delta + delta * fee_bps / 10_000
//!                sell -> seller receives delta - delta * fee_bps / 10_000
//!
//! The Solana program used `rust_decimal`; here we use f64 with the
//! numerically stable log-sum-exp form. Rounding is always in favour of the
//! market (buy cost rounded up, sell proceeds rounded down, plus a tiny
//! epsilon) so the market vault can never become insolvent through float error.

use near_sdk::require;

pub const BPS_DENOMINATOR: u128 = 10_000;

/// Safety margin applied to every trade to absorb f64 rounding error
/// (1e-12 NEAR, economically irrelevant).
pub const ROUNDING_EPSILON_YOCTO: u128 = 1_000_000_000_000;

/// ln(2) * 1e9, rounded UP (Solana used the same constant: 693_147_181).
pub const LN2_E9: u128 = 693_147_181;

/// LMSR cost function, numerically stable.
pub fn lmsr_cost(q_yes: f64, q_no: f64, b: f64) -> f64 {
    let m = if q_yes > q_no { q_yes } else { q_no };
    m + b * (((q_yes - m) / b).exp() + ((q_no - m) / b).exp()).ln()
}

/// Absolute change in the cost function (in share units) when the market
/// moves from (yes, no) to (new_yes, new_no).
pub fn cost_delta(yes: u64, no: u64, new_yes: u64, new_no: u64, b: u64) -> f64 {
    require!(b > 0, "LMSR b must be > 0");
    let bf = b as f64;
    let before = lmsr_cost(yes as f64, no as f64, bf);
    let after = lmsr_cost(new_yes as f64, new_no as f64, bf);
    let d = after - before;
    require!(d.is_finite(), "Arithmetic error in LMSR pricing");
    if d < 0.0 {
        -d
    } else {
        d
    }
}

fn to_yocto(shares_delta: f64, share_value: u128, round_up: bool) -> u128 {
    let v = shares_delta * share_value as f64;
    require!(v.is_finite() && v >= 0.0, "Arithmetic error in LMSR pricing");
    // f64 -> u128 casts saturate; guard explicitly anyway.
    require!(v < 1e36, "Arithmetic overflow in LMSR pricing");
    if round_up {
        v.ceil() as u128
    } else {
        v.floor() as u128
    }
}

/// Instantaneous YES price (probability) in [0, 1].
pub fn yes_price(yes: u64, no: u64, b: u64) -> f64 {
    let bf = b as f64;
    // e^(y/b) / (e^(y/b) + e^(n/b)) = 1 / (1 + e^((n-y)/b))
    1.0 / (1.0 + ((no as f64 - yes as f64) / bf).exp())
}

/// Result of a price quote, all values in yoctoNEAR.
pub struct Quote {
    /// Amount moved into / out of the market collateral (LMSR delta).
    pub base: u128,
    /// Protocol fee.
    pub fee: u128,
    /// Buy: total debited from the bettor. Sell: net credited to the bettor.
    pub total: u128,
}

pub fn fee_of(base: u128, fee_bps: u16) -> u128 {
    base.checked_mul(fee_bps as u128)
        .expect("Arithmetic overflow")
        / BPS_DENOMINATOR
}

pub fn quote_buy(yes: u64, no: u64, b: u64, is_yes: bool, shares: u64, share_value: u128, fee_bps: u16) -> Quote {
    let (ny, nn) = if is_yes {
        (yes.checked_add(shares).expect("Arithmetic overflow"), no)
    } else {
        (yes, no.checked_add(shares).expect("Arithmetic overflow"))
    };
    let delta = cost_delta(yes, no, ny, nn, b);
    let base = to_yocto(delta, share_value, true)
        .checked_add(ROUNDING_EPSILON_YOCTO)
        .expect("Arithmetic overflow");
    let fee = fee_of(base, fee_bps);
    let total = base.checked_add(fee).expect("Arithmetic overflow");
    Quote { base, fee, total }
}

pub fn quote_sell(yes: u64, no: u64, b: u64, is_yes: bool, shares: u64, share_value: u128, fee_bps: u16) -> Quote {
    let (ny, nn) = if is_yes {
        (yes.checked_sub(shares).expect("Not enough outstanding shares"), no)
    } else {
        (yes, no.checked_sub(shares).expect("Not enough outstanding shares"))
    };
    let delta = cost_delta(yes, no, ny, nn, b);
    let base = to_yocto(delta, share_value, false).saturating_sub(ROUNDING_EPSILON_YOCTO);
    let fee = fee_of(base, fee_bps);
    let total = base - fee; // fee <= base since fee_bps < 10_000
    Quote { base, fee, total }
}

/// Initial subsidy the creator must deposit: ceil(b * ln2 * share_value).
/// This bounds the LMSR market maker's worst-case loss, guaranteeing solvency.
pub fn initial_liquidity(b: u64, share_value: u128) -> u128 {
    share_value
        .checked_mul(b as u128)
        .and_then(|x| x.checked_mul(LN2_E9))
        .expect("Arithmetic overflow computing initial liquidity")
        / 1_000_000_000
        + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cost_at_zero_is_b_ln2() {
        let c = lmsr_cost(0.0, 0.0, 10.0);
        assert!((c - 10.0 * std::f64::consts::LN_2).abs() < 1e-12);
    }

    #[test]
    fn price_starts_at_half_and_moves() {
        assert!((yes_price(0, 0, 10) - 0.5).abs() < 1e-12);
        assert!(yes_price(5, 0, 10) > 0.5);
        assert!(yes_price(0, 5, 10) < 0.5);
    }

    #[test]
    fn buy_then_sell_roundtrip_never_profits() {
        let sv = 10u128.pow(24);
        let buy = quote_buy(0, 0, 10, true, 5, sv, 0);
        let sell = quote_sell(5, 0, 10, true, 5, sv, 0);
        assert!(sell.total <= buy.total);
        // shares cost between 0.5 and 1 NEAR each at these levels
        assert!(buy.total > 5 * sv / 2 && buy.total < 5 * sv);
    }

    #[test]
    fn fees_apply() {
        let sv = 10u128.pow(24);
        let q = quote_buy(0, 0, 10, true, 1, sv, 100); // 1%
        assert_eq!(q.fee, q.base / 100);
        assert_eq!(q.total, q.base + q.fee);
    }

    #[test]
    fn huge_quantities_are_stable() {
        let d = cost_delta(1_000_000, 0, 1_000_001, 0, 1);
        assert!((d - 1.0).abs() < 1e-6);
    }
}
