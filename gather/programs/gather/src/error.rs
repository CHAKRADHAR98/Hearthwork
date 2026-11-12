use anchor_lang::prelude::*;

#[error_code]
pub enum GatherError {
    #[msg("Max Admin Lenght Exceeded")]
    TooManyAdmins,

    #[msg("The liquidity parameter b is too low")]
    ParameterTooLow,

    #[msg("The given string length is more then max")]
    MaxLenght,

    #[msg("The admin already exist no need to sign again")]
    AdminExist,

    #[msg("you are not authourized to do this instruction")]
    UnAuthourized,

    #[msg("This account is already initialized")]
    AccountAlreadyInitialized,

    #[msg("Overflow Error occured")]
    ArthemeticOverflow,

    #[msg("Underflow Error occured")]
    ArthemeticUnderflow,

    #[msg("Mathmatical Error Occured")]
    ArthemeticError,

    #[msg("Amount cannot be Zero")]
    ZeroAmount,

    #[msg("The given fees is invalid")]
    InvalidFees,

    #[msg("The given user does not have requied SOL amount")]
    NotEnoughAmount,

    #[msg("You cannot particpate in this market it got resolved")]
    MarketGotResolved,

    #[msg("Your bettor wallet got banned you cannot performe any actions using this account")]
    Banned,

    #[msg("Market is not resolved")]
    MarketNotResolved,

    #[msg("You dont have enough shares to claim")]
    NotEnoughShares,

    #[msg("The given account is invalid")]
    InvalidAccount,
}
