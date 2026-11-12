use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bettor {
    pub bettor_pubkey: Pubkey,
    #[max_len(30)]
    pub bettor_name: Option<String>,

    pub bettor_net_profit: i64, 
    pub balance: u64,

    pub is_ban: bool, 

    pub bettor_vault_bump: u8,
    pub bettor_bump: u8,
}
