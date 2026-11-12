use anchor_lang::prelude::*;

use crate::{
    constant::{GATHER_CONFIG, TREASURY},
    error::GatherError,
    state::*,
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = GatherConfig::DISCRIMINATOR.len() + GatherConfig::INIT_SPACE,
        seeds = [GATHER_CONFIG],
        bump
    )]
    pub gather_config: Box<Account<'info, GatherConfig>>,

    #[account(
        seeds = [TREASURY,gather_config.key().to_bytes().as_ref()],
        bump
    )]
    pub treasury_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeConfig<'info> {
    pub fn init_config(&mut self, bumps: InitializeConfigBumps, fees: Option<u16>) -> Result<()> {
        if !self.gather_config.is_initialized {
            self.gather_config.is_initialized = true;
            self.gather_config.fees = fees.unwrap();
            self.gather_config.trasury_bump = bumps.treasury_account;
            self.gather_config.config_bump = bumps.gather_config;
            self.gather_config.treasuty_amount = 0;
        }

        // Checks for more the two admins
        require!(self.gather_config.admin.len() < 2, GatherError::TooManyAdmins);

        let admin_check = self
            .gather_config
            .admin
            .iter()
            .any(|admin_pubkey| admin_pubkey == self.admin.key);

        // Check if admin already exist
        require!(!admin_check, GatherError::AdminExist);

        self.gather_config.admin.push(self.admin.key());

        Ok(())
    }
}
