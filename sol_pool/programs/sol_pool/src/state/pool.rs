use anchor_lang::prelude::*;

/// Stores metadata for the community SOL pool.
/// The actual SOL sits in the separate sol_pool_vault PDA.
#[account]
#[derive(InitSpace)]
pub struct SolPoolState {
    /// Wallet that created this pool
    pub authority: Pubkey,

    /// The realm this pool belongs to (used as PDA seed)
    #[max_len(50)]
    pub realm_id: String,

    /// Cumulative lamports ever deposited
    pub total_deposited: u64,

    /// Cumulative lamports ever withdrawn
    pub total_withdrawn: u64,

    /// Bump for the vault PDA (stored so withdraw can sign without re-deriving)
    pub vault_bump: u8,

    /// Bump for this state account
    pub bump: u8,
}
