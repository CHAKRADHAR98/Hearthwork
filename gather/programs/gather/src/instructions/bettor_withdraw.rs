use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{check_ban, constant::*, error::GatherError, state::*};

#[derive(Accounts)]
pub struct BettorWithdraw<'info> {
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
        seeds = [MARKET, gather_config.key().to_bytes().as_ref(),&gather_market.market_name.as_bytes()[..gather_market.market_name.len().min(32)]],
        bump = gather_market.market_bump
    )]
    pub gather_market: Account<'info, GatherMarket>,

    #[account(
        mut,
        seeds = [WAGER,gather_market.key().to_bytes().as_ref(),bettor.key().to_bytes().as_ref()],
        bump = wager_account.bet_bump,
    )]
    pub wager_account: Account<'info, Wager>,

    #[account(
        mut,
        seeds = [BETTOR_WALLET,bettor.key().to_bytes().as_ref(), gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_vault_bump
    )]
    pub bettor_wallet_account: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [BETTOR_PROFILE,bettor.key().to_bytes().as_ref(),gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_bump,

        constraint = bettor_profile.bettor_pubkey == bettor.key() @ GatherError::InvalidAccount

    )]
    pub bettor_profile: Account<'info, Bettor>,

    pub system_program: Program<'info, System>,
}

impl<'info> BettorWithdraw<'info> {
    pub fn bettor_withdraw(&mut self) -> Result<()> {
        check_ban!(self.bettor_profile.is_ban);

        let accounts = Transfer {
            from: self.bettor_wallet_account.to_account_info(),
            to: self.bettor.to_account_info(),
        };

        let bettor_seeds = self.bettor.key().to_bytes();
        let gather_config_seeds = self.gather_config.key().to_bytes();
        let seeds = &[
            BETTOR_WALLET,
            bettor_seeds.as_ref(),
            gather_config_seeds.as_ref(),
            &[self.bettor_profile.bettor_vault_bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            accounts,
            signer_seeds,
        );

        transfer(ctx, self.bettor_wallet_account.lamports())?;
        Ok(())
    }
}
