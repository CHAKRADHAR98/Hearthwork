# Hearthwork

**A virtual office for remote teams with a living village economy next door, running on NEAR.**

Walk around your team's pixel-art office, then step into the Market Square. Five shopkeepers run real
shops there. Each one is an AI agent with its own NEAR wallet: it sets prices from supply and demand,
hoards when stock runs low, haggles with you in chat, goes bankrupt when its cash runs out, hires
players to fetch goods, and quietly teams up with the others to lowball anyone who floods the market.
Every good and every coin is a NEP-245 token. Players sign in and never see a seed phrase, a wallet
popup or a gas fee.

Built for **NEAR Hackathon 2026**. Tracks: **Games With Real Economies** (main) and **Agent Economy**.

### ▶ Live demo: **https://hearthwork.vercel.app**
Register with any username and password (or **Continue with Google**). No wallet, no seed phrase, no gas.
The demo runs on NEAR **testnet** and stays up until at least 2026-11-25. Demo video: _[link to the X post]_.

---

## The problem

**Game economies are fake.** NPC merchants have bottomless pockets and fixed price lists. Nothing you do changes the
market, so trading is a chore instead of a game.

**Crypto games make you notice the chain.** Wallet pop-ups, seed phrases and gas fees greet players before any fun
starts, and most "on-chain economies" are just tokens bolted onto a static game.

**Remote teams have nothing to do together.** Virtual offices copy the floor plan, but give people no shared goal and
no reason to drop by.

**Hearthwork answers all three:** a pixel office with a Market Square where AI shopkeepers run real businesses with real
NEAR wallets, prices come from actual supply and demand, the whole team plays together, and the blockchain stays
completely out of sight.

## What you can do

| Every 30 seconds | Every few minutes | Every session |
|---|---|---|
| Gather wheat, iron, fish or wool at the field, mine, dock and pasture, and sometimes find something rare | Sell to the shopkeeper who pays most, haggle in chat, fill shopkeeper requests, buy a better tool or a hat | Build landmarks with your whole office, fill the collection book, invest in shops, bet on office predictions, chip into the team pool |

- **📜 Requests board.** Shopkeepers post small, big and ⏰ urgent requests ("Mira needs 6 fish for a fish pie at the mayor's dinner, pays 72"). Some come from real shortages in their shop, others are townsfolk orders. Deliver from anywhere in the square (**R**).
- **✨ Rare finds and a collection book.** Each gathering spot hides two rare items (gem, pearl, golden fleece…). A **lucky streak** makes every empty gather raise the odds of the next find, so nobody waits forever. Find all 8 to earn the 👑 Collector's crown (**B**).
- **🛠️ Tools and 🎩 hats.** Tor sells tools that double what you gather at one spot and wear out after 25 uses. Ivo sells hats that your character wears, in the Market Square and in the office. Making either uses up the shop's own tools or cloth, so players become real customers of the economy.
- **🏗️ Team builds.** The whole office donates goods and coins to build a landmark: 🌉 Old Bridge → ⛲ Golden Fountain → 🪣 Wishing Well. Each one gives a permanent village bonus and **appears on that office's map**. It shows up live in its Market Square, and the owner can move it anywhere with the editor's 🏆 landmarks palette. Other offices see it locked, and the server removes locked landmarks from any map that is saved (**T**).

