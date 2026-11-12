use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GatherConfig {
    #[max_len(3)]
    pub admin: Vec<Pubkey>,
    pub fees: u16, 

    pub treasuty_amount: u64,
    pub trasury_bump: u8,
    pub config_bump: u8,
    pub is_initialized: bool,
}
