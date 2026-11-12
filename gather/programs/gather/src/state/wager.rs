use anchor_lang::prelude::*;

use crate::utils::{MarketOutcome, MarketStatus};

#[account]
#[derive(InitSpace)]
pub struct Wager {
    pub bettor_pubkey: Pubkey,
    pub market_pubkey: Pubkey,

    pub bet_amount_spent: u64,  // changable
    pub bet_amount_earned: u64, // changable

    pub market_status: MarketStatus,   // changable
    pub market_outcome: MarketOutcome, // changable

    pub yes_shares: u64, // changable
    pub no_shares: u64,  // changable

    pub is_initialized: bool, // added this for safty check for reinitialization attackes
    pub bet_bump: u8,
}
