pub const SOL_POOL_STATE: &[u8] = b"sol_pool_state";
pub const SOL_POOL_VAULT: &[u8] = b"sol_pool_vault";
pub const WITHDRAWAL_RECORD: &[u8] = b"withdrawal_record";

pub const MIN_DEPOSIT_LAMPORTS: u64 = 10_000_000;       // 0.01 SOL
pub const MAX_WITHDRAWAL_LAMPORTS: u64 = 10_000_000_000; // 10 SOL per day
pub const DAILY_WINDOW_SECONDS: i64 = 86_400;           // 24 hours
