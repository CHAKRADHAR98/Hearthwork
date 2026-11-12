// Office finance on NEAR: prediction markets (market.hearthwork.testnet) and the team pool (pool.hearthwork.testnet).
// Each player signs with their own NEAR wallet account
// (a custodial account the server created for them at sign-in), so bets and deposits are truly theirs.

import { Socket } from 'socket.io'
import { z } from 'zod'
import { chain, formatNear, MARKET_CONTRACT, parseNear, POOL_CONTRACT } from '../village/chain'
import { villageManager } from '../village/manager'

const TGAS = 1_000_000_000_000n
const GAS_RESERVE = parseNear('0.005') // keep some NEAR in the wallet for gas

type Ctx = { uid: string; username: string; realmId: string; accountId: string }

function marketPrefix(realmId: string) {
    return `${realmId.replace(/-/g, '').slice(0, 8)}-`
}

export function attachFinance(socket: Socket, getContext: () => { uid: string; username: string; realmId: string } | null) {
    const handle = <T extends z.ZodTypeAny>(event: string, schema: T, fn: (ctx: Ctx, data: z.infer<T>) => Promise<any>) => {
        socket.on(event, async (data: unknown, ack?: (res: any) => void) => {
            const reply = typeof ack === 'function' ? ack : () => {}
            const parsed = schema.safeParse(data ?? {})
            if (!parsed.success) return reply({ error: 'Invalid request.' })
            const ctx = getContext()
            if (!ctx) return reply({ error: 'Join an office first.' })
            if (!chain.enabled) return reply({ error: 'NEAR is not configured on this server.' })
            const profile = villageManager.ensurePlayer(ctx.uid, ctx.username)
            try {
                reply({ ok: true, ...(await fn({ ...ctx, accountId: profile.accountId }, parsed.data)) })
            } catch (e: any) {
                reply({ error: e?.message ?? 'Something went wrong.' })
            }
        })
    }

    // ───────────────────────── prediction markets ─────────────────────────

    handle('markets:list', z.object({}), async ({ realmId, accountId }) => {
        const all: any[] = await chain.view(MARKET_CONTRACT, 'list_markets', { from_index: 0, limit: 200 })
        const mine = all.filter(m => m.market_id.startsWith(marketPrefix(realmId)))
        const markets = await Promise.all(mine.map(async m => {
            const [prices, position] = await Promise.all([
                chain.view(MARKET_CONTRACT, 'get_prices', { market_id: m.market_id }).catch(() => null),
                chain.view(MARKET_CONTRACT, 'get_position', { market_id: m.market_id, account_id: accountId }).catch(() => null),
            ])
            return { ...m, prices, position }
        }))
        const [balance, wallet, config] = await Promise.all([
            chain.view(MARKET_CONTRACT, 'get_balance', { account_id: accountId }).catch(() => '0'),
            chain.nearBalance(accountId),
            chain.view(MARKET_CONTRACT, 'get_config', {}),
        ])
        return {
            markets: markets.sort((a, b) => b.created_at_sec - a.created_at_sec),
            account: accountId,
            bettorBalance: formatNear(balance as string),
            walletBalance: formatNear(wallet),
            shareValue: formatNear(config.default_share_value),
            feeBps: config.fee_bps,
            contract: MARKET_CONTRACT,
        }
    })

    handle('markets:create', z.object({ question: z.string().min(3).max(50), description: z.string().max(280).default(''), hours: z.number().min(0.05).max(24 * 30), liquidity: z.number().int().min(5).max(200).default(20) }), async ({ realmId, username, accountId }, d) => {
        const marketId = `${marketPrefix(realmId)}${Date.now().toString(36)}`
        const required: string = await chain.view(MARKET_CONTRACT, 'get_required_liquidity', { lmsr_b: d.liquidity })
        // The server (market operator) seeds liquidity; the player who asked becomes the creator and can resolve it.
        const { res } = await chain.call(MARKET_CONTRACT, 'create_market', {
            market_id: marketId, name: d.question, description: d.description || `Asked by ${username}`,
            lmsr_b: d.liquidity, deadline_sec: Math.floor(Date.now() / 1000 + d.hours * 3600), creator: accountId,
        }, `${username} opened prediction market “${d.question}”`, { deposit: BigInt(required) + 1n, gas: 100n * TGAS })
        return { marketId, tx: res?.transaction_outcome?.id }
    })

    /** Buy YES/NO shares from the player's own wallet, topping up their market balance as needed. */
    handle('markets:buy', z.object({ marketId: z.string(), isYes: z.boolean(), shares: z.number().int().min(1).max(1000) }), async ({ username, accountId }, d) => {
        const quote: any = await chain.view(MARKET_CONTRACT, 'quote_buy', { market_id: d.marketId, is_yes: d.isYes, shares: d.shares })
        const total = BigInt(quote.total)
        const balance = BigInt(await chain.view<string>(MARKET_CONTRACT, 'get_balance', { account_id: accountId }).catch(() => '0'))
        if (balance < total) {
            const need = total - balance
            const topUp = need < parseNear('0.01') ? parseNear('0.01') : need // contract minimum deposit
            const wallet = await chain.nearBalance(accountId)
            if (wallet < topUp + GAS_RESERVE) throw new Error(`Your wallet has ${formatNear(wallet)} NEAR; this bet needs ${formatNear(topUp)} NEAR more.`)
            await chain.callAs(accountId, MARKET_CONTRACT, 'deposit', {}, `${username} deposited ${formatNear(topUp)} NEAR to bet`, { deposit: topUp })
        }
        const max = (total * 102n) / 100n // 2% slippage guard
        const { tx } = await chain.callAs(accountId, MARKET_CONTRACT, 'buy_shares', { market_id: d.marketId, is_yes: d.isYes, shares: d.shares, max_cost: max.toString() },
            `${username} bought ${d.shares} ${d.isYes ? 'YES' : 'NO'} shares`, { gas: 50n * TGAS })
        return { cost: formatNear(total), tx: tx.hash }
    })

    handle('markets:sell', z.object({ marketId: z.string(), isYes: z.boolean(), shares: z.number().int().min(1).max(1000) }), async ({ username, accountId }, d) => {
        const quote: any = await chain.view(MARKET_CONTRACT, 'quote_sell', { market_id: d.marketId, is_yes: d.isYes, shares: d.shares })
        const min = (BigInt(quote.total) * 98n) / 100n
        const { tx } = await chain.callAs(accountId, MARKET_CONTRACT, 'sell_shares', { market_id: d.marketId, is_yes: d.isYes, shares: d.shares, min_proceeds: min.toString() },
            `${username} sold ${d.shares} ${d.isYes ? 'YES' : 'NO'} shares`, { gas: 50n * TGAS })
        return { proceeds: formatNear(quote.total), tx: tx.hash }
    })

    handle('markets:quote', z.object({ marketId: z.string(), isYes: z.boolean(), shares: z.number().int().min(1).max(1000), sell: z.boolean().default(false) }), async (_c, d) => {
        const q: any = await chain.view(MARKET_CONTRACT, d.sell ? 'quote_sell' : 'quote_buy', { market_id: d.marketId, is_yes: d.isYes, shares: d.shares })
        return { total: formatNear(q.total, 5), fee: formatNear(q.fee, 5) }
    })

    handle('markets:resolve', z.object({ marketId: z.string(), outcome: z.enum(['Yes', 'No']) }), async ({ username, accountId }, d) => {
        const { tx } = await chain.callAs(accountId, MARKET_CONTRACT, 'resolve_market', { market_id: d.marketId, outcome: d.outcome }, `${username} resolved a market: ${d.outcome.toUpperCase()}`)
        return { tx: tx.hash }
    })

    handle('markets:claim', z.object({ marketId: z.string() }), async ({ username, accountId }, d) => {
        const before = BigInt(await chain.view<string>(MARKET_CONTRACT, 'get_balance', { account_id: accountId }).catch(() => '0'))
        const { tx } = await chain.callAs(accountId, MARKET_CONTRACT, 'claim', { market_id: d.marketId }, `${username} claimed winnings`)
        const after = BigInt(await chain.view<string>(MARKET_CONTRACT, 'get_balance', { account_id: accountId }).catch(() => '0'))
        return { amount: formatNear(after - before), tx: tx.hash }
    })

    handle('markets:withdraw', z.object({}), async ({ username, accountId }) => {
        const { tx } = await chain.callAs(accountId, MARKET_CONTRACT, 'withdraw', {}, `${username} withdrew their market balance to their wallet`, { gas: 60n * TGAS })
        return { tx: tx.hash }
    })

    // ───────────────────────── team pool ─────────────────────────

    handle('pool:get', z.object({}), async ({ realmId, accountId }) => {
        const [pool, limit, wallet, config] = await Promise.all([
            chain.view(POOL_CONTRACT, 'get_pool', { realm_id: realmId }),
            chain.view(POOL_CONTRACT, 'get_withdraw_limit', { realm_id: realmId, account_id: accountId }).catch(() => null),
            chain.nearBalance(accountId),
            chain.view(POOL_CONTRACT, 'get_config', {}),
        ])
        return {
            pool: pool && {
                ...pool,
                balance: formatNear((pool as any).balance),
                total_deposited: formatNear((pool as any).total_deposited),
                total_withdrawn: formatNear((pool as any).total_withdrawn),
            },
            limit: limit && { remaining: formatNear((limit as any).remaining), max: formatNear((limit as any).max_per_window), resetsAt: (limit as any).window_resets_at_sec },
            account: accountId,
            walletBalance: formatNear(wallet),
            minDeposit: formatNear((config as any).min_deposit),
            contract: POOL_CONTRACT,
        }
    })

    handle('pool:deposit', z.object({ amount: z.number().min(0.01).max(100) }), async ({ realmId, username, accountId }, d) => {
        const amount = parseNear(d.amount)
        const wallet = await chain.nearBalance(accountId)
        if (wallet < amount + GAS_RESERVE) throw new Error(`Your wallet has ${formatNear(wallet)} NEAR.`)
        const pool = await chain.view(POOL_CONTRACT, 'get_pool', { realm_id: realmId })
        if (!pool) await chain.callAs(accountId, POOL_CONTRACT, 'initialize_pool', { realm_id: realmId }, `${username} opened the team pool for this office`)
        const { tx } = await chain.callAs(accountId, POOL_CONTRACT, 'deposit', { realm_id: realmId }, `${username} added ${d.amount} NEAR to the team pool`, { deposit: amount })
        return { tx: tx.hash }
    })

    handle('pool:withdraw', z.object({ amount: z.number().min(0.001).max(10) }), async ({ realmId, username, accountId }, d) => {
        const { tx } = await chain.callAs(accountId, POOL_CONTRACT, 'withdraw', { realm_id: realmId, amount: parseNear(d.amount).toString() },
            `${username} withdrew ${d.amount} NEAR from the team pool`, { gas: 60n * TGAS })
        return { tx: tx.hash }
    })
}
