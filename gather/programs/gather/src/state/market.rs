use crate::utils::{MarketOutcome, MarketStatus};
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GatherMarket {
    #[max_len(32)]
    pub market_name: String,
    #[max_len(100)]
    pub description: String,

    pub intial_deposite: u64,

    pub lsmr_b: u64,    // make sure b is higher
    pub dead_line: i64, // unix_time_stamp

    pub market_state: MarketStatus,
    pub market_outcome: MarketOutcome, // changable

    pub outcome_yes_shares: u64, // q1
    pub outcome_no_shares: u64,  // q2

    pub realm_authority: Pubkey, // wallet of the realm owner who created this market

    pub mint_yes_bump: u8,
    pub mint_no_bump: u8,
    pub market_vault_bump: u8,
    pub market_bump: u8,
}
