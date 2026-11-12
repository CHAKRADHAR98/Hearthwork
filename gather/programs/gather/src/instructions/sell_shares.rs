use crate::{
    check_ban, check_zero, constant::*, decimal_convo, error::GatherError, state::*,
    utils::MarketStatus,
};
use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use solana_program::native_token::LAMPORTS_PER_SOL;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{burn_checked, BurnChecked, Mint, TokenAccount, TokenInterface},
};
use rust_decimal::prelude::*;

#[derive(Accounts)]
pub struct SellShares<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [BETTOR_PROFILE,bettor.key().to_bytes().as_ref(),gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_bump,

        constraint = bettor_profile.bettor_pubkey == bettor.key() @ GatherError::InvalidAccount

    )]
    pub bettor_profile: Account<'info, Bettor>,

    #[account(
        mut,
        seeds = [BETTOR_WALLET,bettor.key().to_bytes().as_ref(), gather_config.key().to_bytes().as_ref()],
        bump = bettor_profile.bettor_vault_bump
    )]
    pub bettor_wallet_account: SystemAccount<'info>,

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
        seeds = [MINT_YES,gather_market.key().to_bytes().as_ref()],
        bump = gather_market.mint_yes_bump,
        mint::authority = gather_config,
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [MINT_NO,gather_market.key().to_bytes().as_ref()],
        bump = gather_market.mint_no_bump,
        mint::authority = gather_config,
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::authority = bettor,
        associated_token::mint = mint_yes,
    )]
    pub bettor_yes_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = bettor,
    )]
    pub bettor_no_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [MARKET_VAULT,gather_market.key().to_bytes().as_ref()],
        bump
    )]
    pub market_vault_account: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> SellShares<'info> {
    // The flow is burn the given tokens and transder the sol to bettor
    pub fn sell_shares(&mut self, shares_amount: u64, is_yes: bool) -> Result<()> {
        check_ban!(self.bettor_profile.is_ban);

        match self.gather_market.market_state {
            MarketStatus::Active => {
                // Check that make sure given shares are not zero
                check_zero!([decimal_convo!(shares_amount)]);

                // calculate the amount (in lamports) to return for given shares
                let sol_amount = match is_yes {
                    true => (self
                        .gather_market
                        .share_calculation(false, shares_amount, 0, self.gather_config.fees)?
                        * Decimal::from(LAMPORTS_PER_SOL))
                        .to_u64()
                        .ok_or(GatherError::ArthemeticError)?,
                    false => (self
                        .gather_market
                        .share_calculation(false, 0, shares_amount, self.gather_config.fees)?
                        * Decimal::from(LAMPORTS_PER_SOL))
                        .to_u64()
                        .ok_or(GatherError::ArthemeticError)?,
                };

                self.burn_shares(shares_amount, is_yes)?;
                self.transfer_sol(sol_amount)?;
                self.update_state(shares_amount, is_yes, sol_amount)?;
            }
            MarketStatus::Resolved => {
                return Err(error!(GatherError::MarketGotResolved));
            }
        }

        Ok(())
    }

    fn burn_shares(&mut self, outcome_token_amount: u64, is_yes: bool) -> Result<()> {
        // burn the given share amount_sol

        let (mint, from) = match is_yes {
            true => (&self.mint_yes, &self.bettor_yes_account),
            false => (&self.mint_no, &self.bettor_no_account),
        };

        let ctx = CpiContext::new(
            self.token_program.to_account_info(),
            BurnChecked {
                mint: mint.to_account_info(),
                authority: self.bettor.to_account_info(),
                from: from.to_account_info(),
            },
        );

        burn_checked(ctx, outcome_token_amount, mint.decimals)?;
        Ok(())
    }

    fn transfer_sol(&mut self, amount_lamports: u64) -> Result<()> {
        // transfer the lamport amount from market vault account to bettor wallet account

        let accounts = Transfer {
            from: self.market_vault_account.to_account_info(),
            to: self.bettor_wallet_account.to_account_info(),
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

        transfer(ctx, amount_lamports)?;

        Ok(())
    }

    fn update_state(&mut self, shares_amount: u64, is_yes: bool, amount_earned: u64) -> Result<()> {
        if is_yes {
            self.gather_market
                .outcome_yes_shares
                .checked_sub(shares_amount)
                .ok_or(GatherError::ArthemeticUnderflow)?;

            self.wager_account
                .yes_shares
                .checked_sub(shares_amount)
                .ok_or(GatherError::ArthemeticUnderflow)?;
        } else {
            self.gather_market
                .outcome_no_shares
                .checked_sub(shares_amount)
                .ok_or(GatherError::ArthemeticUnderflow)?;

            self.wager_account
                .no_shares
                .checked_sub(shares_amount)
                .ok_or(GatherError::ArthemeticUnderflow)?;
        }

        self.wager_account
            .bet_amount_earned
            .checked_add(amount_earned)
            .ok_or(GatherError::ArthemeticOverflow)?;

        Ok(())
    }
}
