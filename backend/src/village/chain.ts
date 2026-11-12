import 'dotenv/config'
// NEAR bridge for the village: keeps the NEP-245 contract in step with the game.
//
// * Player trades with shopkeepers are sent as real `trade` calls (atomic coin <-> goods swap).
// * Everything else (gathering, crafting, townsfolk sales, upkeep, NPC-to-NPC trades) is settled
//   every few seconds with one `apply_deltas` call, so the chain always ends up with the true balances.
// * Shopkeepers and players get real NEAR sub-accounts (their wallets), created on first use.
//
// All calls are signed by the game server account, which is the contract operator. Players never
// see a key, a wallet popup or a gas fee.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { Account, JsonRpcProvider, KeyPair } from 'near-api-js'
import { Delta, Wallets } from './wallets'

const NETWORK = process.env.NEAR_NETWORK || 'testnet'
const RPC = process.env.NEAR_RPC_URL || `https://rpc.${NETWORK}.fastnear.com`
export const ROOT = process.env.NEAR_ROOT_ACCOUNT || 'hearthwork.testnet'
export const ITEMS_CONTRACT = process.env.NEAR_ITEMS_CONTRACT || `items.${ROOT}`
export const MARKET_CONTRACT = process.env.NEAR_MARKET_CONTRACT || `market.${ROOT}`
export const POOL_CONTRACT = process.env.NEAR_POOL_CONTRACT || `pool.${ROOT}`
export const EXPLORER = process.env.NEAR_EXPLORER || `https://testnet.nearblocks.io`

const TGAS = 1_000_000_000_000n
const ACCOUNT_FUNDING = 3_000_000_000_000_000_000_000n // 0.003 NEAR: covers storage for an empty wallet account

export interface ChainTx {
    hash: string
    method: string
    summary: string
    ok: boolean
    at: number
}

function loadKey(): string | null {
    if (process.env.NEAR_PRIVATE_KEY) return process.env.NEAR_PRIVATE_KEY
    const file = path.join(os.homedir(), '.near-credentials', NETWORK, `${ROOT}.json`)
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).private_key
    } catch {
        return null
    }
}

class Chain {
    provider = new JsonRpcProvider({ url: RPC })
    account: Account | null = null
    publicKey: string | null = null
    enabled = false
    recent: ChainTx[] = []
    private queue: Promise<unknown> = Promise.resolve()
    private created = new Set<string>()
    private listeners: ((tx: ChainTx) => void)[] = []

    init() {
        const key = loadKey()
        if (!key || process.env.NEAR_DISABLED === 'true') {
            console.log('[near] no server key found: running the village OFF-CHAIN (set NEAR_PRIVATE_KEY to enable)')
            return
        }
        this.account = new Account(ROOT, this.provider, key as any)
        this.publicKey = KeyPair.fromString(key as any).getPublicKey().toString()
        this.enabled = true
        console.log(`[near] server ${ROOT} → items ${ITEMS_CONTRACT}, market ${MARKET_CONTRACT}, pool ${POOL_CONTRACT}`)
    }

    onTx(fn: (tx: ChainTx) => void) {
        this.listeners.push(fn)
    }

