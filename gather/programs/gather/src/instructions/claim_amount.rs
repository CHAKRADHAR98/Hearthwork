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

use crate::{
    check_ban, check_zero,
    constant::*,
    decimal_convo,
    error::*,
    state::*,
    utils::{MarketOutcome, MarketStatus},
};

#[derive(Accounts)]
pub struct ClaimAmount<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [WAGER,gather_market.key().to_bytes().as_ref(),bettor.key().to_bytes().as_ref()],
        bump = wager_account.bet_bump,

    )]
    pub wager_account: Account<'info, Wager>,

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
        associated_token::mint = mint_yes,
        associated_token::authority = bettor,
    )]
    pub bettor_yes_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = bettor,
    )]
    pub bettor_no_ata: Box<InterfaceAccount<'info, TokenAccount>>,

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
    pub market_vault_account: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [MINT_YES,gather_market.key().to_bytes().as_ref()],
        bump = gather_market.mint_yes_bump,
        mint::token_program = token_program,
        mint::authority = gather_config
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [MINT_NO,gather_market.key().to_bytes().as_ref()],
        bump = gather_market.mint_no_bump,
        mint::token_program = token_program,
        mint::authority = gather_config
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ClaimAmount<'info> {
    pub fn claim_amount(&mut self, shares_amount: u64) -> Result<()> {
        check_zero!([decimal_convo!(shares_amount)]);

        check_ban!(self.bettor_profile.is_ban);
        match self.gather_market.market_state {
            MarketStatus::Resolved => match self.gather_market.market_outcome {
                MarketOutcome::YES => {
                    require!(
                        self.bettor_yes_ata.amount >= shares_amount,
                        GatherError::NotEnoughShares
                    );

                    self.reward_bettor(shares_amount)?;
                    self.burn_outcome_shares(shares_amount, true)?;
                    self.update_state(shares_amount)?;
                }
                MarketOutcome::NO => {
                    require!(
                        self.bettor_no_ata.amount >= shares_amount,
                        GatherError::NotEnoughShares
                    );

                    self.reward_bettor(shares_amount)?;
                    self.burn_outcome_shares(shares_amount, false)?;
                    self.update_state(shares_amount)?;
                }

                MarketOutcome::NotResolved => {
                    return err!(GatherError::MarketNotResolved);
                }
            },
            MarketStatus::Active => {
                return err!(GatherError::MarketNotResolved);
            }
        }

        Ok(())
    }

    fn reward_bettor(&mut self, sol_amount: u64) -> Result<()> {
        // transfer reward from market vault to bettor_wallet_account

        let market_seed = self.gather_market.key().to_bytes();

        let seeds = &[
            MARKET_VAULT,
            market_seed.as_ref(),
            &[self.gather_market.market_vault_bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.market_vault_account.to_account_info(),
                to: self.bettor_wallet_account.to_account_info(),
            },
            signer_seeds,
        );

        transfer(ctx, sol_amount * LAMPORTS_PER_SOL)?;

        Ok(())
    }

    fn burn_outcome_shares(&mut self, shares_amount: u64, is_yes: bool) -> Result<()> {
        let (from, mint) = match is_yes {
            true => (&self.bettor_yes_ata, &self.mint_yes),
            false => (&self.bettor_no_ata, &self.mint_no),
        };

        let account = BurnChecked {
            from: from.to_account_info(),
            authority: self.bettor.to_account_info(),
            mint: mint.to_account_info(),
        };

        let ctx = CpiContext::new(self.token_program.to_account_info(), account);

        burn_checked(ctx, shares_amount, mint.decimals)?;

        Ok(())
    }

    fn update_state(&mut self, shares_amount: u64) -> Result<()> {
        // profite/loss = Winning Shares - [TotalSpent - Total Earned];

        let net_spent = self.wager_account.bet_amount_spent as i64
            - self.wager_account.bet_amount_earned as i64;

        let profit_loss = shares_amount as i64 - net_spent;

        // Update the bettor profile net profit
        self.bettor_profile.bettor_net_profit = self
            .bettor_profile
            .bettor_net_profit
            .checked_add(profit_loss)
            .ok_or(GatherError::ArthemeticError)?;

        Ok(())
    }
}
