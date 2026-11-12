use anchor_lang::prelude::*;

#[error_code]
pub enum SolPoolError {
    #[msg("Deposit amount is too small. Minimum is 0.01 SOL.")]
    DepositTooSmall,

    #[msg("Exceeds daily withdrawal limit of 1 SOL.")]
    ExceedsDailyLimit,

    #[msg("Insufficient pool balance.")]
    InsufficientPoolBalance,

    #[msg("Withdraw amount must be greater than zero.")]
    WithdrawAmountZero,

    #[msg("realm_id cannot be empty.")]
    EmptyRealmId,

    #[msg("realm_id is too long. Maximum 50 characters.")]
    RealmIdTooLong,
}
