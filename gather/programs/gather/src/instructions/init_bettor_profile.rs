use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
    Result,
};
use solana_program::native_token::LAMPORTS_PER_SOL;
use rust_decimal::Decimal;

use crate::{
    check_zero,
    constant::*,
    error::GatherError,
    state::{Bettor, GatherConfig},
};

#[derive(Accounts)]
pub struct InitializeBettor<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
     mut,
     seeds = [GATHER_CONFIG],
     bump = gather_config.config_bump
    )]
    pub gather_config: Account<'info, GatherConfig>,

    #[account(
        init,
        payer = bettor,
        space = Bettor::DISCRIMINATOR.len() + Bettor::INIT_SPACE,
        seeds = [BETTOR_PROFILE,bettor.key().to_bytes().as_ref(),gather_config.key().to_bytes().as_ref()],
        bump
    )]
    pub bettor_profile: Account<'info, Bettor>,

    #[account(
        mut,
        seeds = [BETTOR_WALLET,bettor.key().to_bytes().as_ref(), gather_config.key().to_bytes().as_ref()],
        bump
    )]
    pub bettor_wallet_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeBettor<'info> {
    pub fn init_bettor(
        &mut self,
        name: Option<String>,
        amount_deposite: u64,
        bumps: InitializeBettorBumps,
    ) -> Result<()> {
        // save the user data
        self.bettor_profile.set_inner(Bettor {
            bettor_pubkey: self.bettor.key(),
            bettor_name: name,
            bettor_net_profit: 0,
            balance: 0,
            is_ban: false,
            bettor_vault_bump: bumps.bettor_wallet_account,
            bettor_bump: bumps.bettor_profile,
        });

        self.transfer_bettor_funds(amount_deposite)?;

        Ok(())
    }

    fn transfer_bettor_funds(&mut self, amount_deposite: u64) -> Result<()> {
        // transer bettor funds to bettor_wallet

        check_zero!([Decimal::from(amount_deposite)]);

        let accounts = Transfer {
            from: self.bettor.to_account_info(),
            to: self.bettor_wallet_account.to_account_info(),
        };

        let ctx = CpiContext::new(self.system_program.to_account_info(), accounts);

        transfer(ctx, amount_deposite * LAMPORTS_PER_SOL)?;

        // update the bettor balance
        self.bettor_profile.balance = self
            .bettor_profile
            .balance
            .checked_add(amount_deposite)
            .unwrap();
        Ok(())
    }
}
