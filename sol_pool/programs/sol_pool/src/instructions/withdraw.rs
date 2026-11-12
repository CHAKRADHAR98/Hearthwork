use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constant::*;
use crate::error::SolPoolError;
use crate::state::{SolPoolState, WithdrawalRecord};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

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

    /// Created on first withdrawal; updated on every subsequent one.
    #[account(
        init_if_needed,
        payer = requester,
        space = WithdrawalRecord::DISCRIMINATOR.len() + WithdrawalRecord::INIT_SPACE,
        seeds = [
            WITHDRAWAL_RECORD,
            sol_pool_state.key().as_ref(),
            requester.key().as_ref(),
        ],
        bump,
    )]
    pub withdrawal_record: Account<'info, WithdrawalRecord>,

    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, amount_lamports: u64, bumps: WithdrawBumps) -> Result<()> {
        require!(amount_lamports > 0, SolPoolError::WithdrawAmountZero);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        // Reset the daily window if 24h have passed since the last withdrawal
        if now - self.withdrawal_record.last_withdrawal_timestamp > DAILY_WINDOW_SECONDS {
            self.withdrawal_record.withdrawn_in_window = 0;
        }

        // Enforce daily limit
        let new_window_total = self.withdrawal_record
            .withdrawn_in_window
            .checked_add(amount_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        require!(new_window_total <= MAX_WITHDRAWAL_LAMPORTS, SolPoolError::ExceedsDailyLimit);

        // Ensure the vault has enough lamports
        require!(
            self.sol_pool_vault.lamports() >= amount_lamports,
            SolPoolError::InsufficientPoolBalance
        );

        // Transfer from vault PDA → requester using PDA signer seeds
        let realm_id = self.sol_pool_state.realm_id.clone();
        let realm_id_seed = &realm_id.as_bytes()[..realm_id.len().min(32)];
        let vault_bump = self.sol_pool_state.vault_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            SOL_POOL_VAULT,
            realm_id_seed,
            &[vault_bump],
        ]];

        transfer(
            CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                Transfer {
                    from: self.sol_pool_vault.to_account_info(),
                    to: self.requester.to_account_info(),
                },
                signer_seeds,
            ),
            amount_lamports,
        )?;

        // Update withdrawal record
        self.withdrawal_record.wallet = self.requester.key();
        self.withdrawal_record.last_withdrawal_timestamp = now;
        self.withdrawal_record.withdrawn_in_window = new_window_total;
        self.withdrawal_record.bump = bumps.withdrawal_record;

        // Update pool totals
        self.sol_pool_state.total_withdrawn = self.sol_pool_state
            .total_withdrawn
            .checked_add(amount_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