- **Shopkeepers with wallets.** Bram (farmer), Mira (baker), Tor (blacksmith), Nell (fishmonger) and Ivo (tailor) each own a NEAR account (`baker-<office>.hearthwork.testnet`, …). Their coins and goods are NEP-245 balances you can look up on the explorer.
- **Real supply and demand.** Prices react to stock, recent sales and the shopkeeper's cash. Flood the smith with iron and iron gets cheap. **All pricing rules live in one readable file: [`backend/src/village/pricing.ts`](backend/src/village/pricing.ts).** Hover **why?** next to any price to see the shopkeeper's reasoning.
- **A production chain.** Wheat becomes bread, iron becomes tools, wool becomes cloth. Shopkeepers buy from each other, townsfolk buy finished goods, and wandering traders bring ore, so the economy keeps moving without players.
- **Bankruptcy, hiring and investing.** Shops pay upkeep every morning. A shop that can't pay closes until players invest enough to reopen it. Investors earn 40% of its daily profit. Shops short on inputs post delivery jobs ("bring me 9 iron for 45 coins").
- **Collusion.** If one player supplies most of a good in a day, the shopkeepers form a price pact and lowball that player. A pact breaks when a member needs the goods too badly.
- **AI haggling on NEAR AI Cloud.** Each shopkeeper has a personality. The model writes the dialogue and proposes prices, but `pricing.ts` sets hard limits it can't cross. Without an API key, a rule-based haggler takes over.
- **Ready-made village, fully editable.** New offices start in a village office (fountain plaza, focus garden and meeting court as private video areas, a lounge and a team garden), and the Market Square comes with a shop lane, fields, a mine, a pond and a pasture. Owners can change both in the map editor or build their own.
- **Fast-forward.** One button simulates a week of village life in about a minute so you can watch prices move on the market board.
- **Office prediction markets and team pool.** Ask "Will we ship v2 by Friday?", trade YES/NO shares (LMSR pricing), resolve and claim. Keep a shared NEAR jar with a daily withdraw cap. Players sign these with their own wallets through NEAR meta transactions, and the server pays the gas.

## How NEAR is used

