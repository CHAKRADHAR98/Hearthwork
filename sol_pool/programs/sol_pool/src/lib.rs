use anchor_lang::prelude::*;

// After running `anchor build`, replace this with the generated program ID
// from target/deploy/sol_pool-keypair.json (run: solana address -k target/deploy/sol_pool-keypair.json)
declare_id!("8Q78vn3ShdK6nCviRnEgqaRkMztKXePQqqF2zQGnbtp6");

pub mod constant;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod sol_pool {
    use super::*;

    /// Creates a new community SOL pool tied to a realm.
    /// Anyone can call this — the first caller becomes the authority.
    pub fn initialize_pool(ctx: Context<InitializePool>, realm_id: String) -> Result<()> {
        ctx.accounts.initialize(realm_id, ctx.bumps)
    }

    /// Deposit SOL into the pool. Minimum 0.01 SOL.
    pub fn deposit(ctx: Context<Deposit>, amount_lamports: u64) -> Result<()> {
        ctx.accounts.deposit(amount_lamports)
    }

    /// Withdraw SOL from the pool. Max 1 SOL per wallet per 24h.
    pub fn withdraw(ctx: Context<Withdraw>, amount_lamports: u64) -> Result<()> {
        ctx.accounts.withdraw(amount_lamports, ctx.bumps)
    }
}
