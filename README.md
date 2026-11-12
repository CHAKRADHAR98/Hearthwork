# Hearthwork

**A virtual office for remote teams with a living village economy next door, running on NEAR.**

Walk around your team's pixel-art office, then step into the Market Square. Five shopkeepers run real
shops there. Each one is an AI agent with its own NEAR wallet: it sets prices from supply and demand,
hoards when stock runs low, haggles with you in chat, goes bankrupt when its cash runs out, hires
players to fetch goods, and quietly teams up with the others to lowball anyone who floods the market.
Every good and every coin is a NEP-245 token. Players sign in and never see a seed phrase, a wallet
popup or a gas fee.

Built for **NEAR Hackathon 2026**. Tracks: **Games With Real Economies** (main) and **Agent Economy**.

---

## What you can do

| Every 30 seconds | Every few minutes | Every session |
|---|---|---|
| Gather wheat, iron, fish or wool at the field, mine, dock and pasture | Sell to the shopkeeper who pays most, buy what you need, haggle in chat, take delivery jobs | Invest in shops (and rescue bankrupt ones) for a share of their profit, bet on office predictions, chip into the team pool |

- **Shopkeepers with wallets.** Bram (farmer), Mira (baker), Tor (blacksmith), Nell (fishmonger) and Ivo (tailor) each own a NEAR account (`baker-<office>.hearthwork.testnet`, …). Their coins and goods are NEP-245 balances you can look up on the explorer.
- **Real supply and demand.** Prices react to stock, recent sales and the shopkeeper's cash. Flood the smith with iron and iron gets cheap. **All pricing rules live in one readable file: [`backend/src/village/pricing.ts`](backend/src/village/pricing.ts).** Hover **why?** next to any price to see the shopkeeper's reasoning.
- **A production chain.** Wheat becomes bread, iron becomes tools, wool becomes cloth. Shopkeepers buy from each other, townsfolk buy finished goods, and wandering traders bring ore, so the economy keeps moving without players.
- **Bankruptcy, hiring and investing.** Shops pay upkeep every morning. A shop that can't pay closes until players invest enough to reopen it. Investors earn 40% of its daily profit. Shops short on inputs post delivery jobs ("bring me 9 iron for 45 coins").
- **Collusion.** If one player supplies most of a good in a day, the shopkeepers form a price pact and lowball that player. A pact breaks when a member needs the goods too badly.
- **AI haggling on NEAR AI Cloud.** Each shopkeeper has a personality. The model writes the dialogue and proposes prices, but `pricing.ts` sets hard limits it can't cross. Without an API key, a rule-based haggler takes over.
- **Fast-forward.** One button simulates a week of village life in about a minute so you can watch prices move on the market board.
- **Office prediction markets and team pool.** Ask "Will we ship v2 by Friday?", trade YES/NO shares (LMSR pricing), resolve and claim. Keep a shared NEAR jar with a daily withdraw cap. Players sign these with their own wallets through NEAR meta transactions, and the server pays the gas.

## How NEAR is used

