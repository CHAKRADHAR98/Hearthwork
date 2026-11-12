// Balances of every village party (players and shopkeepers), mirrored to the NEP-245 contract.
//
// The game keeps balances in memory so it can run at 60fps and fast-forward a week in a minute.
// `chain.ts` regularly pushes the difference between these balances and what is on-chain,
// so the contract always ends up holding the true balances of every NEAR account.

export interface Profile {
    name: string
    accountId: string
    /** Hat token id the player wears (shown on their character everywhere). */
    hat?: string
    /** Rare finds ever collected, for the collection book. */
    found?: string[]
    /** Uses left on each tool the player owns (the next one starts fresh when this one breaks). */
    wear?: Record<string, number>
    /** Gathers since the last rare find (the lucky streak). */
    sinceRare?: number
}

export interface Delta {
    party: string
    accountId: string
    token: string
    /** positive = mint/credit on chain, negative = burn/debit on chain */
    amount: number
}

const ROOT = () => process.env.NEAR_ROOT_ACCOUNT || 'hearthwork.testnet'

export function sanitizeAccountPart(s: string) {
    const clean = s.toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[-_]+|[-_]+$/g, '')
    return clean.slice(0, 24) || 'player'
}

export class Wallets {
    balances: Record<string, Record<string, number>> = {}
    synced: Record<string, Record<string, number>> = {}
    profiles: Record<string, Profile> = {}

    balance(party: string, token: string) {
        return this.balances[party]?.[token] ?? 0
    }

    all(party: string) {
        return { ...(this.balances[party] ?? {}) }
    }

    credit(party: string, token: string, qty: number) {
        if (qty < 0 || !Number.isFinite(qty)) throw new Error(`bad credit ${qty}`)
        const b = (this.balances[party] ??= {})
        b[token] = (b[token] ?? 0) + qty
    }

    debit(party: string, token: string, qty: number) {
        if (qty < 0 || !Number.isFinite(qty)) throw new Error(`bad debit ${qty}`)
        const have = this.balance(party, token)
        if (have < qty) throw new Error(`${this.name(party)} has ${have} ${token}, needs ${qty}`)
        this.balances[party][token] = have - qty
    }

    registerPlayer(uid: string, username: string, accountId?: string) {
        if (!this.profiles[uid]) {
            this.profiles[uid] = { name: username, accountId: accountId ?? `${sanitizeAccountPart(username)}-${uid.slice(0, 6)}.${ROOT()}` }
        } else {
            this.profiles[uid].name = username
        }
        return this.profiles[uid]
    }

    name(party: string) {
        if (party.startsWith('shop:')) return party.split(':')[2]
        return this.profiles[party]?.name ?? 'someone'
    }

    /** NEAR account id that holds this party's tokens. */
    accountId(party: string) {
        if (party.startsWith('shop:')) {
            const [, realmId, shopId] = party.split(':')
            return `${shopId}-${realmId.replace(/-/g, '').slice(0, 8)}.${ROOT()}`
        }
        return this.profiles[party]?.accountId ?? `${sanitizeAccountPart(party)}.${ROOT()}`
    }

    /** Everything that changed since the last chain sync. */
    pendingDeltas(): Delta[] {
        const out: Delta[] = []
        const parties = new Set([...Object.keys(this.balances), ...Object.keys(this.synced)])
        for (const party of parties) {
            const tokens = new Set([...Object.keys(this.balances[party] ?? {}), ...Object.keys(this.synced[party] ?? {})])
            for (const token of tokens) {
                const d = this.balance(party, token) - (this.synced[party]?.[token] ?? 0)
                if (d !== 0) out.push({ party, accountId: this.accountId(party), token, amount: d })
            }
        }
        return out
    }

    markSynced(deltas: Delta[]) {
        for (const d of deltas) {
            const s = (this.synced[d.party] ??= {})
            s[d.token] = (s[d.token] ?? 0) + d.amount
        }
    }

    toJSON() {
        return { balances: this.balances, synced: this.synced, profiles: this.profiles }
    }

    static fromJSON(j: any) {
        const w = new Wallets()
        Object.assign(w, j)
        return w
    }
}
