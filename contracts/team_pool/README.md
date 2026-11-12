# team_pool

NEAR port of the Solana `sol_pool` program: community NEAR pools, one per realm, in a single contract.

Build / test:

```bash
cargo test
cargo near build non-reproducible-wasm   # -> target/near/team_pool.wasm
```

## Rules

- `initialize_pool(realm_id)`: the first caller becomes the pool `authority`. `realm_id` must be 1..50 bytes.
- `deposit`: attach at least **0.01 NEAR**.
- `withdraw`: any account may withdraw up to **10 NEAR per pool per 24h window**. The window starts at the account's first withdrawal and resets 86 400 s later.
- Pool state and window usage are updated before the transfer. If the transfer fails, a callback restores them.
- **Operator**: the account set at init may pass `on_behalf_of`. The action, and the withdraw cap, then apply to that account. Anyone else who passes it gets a panic.

Units: every NEAR amount is a yoctoNEAR string (`U128`). Times are unix seconds.

## Init

| method | args |
|---|---|
| `new` | `owner: AccountId`, `operator: AccountId \| null` |

## Change methods

| method | deposit | args | returns |
|---|---|---|---|
| `initialize_pool` | – | `realm_id: string`, `on_behalf_of: AccountId \| null` | `Pool` |
| `deposit` | ≥ 0.01 NEAR | `realm_id: string`, `on_behalf_of: AccountId \| null` (attribution only) | `U128` new pool balance |
| `withdraw` | – | `realm_id: string`, `amount: U128`, `on_behalf_of: AccountId \| null`, `receiver: AccountId \| null` (default the acting account) | Promise → `bool` (false = transfer failed, state restored) |
| `set_operator` | – | `operator: AccountId \| null` (owner only) | – |

Use ~50 Tgas for `withdraw`, because it schedules a transfer and a callback. `on_withdraw` is a private callback.

## View methods

| method | args | returns |
|---|---|---|
| `get_config` | – | `{ owner, operator, min_deposit, max_withdrawal_per_window, window_seconds, pool_count }` |
| `get_pool` | `realm_id` | `Pool \| null` |
| `list_pools` | `from_index: u32 \| null`, `limit: u32 \| null` (default 50, max 100) | `Pool[]` |
| `get_remaining_daily_limit` | `realm_id`, `account_id` | `U128` (ignores the pool balance) |
| `get_withdraw_limit` | `realm_id`, `account_id` | `{ remaining, withdrawn_in_window, max_per_window, window_resets_at_sec }` (`window_resets_at_sec` is 0 when no window is active) |
| `get_withdrawal_record` | `realm_id`, `account_id` | `{ window_start_sec, withdrawn_in_window, last_withdrawal_sec } \| null` |

```ts
type Pool = { realm_id: string; authority: string; total_deposited: string; total_withdrawn: string; balance: string; created_at_sec: number };
```
