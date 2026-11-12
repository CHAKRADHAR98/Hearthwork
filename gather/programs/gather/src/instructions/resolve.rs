use anchor_lang::prelude::*;

use crate::{
    constant::*,
    error::GatherError,
    state::*,
    utils::{MarketOutcome, MarketStatus},
};

#[derive(Accounts)]
pub struct Resolve<'info> {
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
}

impl<'info> Resolve<'info> {
    pub fn resolve_market(&mut self, outcome: MarketOutcome) -> Result<()> {
        // Allow the realm_authority (the map creator who owns this market) OR a global admin
        let is_realm_authority = self.admin.key() == self.gather_market.realm_authority;
        let is_global_admin = self
            .gather_config
            .admin
            .iter()
            .any(|admin_pubkey| self.admin.key() == *admin_pubkey);
        require!(is_realm_authority || is_global_admin, GatherError::UnAuthourized);

        require!(
            Clock::get()?.unix_timestamp >= self.gather_market.dead_line,
            GatherError::MarketNotResolved
        );

        match self.gather_market.market_state {
            MarketStatus::Active => match outcome {
                MarketOutcome::YES => {
                    self.gather_market.market_outcome = MarketOutcome::YES;
                    self.gather_market.market_state = MarketStatus::Resolved;
                }
                MarketOutcome::NO => {
                    self.gather_market.market_outcome = MarketOutcome::NO;
                    self.gather_market.market_state = MarketStatus::Resolved;
                }
                MarketOutcome::NotResolved => {}
            },
            MarketStatus::Resolved => {
                return err!(GatherError::MarketGotResolved);
            }
        }

        Ok(())
    }
}
