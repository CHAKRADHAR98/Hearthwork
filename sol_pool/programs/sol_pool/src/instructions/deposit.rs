use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constant::*;
use crate::error::SolPoolError;
use crate::state::SolPoolState;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [SOL_POOL_STATE, &sol_pool_state.realm_id.as_bytes()[..sol_pool_state.realm_id.len().min(32)]],
        bump = sol_pool_state.bump,
    )]
    pub sol_pool_state: Account<'info, SolPoolState>,

    /// CHECK: This PDA holds SOL for the pool. No data, just lamports.
    #[account(
        mut,
        seeds = [SOL_POOL_VAULT, &sol_pool_state.realm_id.as_bytes()[..sol_pool_state.realm_id.len().min(32)]],
        bump = sol_pool_state.vault_bump,
    )]
    pub sol_pool_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports >= MIN_DEPOSIT_LAMPORTS, SolPoolError::DepositTooSmall);

        transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                Transfer {
                    from: self.depositor.to_account_info(),
                    to: self.sol_pool_vault.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        self.sol_pool_state.total_deposited = self.sol_pool_state
            .total_deposited
            .checked_add(amount_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
