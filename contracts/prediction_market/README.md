# prediction_market

NEAR port of the Solana `gather` program: LMSR-priced YES/NO markets settled in native NEAR.
One contract instance hosts many markets keyed by `market_id`.

Build / test:

```bash
cargo test
cargo near build non-reproducible-wasm   # -> target/near/prediction_market.wasm
```

## Model

- **Bettor balance**: users `deposit` NEAR into an internal balance. `buy_shares` debits it, `sell_shares` and `claim` credit it, and `withdraw` sends NEAR out.
- **Pricing (LMSR)**: `C(q_yes, q_no) = b * ln(e^(q_yes/b) + e^(q_no/b))`. Buying `n` shares costs `C(after) - C(before)` and selling returns `C(before) - C(after)`. Both are in share units times `share_value`.
- **Fees**: the buyer pays `base + base*fee_bps/10000` and the seller receives `base - base*fee_bps/10000`. Fees go to the treasury.
- **Payout**: each winning share pays `share_value` yoctoNEAR. The default is 1 NEAR, set at init and frozen per market at creation.
- **Creator subsidy**: creating a market requires attaching `get_required_liquidity(lmsr_b)` = `ceil(b * ln2 * share_value)`. This is the LMSR worst-case loss, so the market is always solvent.
- **Deadline**: trading is allowed until `deadline_sec`. Resolution is allowed from `deadline_sec` onwards.
- **Operator**: the account set at init may pass `on_behalf_of` on user methods. Anyone else who passes it gets a panic.

Units: every NEAR amount is a yoctoNEAR string (`U128`). `shares` and `lmsr_b` are JSON numbers (u64). Times are unix **seconds**.

## Init

| method | args |
|---|---|
| `new` | `admins: AccountId[]` (1..5), `operator: AccountId \| null`, `fee_bps: u16` (< 10000), `share_value: U128 \| null` (default 1 NEAR) |

## Change methods

| method | deposit | who | args | returns |
|---|---|---|---|---|
| `create_market` | ≥ `get_required_liquidity(lmsr_b)` (excess refunded) | admin or operator | `market_id: string` (≤64), `name: string` (1..50), `description: string` (≤280), `lmsr_b: u64` (≥1), `deadline_sec: u64` (future), `creator: AccountId \| null` (who may resolve; default caller) | `Market` |
| `resolve_market` | – | admin or market creator, after deadline | `market_id`, `outcome: "Yes" \| "No"` | – |
| `register_bettor` | optional (≥0.01 NEAR if any) | user / operator | `name: string \| null` (≤30), `on_behalf_of: AccountId \| null` | `Bettor` |
| `deposit` | ≥ 0.01 NEAR | user / operator | `on_behalf_of: AccountId \| null` | `U128` new balance |
| `withdraw` | – | user / operator | `amount: U128 \| null` (default all), `on_behalf_of`, `receiver: AccountId \| null` (default the bettor) | Promise → `bool` (false = transfer failed, balance restored) |
| `buy_shares` | – | user / operator | `market_id`, `is_yes: bool`, `shares: u64`, `max_cost: U128 \| null`, `on_behalf_of` | `QuoteView` |
| `sell_shares` | – | user / operator | `market_id`, `is_yes: bool`, `shares: u64`, `min_proceeds: U128 \| null`, `on_behalf_of` | `QuoteView` |
| `claim` | – | user / operator | `market_id`, `shares: u64 \| null` (default all winning), `on_behalf_of` | `U128` payout |
| `withdraw_market_surplus` | – | admin, resolved market | `market_id` | `U128` moved into the treasury |
| `admin_withdraw` | – | admin | `amount: U128 \| null` (default whole treasury), `receiver: AccountId \| null` | Promise → `bool` |
| `ban_bettor` / `unban_bettor` | – | admin | `account_id` | – |
| `add_admin` / `remove_admin` | – | admin | `account_id` | – |
| `set_operator` | – | admin | `operator: AccountId \| null` | – |
| `set_fee_bps` | – | admin | `fee_bps: u16` | – |
| `set_default_share_value` | – | admin | `share_value: U128` (new markets only) | – |

Use ~50 Tgas for `withdraw` and `admin_withdraw`, because they schedule a transfer and a callback. 30 Tgas is enough for the other methods.
The `on_bettor_withdraw` and `on_admin_withdraw` methods are private callbacks.

## View methods

| method | args | returns |
|---|---|---|
| `get_config` | – | `{ admins, operator, fee_bps, default_share_value, treasury, market_count, min_deposit }` |
| `get_required_liquidity` | `lmsr_b: u64` | `U128` |
| `list_markets` | `from_index: u32 \| null`, `limit: u32 \| null` (default 50, max 100) | `Market[]` |
| `get_market` | `market_id` | `Market \| null` |
| `get_prices` | `market_id` | `{ yes: number, no: number }` (probabilities, 0..1) |
| `quote_buy` | `market_id`, `is_yes`, `shares` | `QuoteView` |
| `quote_sell` | `market_id`, `is_yes`, `shares` | `QuoteView` |
| `get_bettor` | `account_id` | `Bettor \| null` |
| `get_balance` | `account_id` | `U128` |
| `get_position` | `market_id`, `account_id` | `PositionView \| null` |
| `get_positions` | `account_id` | `PositionView[]` |

## Types

```ts
type Market = {
  market_id: string; name: string; description: string; creator: string;
  lmsr_b: number; deadline_sec: number; created_at_sec: number;
  share_value: string; initial_deposit: string; collateral: string; fees_collected: string;
  status: "Active" | "Resolved"; outcome: "Yes" | "No" | null;
  yes_shares: number; no_shares: number; // outstanding (after resolution: unclaimed)
};
type Bettor = { name: string | null; balance: string; net_profit: string /* signed */; is_banned: boolean; markets: string[] };
type PositionView = { market_id: string; account_id: string; yes_shares: number; no_shares: number; spent: string; earned: string };
type QuoteView = { base: string; fee: string; total: string }; // buy: total debited; sell: net credited
```