    /** Run chain work one call at a time so nonces and balances never race. */
    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const p = this.queue.then(fn, fn)
        this.queue = p.catch(() => undefined)
        return p
    }

    private record(method: string, summary: string, res: any, ok: boolean) {
        const tx: ChainTx = { hash: res?.transaction_outcome?.id ?? res?.transaction?.hash ?? '', method, summary, ok, at: Date.now() }
        this.recent.unshift(tx)
        this.recent.length = Math.min(this.recent.length, 50)
        this.listeners.forEach(l => l(tx))
        console.log(`[near] ${ok ? "ok  " : "FAIL"} ${method}: ${summary.slice(0, 120)} ${tx.hash}`)
        return tx
    }

    async view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
        return (await this.provider.callFunction({ contractId, method, args })) as T
    }

    /** Signed call from the server account. Returns the tx, throws on failure. */
    call(contractId: string, methodName: string, args: object, summary: string, opts: { gas?: bigint; deposit?: bigint } = {}) {
        return this.enqueue(async () => {
            if (!this.account) throw new Error('NEAR is disabled')
            let res: any
            try {
                res = await this.account.callFunctionRaw({
                    contractId, methodName, args,
                    gas: opts.gas ?? 100n * TGAS,
                    deposit: opts.deposit ?? 0n,
                })
            } catch (e: any) {
                this.record(methodName, `${summary} (failed: ${String(e?.message ?? e).slice(0, 120)})`, null, false)
                throw e
            }
            const failure = res?.status?.Failure
            const tx = this.record(methodName, summary, res, !failure)
            if (failure) throw new Error(`${methodName} failed: ${JSON.stringify(failure).slice(0, 200)}`)
            return { tx, res }
        })
    }

    /** Create `<name>.<root>` as a real NEAR account controlled by the server key (a custodial game wallet). */
    ensureAccount(accountId: string) {
        if (!this.enabled || this.created.has(accountId) || !accountId.endsWith(`.${ROOT}`)) return Promise.resolve()
        this.created.add(accountId)
        return this.enqueue(async () => {
            try {
                await this.provider.viewAccount({ accountId } as any)
                return // already exists
            } catch { /* not found → create */ }
            try {
                const res = await this.account!.createAccount({ newAccountId: accountId, publicKey: this.publicKey!, nearToTransfer: ACCOUNT_FUNDING } as any)
                this.record('create_account', `Created wallet ${accountId}`, res, true)
            } catch (e: any) {
                if (!String(e?.message).includes('already exists')) {
                    this.created.delete(accountId)
                    console.error('[near] account creation failed', accountId, e?.message)
                }
            }
        })
    }

    /** Player <-> shopkeeper trade as one atomic NEP-245 swap. */
    trade(wallets: Wallets, buyer: string, seller: string, good: string, qty: number, unitPrice: number) {
        if (!this.enabled) return
        const legs: Delta[] = [
            { party: buyer, accountId: wallets.accountId(buyer), token: 'coin', amount: -qty * unitPrice },
            { party: seller, accountId: wallets.accountId(seller), token: 'coin', amount: qty * unitPrice },
            { party: seller, accountId: wallets.accountId(seller), token: good, amount: -qty },
            { party: buyer, accountId: wallets.accountId(buyer), token: good, amount: qty },
        ]
        // Count it as synced now so the next settlement does not apply it twice; undo if the call fails.
        wallets.markSynced(legs)
        const summary = `${wallets.name(buyer)} bought ${qty} ${good} from ${wallets.name(seller)} for ${qty * unitPrice} coin`
        // Make sure both sides' earlier changes are on chain first.
        this.settle(wallets, 'before trade')
        this.call(ITEMS_CONTRACT, 'trade', {
            buyer_id: wallets.accountId(buyer), seller_id: wallets.accountId(seller),
            token_id: good, amount: String(qty), price: String(qty * unitPrice), memo: summary,
        }, summary).catch(() => wallets.markSynced(legs.map(l => ({ ...l, amount: -l.amount }))))
    }

    /** Push every balance change since the last sync in batched apply_deltas calls. */
    settle(wallets: Wallets, memo: string) {
        if (!this.enabled) return Promise.resolve()
        return this.enqueue(async () => {
            const deltas = wallets.pendingDeltas()
            if (!deltas.length) return
            for (let i = 0; i < deltas.length; i += 40) {
                const batch = deltas.slice(i, i + 40)
                const entries = batch.map(d => ({ account_id: d.accountId, token_id: d.token, amount: String(Math.abs(d.amount)), increase: d.amount > 0 }))
                const ups = batch.filter(d => d.amount > 0).length
                const summary = `Settled ${batch.length} balance changes (${ups} up, ${batch.length - ups} down): ${memo}`
                try {
                    if (!this.account) return
                    const res: any = await this.account.callFunctionRaw({ contractId: ITEMS_CONTRACT, methodName: 'apply_deltas', args: { entries, memo }, gas: 300n * TGAS })
                    const failure = res?.status?.Failure
                    this.record('apply_deltas', summary, res, !failure)
                    if (!failure) wallets.markSynced(batch)
                    else console.error('[near] apply_deltas failed', JSON.stringify(failure).slice(0, 300))
                } catch (e: any) {
                    this.record('apply_deltas', `${summary} (failed)`, null, false)
                    console.error('[near] apply_deltas error', e?.message)
                }
            }
        })
    }

    explorerTx(hash: string) {
        return `${EXPLORER}/txns/${hash}`
    }
}

export const chain = new Chain()