| Piece | Where |
|---|---|
| **NEP-245 multi-token contract**: every good plus `coin`, atomic goods-for-coin `trade`, `craft`, batched `apply_deltas` settlement, NEP-297 events | [`contracts/village_items`](contracts/village_items) → `items.hearthwork.testnet` |
| **Prediction markets** (LMSR, fees, resolve, claim) | [`contracts/prediction_market`](contracts/prediction_market) → `market.hearthwork.testnet` |
| **Team pool** (per-office NEAR pool, 10 NEAR per day withdraw cap) | [`contracts/team_pool`](contracts/team_pool) → `pool.hearthwork.testnet` |
| **Agent wallets**: every shopkeeper and every player gets a real NEAR sub-account | [`backend/src/village/chain.ts`](backend/src/village/chain.ts) `ensureAccount` |
| **Gasless play** (NEP-366 meta transactions: the player's wallet signs, the server relays and pays gas) | `chain.callAs` |
| **NEAR AI Cloud** (OpenAI-compatible) for shopkeeper dialogue and gossip | [`backend/src/village/agents.ts`](backend/src/village/agents.ts) |
| **Social login**: Google sign-in creates the user and their NEAR wallet | [`backend/src/auth/routes.ts`](backend/src/auth/routes.ts) `/auth/google` |

When you trade with a shopkeeper, the game sends one `trade` call: your coins and their goods swap atomically on-chain. Everything else (gathering, crafting, townsfolk purchases, upkeep, shop-to-shop trades) is settled every 15 seconds with a single `apply_deltas` call, so on-chain balances always match the game. Open the **Market board → On NEAR** tab to see every transaction with explorer links.

## Run it locally

Requirements: Node 20+, Docker (for Postgres). To run on NEAR you also need the [near CLI](https://github.com/near/near-cli-rs) and [cargo-near](https://github.com/near/cargo-near).

```bash
git clone https://github.com/CHAKRADHAR98/Hearthwork && cd Hearthwork
docker compose up -d                                   # Postgres with schema
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
(cd backend && npm install) && (cd frontend && npm install)
(cd backend && npm run dev)                            # http://localhost:3001
(cd frontend && npm run dev)                           # http://localhost:3000
```

**Without a NEAR key** the server logs `running the village OFF-CHAIN` and the whole game still works. Only predictions and the team pool need NEAR.

**To run on NEAR testnet** with your own contracts:

```bash
near account create-account sponsor-by-faucet-service <you>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
ROOT=<you>.testnet ./scripts/deploy-contracts.sh       # builds, deploys and initialises all three contracts
# then set NEAR_ROOT_ACCOUNT=<you>.testnet in backend/.env and restart the backend
```

Optional: set `NEARAI_API_KEY` (AI shopkeepers) and `GOOGLE_CLIENT_ID` (Google sign-in) in `backend/.env`.

## Try it (do X → see Y)

1. Open http://localhost:3000, register (or **Continue with Google**), click **Create Space**, then **Join** the office.
   → A HUD in the top-left shows the clock, your 40 starting coins and your NEAR wallet (`<name>-xxxxxx.hearthwork.testnet`).
2. Click **🚶 Market**. → You walk to the Market Square: five stalls with shopkeepers and four gathering spots.
3. Stand by the **⛏️ Iron mine** and press **E**. → "Gathered +1 🪨 Iron ore". There's a 20 s cooldown per spot.
4. Walk to **Tor** and press **E**, then **Sell** your iron. → Coins go up. In **Market board → On NEAR** a `trade` transaction appears with an explorer link.
5. In Mira's shop, type "I'll give you 7 each" in **Haggle**. → She answers in character with a counter-offer. **Accept** buys at the agreed price.
6. Hover **why?** next to any price. → The shopkeeper's reasoning from `pricing.ts`, for example "Stock 3/20 → +87%; Hoarding (stock is low)".
7. Click **⏩ 1 week**, then **📈 Board**. → Prices move hour by hour. Some shops thrive, some post jobs, a struggling one may go **bankrupt**. Invest in it from its shop panel to reopen it.
8. Sell lots of one good in a single day. → A toast says the shopkeepers "agree to lowball" you. The shop panel warns you, and the offered price drops 25%.
9. Click **🎯 Predictions**, ask a question and set it to "closes in 6 min", then **Buy YES**. → Two meta transactions from *your* wallet, deposit then buy, with the gas paid by Hearthwork. After the deadline the asker resolves it and winners **Claim**.
10. Click **🏦 Team pool** and **Deposit** 0.01 NEAR. → The pool balance is read from `pool.hearthwork.testnet`.

## Tests

```bash
cd contracts/village_items && cargo test        # 9 tests: mint, craft, atomic trade, apply_deltas, NEP-245 transfers
cd contracts/prediction_market && cargo test    # 37 tests: LMSR buy/sell, fees, resolve, claim, solvency fuzz
cd contracts/team_pool && cargo test            # 21 tests: deposits, daily cap, window reset, failed-transfer rollback
cd backend && npm run sim -- 14                 # headless economy: 14 days, prices, cash, bankruptcies
cd backend && npm run sim -- 7 --flood          # a player floods iron → watch the price pact form and break
cd backend && npx tsx scripts/smoke.ts          # end-to-end against a running backend: gather, sell, haggle, invest, fast-forward
cd backend && npx tsx scripts/finance-smoke.ts  # markets + pool on testnet: create, buy, sell, resolve, claim, deposit, withdraw
```

## Code map

```
contracts/village_items/        NEP-245 goods + coin (Rust, near-sdk 5)
contracts/prediction_market/    LMSR prediction markets (Rust)
contracts/team_pool/            per-office NEAR pool (Rust)
backend/src/village/pricing.ts  ← every price rule, in one file
backend/src/village/village.ts  economy simulation (one tick = one game hour)
backend/src/village/shops.ts    the five shopkeepers: personalities, recipes, targets
backend/src/village/agents.ts   NEAR AI haggling within pricing limits
backend/src/village/chain.ts    NEAR bridge: wallets, trades, settlement, meta transactions
backend/src/village/manager.ts  per-office villages, persistence, socket API
backend/src/finance/finance.ts  prediction markets + team pool API
frontend/utils/pixi/village/    Market Square inside the Pixi.js office world
frontend/app/play/village/      HUD, shop panel, market board
frontend/app/play/finance/      predictions + team pool panels
```

## Built during the hackathon vs. before

The repository's first commit ([`863fbf1`](../../commit/863fbf1), tag `pre-hackathon`) imports the office engine from an earlier project of mine: tile world, avatars, proximity video, map editor and the Express/Socket.io backend. It also contained Solana programs, which were **removed and replaced by NEAR**. **Everything after that commit was built during NEAR Hackathon 2026**: the three NEAR contracts, the village economy and AI shopkeepers, the Market Square, the NEAR prediction markets and team pool, gasless meta transactions, and Google sign-in.
Full diff: [`pre-hackathon...main`](../../compare/pre-hackathon...main).

Libraries: near-sdk (Rust), near-api-js, google-auth-library, Next.js, Pixi.js, Socket.io, Express, PostgreSQL, Tailwind.

## License

MIT
