use crate::{admin_check, constant::*, error::GatherError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Ban<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub bettor: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [GATHER_CONFIG],
        bump = gather_config.config_bump
    )]
    pub gather_config: Account<'info, GatherConfig>,

    #[account(
        mut,
        seeds = [BETTOR_PROFILE,bettor.key().to_bytes().as_ref(),gather_config.key().to_bytes().as_ref()],
        bump = betror_profile.bettor_bump,

    )]
    pub betror_profile: Account<'info, Bettor>,

    pub system_program: Program<'info, System>,
}

impl<'info> Ban<'info> {
    pub fn ban_bettor(&mut self) -> Result<()> {
        admin_check!(self);

        self.betror_profile.is_ban = true;

        Ok(())
    }
}
