use anchor_lang::prelude::*;
use crate::constant::*;
use crate::error::SolPoolError;
use crate::state::SolPoolState;

#[derive(Accounts)]
#[instruction(realm_id: String)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SolPoolState::DISCRIMINATOR.len() + SolPoolState::INIT_SPACE,
        seeds = [SOL_POOL_STATE, &realm_id.as_bytes()[..realm_id.len().min(32)]],
        bump,
    )]
    pub sol_pool_state: Account<'info, SolPoolState>,

    /// CHECK: This PDA holds SOL for the pool. No data, just lamports.
    #[account(
        mut,
        seeds = [SOL_POOL_VAULT, &realm_id.as_bytes()[..realm_id.len().min(32)]],
        bump,
    )]
    pub sol_pool_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializePool<'info> {
    pub fn initialize(&mut self, realm_id: String, bumps: InitializePoolBumps) -> Result<()> {
        require!(!realm_id.is_empty(), SolPoolError::EmptyRealmId);
        require!(realm_id.len() <= 50, SolPoolError::RealmIdTooLong);

        self.sol_pool_state.set_inner(SolPoolState {
            authority: self.authority.key(),
            realm_id,
            total_deposited: 0,
            total_withdrawn: 0,
            vault_bump: bumps.sol_pool_vault,
            bump: bumps.sol_pool_state,
        });

        Ok(())
    }
}
