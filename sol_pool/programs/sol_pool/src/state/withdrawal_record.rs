use anchor_lang::prelude::*;

/// Per-wallet record tracking how much SOL has been withdrawn in the current 24h window.
/// Created lazily on the first withdrawal.
#[account]
#[derive(InitSpace)]
pub struct WithdrawalRecord {
    /// The wallet this record belongs to
    pub wallet: Pubkey,

    /// Unix timestamp of the last withdrawal
    pub last_withdrawal_timestamp: i64,

    /// Lamports withdrawn within the current 24h window
    pub withdrawn_in_window: u64,

    /// Bump for this PDA
    pub bump: u8,
}