| Piece | Where |
|---|---|
| **NEP-245 multi-token contract**: every good plus `coin`, atomic goods-for-coin `trade`, `craft`, batched `apply_deltas` settlement, NEP-297 events | [`contracts/village_items`](contracts/village_items) → `items.hearthwork.testnet` |
| **Prediction markets** (LMSR, fees, resolve, claim) | [`contracts/prediction_market`](contracts/prediction_market) → `market.hearthwork.testnet` |
| **Team pool** (per-office NEAR pool, withdrawals capped at 10 NEAR per person per day) | [`contracts/team_pool`](contracts/team_pool) → `pool.hearthwork.testnet` |
| **Items as tokens**: tools, hats and rare finds are NEP-245 token types too, registered on the contract by the game at startup | `chain.registerTokens`, [`backend/src/village/extras.ts`](backend/src/village/extras.ts) |
| **Agent wallets**: every shopkeeper and every player gets a real NEAR sub-account | [`backend/src/village/chain.ts`](backend/src/village/chain.ts) `ensureAccount` |
| **Gasless play** (NEP-366 meta transactions: the player's wallet signs, the server relays and pays gas) | `chain.callAs` |
| **NEAR AI Cloud** (OpenAI-compatible) for shopkeeper dialogue and gossip | [`backend/src/village/agents.ts`](backend/src/village/agents.ts) |
| **Social login**: Google sign-in creates the user and their NEAR wallet | [`backend/src/auth/routes.ts`](backend/src/auth/routes.ts) `/auth/google` |

When you trade with a shopkeeper, the game sends one `trade` call: your coins and their goods swap atomically on-chain. Everything else (gathering, crafting, townsfolk purchases, upkeep, shop-to-shop trades) is settled every 60 seconds in batched `apply_deltas` calls (up to 100 changes each), so on-chain balances always match the game. A village pauses after 3 minutes with nobody in its office (saved, no gas spent) and resumes on the next visit, and the server audits on-chain balances every 10 minutes to repair any drift. Open the **Market board → On NEAR** tab to see every transaction with explorer links.

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

Optional: set `NEARAI_API_KEY` (AI shopkeepers) and `GOOGLE_CLIENT_ID` (Google sign-in) in `backend/.env`, and
`NEXT_PUBLIC_AGORA_APP_ID` + `APP_CERTIFICATE` (an Agora project in secured mode) in `frontend/.env.local` for proximity video.

**Deploying:** see [DEPLOY.md](DEPLOY.md) (Vercel + Render + Neon, all free tiers). Game state is stored in Postgres (`game_state` table), and the server creates its tables on first start.

## Try it (do X → see Y)

These steps work on the **live demo** (https://hearthwork.vercel.app) and locally (http://localhost:3000).

1. Open the site, click **Start your office**, register with any username and password (or **Continue with Google**), click **Create your first office**, then go back to **Your offices** and click **Enter office →** and **Join**.
   → A HUD in the top-left shows the clock, your 40 starting coins and your NEAR wallet (`<name>-xxxxxx.hearthwork.testnet`).
2. Click **🚶 Market** (or walk up the stone road from the fountain plaza to the glowing **🏘️ Market Square** gate). → You enter the Market Square, a room of its own: five shopkeepers along the shop lane, a stone plaza, and four gathering spots (wheat field, iron mine, fishing pond, sheep pasture). The **⬇ Back to the office** path at the bottom takes you back. Office owners can move the entrance (**Editor → Special Tiles → Market Square**) and redesign the Market Square itself: it appears as a room in the editor, with **Market spot** tiles for each shopkeeper and gathering spot and a **Market exit** tile.
3. Stand by the **⛏️ Iron mine** and press **E**. → "+1 🪨" floats up over your character and the HUD count goes up. There's a 20 s cooldown per spot.
4. Walk to **Tor** and press **E**, then **Sell** your iron. → Coins go up. In **Market board → On NEAR** a `trade` transaction appears with an explorer link.
5. In Mira's shop, type "I'll give you 7 each" in **Haggle**. → She answers in character with a counter-offer. **Accept** buys at the agreed price.
6. Hover **why?** next to any price. → The shopkeeper's reasoning from `pricing.ts`, for example "Stock 3/20 → +87%; Hoarding (stock is low)".
7. Click **⏩ 1 week**, then **📈 Board**. → Prices move hour by hour. Some shops thrive, some post jobs, a struggling one may go **bankrupt**. Invest in it from its shop panel to reopen it.
8. Sell lots of one good in a single day. → A toast says the shopkeepers "agree to lowball" you. The shop panel warns you, and the offered price drops 25%.
9. Click **🎯 Predictions**, ask a question and set it to "closes in 6 min", then **Buy YES**. → Two meta transactions from *your* wallet, deposit then buy, with the gas paid by Hearthwork. After the deadline the asker resolves it and winners **Claim**.
10. Click **🏦 Team pool** and **Deposit** 0.01 NEAR. → The pool balance is read from `pool.hearthwork.testnet`.
11. Press **R**. → The **📜 Requests board** lists what shopkeepers need, why, the reward and the time left. Gather what one asks for and click **Deliver**. → Coins float up and the shopkeeper thanks you in a speech bubble.
12. Keep gathering. → Every so often a **✨ rare find** pops up (the chance grows with each empty gather). Press **B** to see it in your **📖 collection book**, and sell spares in the shop of the shopkeeper who collects them.
13. Open **Tor**'s shop and buy a **⛏️ Pickaxe**, then gather at the mine. → Twice the iron, and the tool's wear bar in your bag goes down. Open **Ivo**'s shop and buy a **👒 Straw hat**. → Your character wears it, and teammates see it in the office too.
14. Press **T** (or walk to the roped-off **🏗️ building site**) and give goods to the **🌉 Old Bridge**. Invite a teammate to help. → When it is complete, everyone in the office sees a celebration and the bridge **appears on your Market Square map**. In **Editor → Tiles → Landmarks** the bridge is now unlocked for this office only, and the fountain and well show 🔒.
15. Open the office's **🔗 share link** in a second browser (or incognito), register a second player and join. Turn on 🎤/📷 in both and walk one character next to the other. → A **proximity video call** starts automatically and ends when you walk apart.

## Tests

```bash
cd contracts/village_items && cargo test        # 9 tests: mint, craft, atomic trade, apply_deltas, NEP-245 transfers
cd contracts/prediction_market && cargo test    # 37 tests: LMSR buy/sell, fees, resolve, claim, solvency fuzz
cd contracts/team_pool && cargo test            # 21 tests: deposits, daily cap, window reset, failed-transfer rollback
cd backend && npm run sim -- 14                 # headless economy: 14 days, prices, cash, bankruptcies
cd backend && npm run sim -- 7 --flood          # a player floods iron → watch the price pact form and break
cd backend && npm run check:features            # requests, rare finds + lucky streak, tools, hats, team build, landmarks on this office's map only
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
backend/src/village/extras.ts   rare finds, tools, hats, team projects and request sizes (all tunable data)
backend/src/village/agents.ts   NEAR AI haggling within pricing limits
backend/src/village/chain.ts    NEAR bridge: wallets, trades, settlement, meta transactions
backend/src/village/manager.ts  per-office villages, persistence, socket API
backend/src/village/marketRoom.ts  the Market Square room: default layout, entrance/exit wiring, team-build sites
backend/src/village/defaultMarket.json  the default Market Square (generated, editable in the map editor)
backend/src/finance/finance.ts  prediction markets + team pool API
frontend/utils/pixi/village/    Market Square inside the Pixi.js office world
frontend/app/play/village/      HUD, shop panel, market board, requests, bag, team build
frontend/scripts/make-landmarks.py  generates the landmark sprites (bridge drawn; fountain and well recast from the village sheet)
frontend/scripts/make-maps.py   generates the default office (frontend/utils/defaultmap.json) and Market Square from existing tiles
frontend/app/play/finance/      predictions + team pool panels
```

## Built during the hackathon vs. before

The repository's first commit ([`863fbf1`](../../commit/863fbf1), tag `pre-hackathon`) imports the office engine from an earlier project of mine: tile world, avatars, proximity video, map editor and the Express/Socket.io backend. It also contained Solana programs, which were **removed and replaced by NEAR**. **Everything after that commit was built during NEAR Hackathon 2026**: the three NEAR contracts, the village economy and AI shopkeepers, the Market Square (requests, rare finds, tools, hats and team-built landmarks), the NEAR prediction markets and team pool, gasless meta transactions, and Google sign-in.
Tags: `pre-hackathon` (the imported baseline) and `hackathon-submission` (the submitted version). Full diff: [`pre-hackathon...hackathon-submission`](../../compare/pre-hackathon...hackathon-submission).

**Libraries and services** (Q-005):
- Contracts: `near-sdk` 5 (Rust), built with `cargo-near`; deployed with `near-cli-rs`.
- Backend: Express, Socket.io, `near-api-js`, `pg` (PostgreSQL / Neon), `google-auth-library`, `jsonwebtoken`, `bcrypt`, `zod`.
- Frontend: Next.js 14, React, Pixi.js, Tailwind CSS, Headless UI, Phosphor/Heroicons, GSAP, **Remotion** (`@remotion/player`, landing hero),
  **Anime.js** (landing motion), **Agora** (`agora-rtc-sdk-ng`, `agora-token`, proximity video), react-toastify.
- Services: NEAR testnet, **NEAR AI Cloud** (shopkeeper dialogue), Google Identity Services, Vercel, Render, Neon.
- Character and tile sprites come from the imported baseline (pre-hackathon).

**AI assistance:** most of the hackathon code was written with **Claude Code** (Anthropic) as a pair programmer, directed and
reviewed by the author. AI-generated code is allowed by the rules (Q-005); everything is committed in this repo's history.

## Security notes and next steps

- **Custodial game wallets.** Players and shopkeepers get real NEAR accounts, but the game server holds their keys so
  nobody sees a wallet or pays gas. The operator key lives only in the host's secret settings, never in this repo.
- **The game server can't change the contracts' code.** Its account is the contracts' operator (it can mint, settle and trade
  within their rules), but the contracts were deployed with separate keys it doesn't hold, so it can't redeploy or replace them.
- **Testnet only.** For mainnet: a separate operator account with a small balance, keys in a cloud KMS, and optional
  non-custodial wallets (passkeys or chain signatures) where the server only relays what players sign.
- Possible next steps: NEAR Intents to cash coins out to other tokens, AI-written request stories, more shops per office.

## License

MIT
