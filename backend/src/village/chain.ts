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
import { Account, actions, JsonRpcProvider, KeyPair } from 'near-api-js'
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
    /** Call a contract AS a player's wallet (gasless for the player), so the player is the real caller on-chain. */
    callAs(accountId: string, contractId: string, methodName: string, args: object, summary: string, opts: { gas?: bigint; deposit?: bigint } = {}) {
        return this.enqueue(async () => {
            if (!this.enabled) throw new Error('NEAR is disabled on this server')
            const key = loadKey()!
            const player = new Account(accountId, this.provider, key as any)
            let res: any
            try {
                // NEP-366 meta transaction: the player signs, the server relays it and pays the gas.
                // Any attached deposit (a bet, a pool deposit) still comes out of the player's own wallet.
                const { signedDelegate } = await player.createSignedMetaTransaction({
                    receiverId: contractId,
                    actions: [actions.functionCall(methodName, args, opts.gas ?? 30n * TGAS, opts.deposit ?? 0n)],
                } as any)
                res = await this.account!.signAndSendTransaction({
                    receiverId: accountId,
                    actions: [actions.signedDelegate(signedDelegate)],
                    throwOnFailure: false,
                } as any)
            } catch (e: any) {
                this.record(methodName, `${summary} (failed)`, null, false)
                throw new Error(cleanError(e?.message ?? String(e)))
            }
            const failure = res?.status?.Failure
            const tx = this.record(methodName, summary, res, !failure)
            if (failure) throw new Error(cleanError(JSON.stringify(failure)))
            let value: any = null
            try {
                const b64 = res?.status?.SuccessValue
                if (b64) value = JSON.parse(Buffer.from(b64, 'base64').toString())
            } catch { /* not JSON */ }
            return { tx, value }
        })
    }

    async nearBalance(accountId: string): Promise<bigint> {
        try {
            const a: any = await this.provider.viewAccount({ accountId } as any)
            return BigInt(a.amount ?? a.balance?.total ?? 0)
        } catch {
            return 0n
        }
    }

    ensureAccount(accountId: string, funding: bigint = ACCOUNT_FUNDING) {
        if (!this.enabled || this.created.has(accountId) || !accountId.endsWith(`.${ROOT}`)) return Promise.resolve()
        this.created.add(accountId)
        return this.enqueue(async () => {
            try {
                await this.provider.viewAccount({ accountId } as any)
                return // already exists
            } catch { /* not found → create */ }
            try {
                const res = await this.account!.createAccount({ newAccountId: accountId, publicKey: this.publicKey!, nearToTransfer: funding } as any)
                this.record('create_account', `Created wallet ${accountId}${funding > ACCOUNT_FUNDING ? ` with a ${formatNear(funding)} NEAR welcome grant` : ''}`, res, true)
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
                    else {
                        console.error('[near] apply_deltas failed', JSON.stringify(failure).slice(0, 300))
                        await this.resync(wallets, batch)
                    }
                } catch (e: any) {
                    this.record('apply_deltas', `${summary} (failed)`, null, false)
                    console.error('[near] apply_deltas error', e?.message)
                    await this.resync(wallets, batch)
                }
            }
        })
    }

    /**
     * Self-healing: if a batch was rejected, our idea of the on-chain balances drifted (for example a queued
     * transaction was lost when the server restarted). Read the real balances back from the contract so the
     * next settlement sends exactly the right corrections.
     */
    private async resync(wallets: Wallets, batch: Delta[]) {
        const parties = [...new Map(batch.map(d => [d.party, d.accountId])).entries()]
        for (const [party, accountId] of parties) {
            try {
                const onChain: { token_id: string; amount: string }[] = await this.view(ITEMS_CONTRACT, 'balances_of', { account_id: accountId })
                const tokens = new Set([...Object.keys(wallets.synced[party] ?? {}), ...onChain.map(b => b.token_id)])
                const fresh: Record<string, number> = {}
                for (const t of tokens) fresh[t] = Number(onChain.find(b => b.token_id === t)?.amount ?? 0)
                wallets.synced[party] = fresh
            } catch (e: any) {
                console.error('[near] resync failed for', accountId, e?.message)
            }
        }
        console.log(`[near] resynced ${parties.length} accounts from chain`)
    }

    explorerTx(hash: string) {
        return `${EXPLORER}/txns/${hash}`
    }
}

export const chain = new Chain()

export const YOCTO = 10n ** 24n
export function formatNear(yocto: bigint | string, digits = 4) {
    const v = BigInt(yocto)
    const whole = v / YOCTO
    const frac = (v % YOCTO).toString().padStart(24, '0').slice(0, digits).replace(/0+$/, '')
    return frac ? `${whole}.${frac}` : `${whole}`
}
export function parseNear(near: number | string): bigint {
    const [w, f = ''] = String(near).split('.')
    return BigInt(w || '0') * YOCTO + BigInt((f + '0'.repeat(24)).slice(0, 24))
}
/** Turn NEAR panics into a readable sentence. */
export function cleanError(raw: string) {
    const m = raw.match(/Smart contract panicked: ([^"\\]+)/) || raw.match(/panicked at [^:]+:\d+:\d+:\s*([^"\\]+)/) || raw.match(/"ExecutionError":"([^"]+)"/)
    return (m ? m[1] : raw).slice(0, 200)
}
