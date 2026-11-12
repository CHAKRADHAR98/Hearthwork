use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use solana_program::native_token::LAMPORTS_PER_SOL;

use crate::{check_ban, constant::*, error::GatherError, state::*};

#[derive(Accounts)]
pub struct DepositBettorWallet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [GATHER_CONFIG],
        bump = gather_config.config_bump
    )]
    pub gather_config: Account<'info, GatherConfig>,

    #[account(
        mut,
        seeds = [BETTOR_PROFILE, bettor.key().to_bytes().as_ref(), gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_bump,
        constraint = bettor_profile.bettor_pubkey == bettor.key() @ GatherError::InvalidAccount
    )]
    pub bettor_profile: Account<'info, Bettor>,

    #[account(
        mut,
        seeds = [BETTOR_WALLET, bettor.key().to_bytes().as_ref(), gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_vault_bump
    )]
    pub bettor_wallet_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> DepositBettorWallet<'info> {
    pub fn deposit(&mut self, amount_sol: u64) -> Result<()> {
        check_ban!(self.bettor_profile.is_ban);

        require!(amount_sol > 0, GatherError::NotEnoughAmount);

        let lamports = amount_sol
            .checked_mul(LAMPORTS_PER_SOL)
            .ok_or(GatherError::ArthemeticError)?;

        let accounts = Transfer {
            from: self.bettor.to_account_info(),
            to: self.bettor_wallet_account.to_account_info(),
        };

        let ctx = CpiContext::new(self.system_program.to_account_info(), accounts);
        transfer(ctx, lamports)?;

        Ok(())
    }
}
