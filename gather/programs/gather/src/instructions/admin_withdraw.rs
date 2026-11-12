use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{admin_check, constant::*, error::*, state::*};

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GATHER_CONFIG],
        bump = gather_config.config_bump
    )]
    pub gather_config: Account<'info, GatherConfig>,

    #[account(
        mut,
        seeds = [MARKET, gather_config.key().to_bytes().as_ref(),&gather_market.market_name.as_bytes()[..gather_market.market_name.len().min(32)]],
        bump = gather_market.market_bump
    )]
    pub gather_market: Account<'info, GatherMarket>,

    #[account(
        mut,
        seeds = [MARKET_VAULT,gather_market.key().to_bytes().as_ref()],
        bump = gather_market.market_vault_bump
    )]
    pub market_vault_account: SystemAccount<'info>, // Where bettor desposites there wagers

    #[account(
        mut,
        seeds = [TREASURY,gather_config.key().to_bytes().as_ref()],
        bump = gather_config.trasury_bump
    )]
    pub treasury_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> AdminWithdraw<'info> {
    pub fn admin_withdraw_revenue(&mut self) -> Result<()> {
        admin_check!(self);

        let accounts = Transfer {
            from: self.market_vault_account.to_account_info(),
            to: self.treasury_account.to_account_info(),
        };

        let gather_config_seed = self.gather_market.key().to_bytes();
        let seeds = &[
            MARKET_VAULT,
            gather_config_seed.as_ref(),
            &[self.gather_market.market_vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            accounts,
            signer_seeds,
        );

        let amount = self.market_vault_account.lamports();

        transfer(ctx, self.market_vault_account.lamports())?;

        self.gather_config.treasuty_amount = self
            .gather_config
            .treasuty_amount
            .checked_add(amount)
            .ok_or(GatherError::ArthemeticOverflow)?;

        Ok(())
    }
}
