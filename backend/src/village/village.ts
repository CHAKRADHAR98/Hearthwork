// The village economy simulation. One Village per office (realm).
// One tick = one game hour. All prices come from pricing.ts; this file only moves goods and coins.

import { COIN, GATHER_COOLDOWN_SEC, GATHER_SPOTS, GOODS, GOOD_IDS, GoodId, Inventory } from './goods'
import { buyPrice, dailyCosts, haggleCeiling, haggleFloor, PriceQuote, RULES, sellPrice, StockView, townsfolkDemand } from './pricing'
import { DIVIDEND_SHARE, REOPEN_CASH, SHOPS, SHOP_BY_ID, ShopDef, ShopId, TRADER_SUPPLY_DAILY } from './shops'
import { Wallets } from './wallets'
import {
    CROWN, HAT_BY_ID, MAX_REQUESTS, ORDERS, pick, PROJECT_BY_ID, PROJECTS, ProjectEffect, ProjectInfo, RARE_BASE_CHANCE, RARE_BY_ID,
    RARE_MAX_CHANCE, RARE_STREAK_BONUS, RARE_TIER2_SHARE, RARES, REQUEST_SIZES, RequestSize, THANKS, TOOL_BY_ID, TOOL_FOR_SPOT, TOOL_RARE_BONUS,
} from './extras'

export interface ShopState {
    id: ShopId
    coins: number
    /** Coins promised to open jobs. */
    reserved: number
    stock: Inventory
    open: boolean
    /** Units sold per good in each of the last 24 hours (ring buffer, index = hour % 24). */
    soldByHour: Partial<Record<GoodId, number[]>>
    /** Coins at the start of the day, for profit and dividends. */
    dayStartCoins: number
    investors: Record<string, number>
    mood: number
    /** Fractional townsfolk demand / production carried between hours. */
    carry: Partial<Record<string, number>>
}

export interface Job {
    id: string
    shopId: ShopId
    good: GoodId
    qty: number
    reward: number
    postedAt: number
    expiresAt: number
    takenBy?: string
    /** small / big / urgent (older saves have none: treated as small). */
    size?: RequestSize
    /** 'shop': the shop pays and keeps the goods. 'town': a townsfolk order the shop passes on (the customer pays). */
    funded?: 'shop' | 'town'
    /** Why the shopkeeper wants it, shown on the requests board. */
    note?: string
}

export interface ProjectState {
    /** Index into PROJECTS of the one being built now (PROJECTS.length when all are done). */
    index: number
    given: Record<string, number>
    /** Donation points per player (coins worth). */
    helpers: Record<string, number>
}

export interface Built {
    id: string
    day: number
    helpers: string[]
}

export interface Pact {
    good: GoodId
    against: string
    againstName: string
    members: ShopId[]
    until: number
}

export interface VillageEvent {
    id: number
    t: number
    kind: 'trade' | 'bankrupt' | 'reopen' | 'job' | 'pact' | 'invest' | 'gossip' | 'gather' | 'dividend' | 'info' | 'rare' | 'project' | 'built'
    text: string
    shopId?: ShopId
    uid?: string
}

export interface Deal {
    uid: string
    shopId: ShopId
    side: 'buy' | 'sell' // from the player's point of view
    good: GoodId
    qty: number
    unitPrice: number
    expiresAt: number // ms
}

export interface VillageSnapshot {
    t: number
    shops: ShopState[]
    jobs: Job[]
    pacts: Pact[]
    priceHistory: Record<string, { t: number; price: number }[]>
    eventSeq: number
    events: VillageEvent[]
    playerSoldToday: Record<string, Partial<Record<GoodId, number>>>
    marketSoldToday: Partial<Record<GoodId, number>>
    lastGather: Record<string, Record<string, number>>
    project?: ProjectState
    built?: Built[]
}

export const TOWNSFOLK = '@townsfolk' // outside world: coins and goods enter and leave the village here

const sum = (a: number[] | undefined) => (a ? a.reduce((x, y) => x + y, 0) : 0)

export class Village {
    t = 6 // start at 06:00 on day 1
    shops: Record<ShopId, ShopState>
    jobs: Job[] = []
    pacts: Pact[] = []
    priceHistory: Record<string, { t: number; price: number }[]> = {}
    events: VillageEvent[] = []
    eventSeq = 0
    deals: Record<string, Deal> = {}
    playerSoldToday: Record<string, Partial<Record<GoodId, number>>> = {}
    marketSoldToday: Partial<Record<GoodId, number>> = {}
    lastGather: Record<string, Record<string, number>> = {}
    project: ProjectState = { index: 0, given: {}, helpers: {} }
    built: Built[] = []

    constructor(public realmId: string, public wallets: Wallets, private rng: () => number = Math.random) {
        this.shops = {} as Record<ShopId, ShopState>
        for (const def of SHOPS) {
            this.shops[def.id] = {
                id: def.id, coins: def.startCash, reserved: 0, stock: { ...def.startStock }, open: true,
                soldByHour: {}, dayStartCoins: def.startCash, investors: {}, mood: 0, carry: {},
            }
            wallets.credit(this.shopAccount(def.id), COIN, def.startCash)
            for (const [g, q] of Object.entries(def.startStock)) wallets.credit(this.shopAccount(def.id), g, q!)
        }
        this.recordPrices()
    }

    // ───────────────────────── helpers ─────────────────────────

    get day() { return Math.floor(this.t / 24) + 1 }
    get hour() { return this.t % 24 }

    shopAccount(id: ShopId) { return `shop:${this.realmId}:${id}` }

    stockView(shopId: ShopId, good: GoodId): StockView {
        const s = this.shops[shopId]
        const def = SHOP_BY_ID[shopId]
        return {
            stock: s.stock[good] ?? 0,
            target: def.targets[good] ?? 0,
            soldLastDay: sum(s.soldByHour[good]),
            expectedDaily: def.expectedSales?.[good] ?? def.townsfolkDaily[good] ?? 0,
        }
    }

    quoteSell(shopId: ShopId, good: GoodId): PriceQuote {
        return sellPrice(good, this.stockView(shopId, good))
    }

    quoteBuy(shopId: ShopId, good: GoodId, sellerUid?: string): PriceQuote {
        const s = this.shops[shopId]
        const def = SHOP_BY_ID[shopId]
        const own = def.sells.includes(good) ? this.quoteSell(shopId, good).price : undefined
        const pact = !!sellerUid && this.pacts.some(p => p.good === good && p.against === sellerUid && p.members.includes(shopId))
        return buyPrice(good, this.stockView(shopId, good), s.coins - s.reserved, own, pact)
    }

    private log(kind: VillageEvent['kind'], text: string, extra: Partial<VillageEvent> = {}) {
        const ev: VillageEvent = { id: ++this.eventSeq, t: this.t, kind, text, ...extra }
        this.events.push(ev)
        if (this.events.length > 300) this.events.splice(0, this.events.length - 300)
        return ev
    }

    eventsSince(id: number) { return this.events.filter(e => e.id > id) }

    private addStock(shopId: ShopId, good: GoodId, qty: number) {
        const s = this.shops[shopId]
        s.stock[good] = (s.stock[good] ?? 0) + qty
    }

    private noteSale(shopId: ShopId, good: GoodId, qty: number) {
        const s = this.shops[shopId]
        const ring = s.soldByHour[good] ?? (s.soldByHour[good] = new Array(24).fill(0))
        ring[this.hour] += qty
    }

    /** Move goods and coins between two village parties (shops, players or the townsfolk). Returns false if either side is short. */
    private exchange(buyer: string, seller: string, good: GoodId, qty: number, unitPrice: number): boolean {
        const total = qty * unitPrice
        if (qty <= 0) return false
        if (this.balanceOf(buyer, COIN) < total) return false
        if (this.balanceOf(seller, good) < qty) return false
        this.move(buyer, seller, COIN, total)
        this.move(seller, buyer, good, qty)
        return true
    }

    private isShop(party: string): ShopId | null {
        return party.startsWith('shop:') ? (party.split(':')[2] as ShopId) : null
    }

    balanceOf(party: string, token: string): number {
        const shopId = this.isShop(party)
        if (shopId) {
            const s = this.shops[shopId]
            return token === COIN ? s.coins - s.reserved : s.stock[token as GoodId] ?? 0
        }
        if (party === TOWNSFOLK) return Number.MAX_SAFE_INTEGER
        return this.wallets.balance(party, token)
    }

    private move(from: string, to: string, token: string, qty: number) {
        for (const [party, sign] of [[from, -1], [to, 1]] as const) {
            const shopId = this.isShop(party)
            if (shopId) {
                if (token === COIN) this.shops[shopId].coins += sign * qty
                else this.addStock(shopId, token as GoodId, sign * qty)
            }
            if (party === TOWNSFOLK) continue // outside world: coins/goods are minted or burned
            if (sign < 0) this.wallets.debit(this.accountOf(party), token, qty)
            else this.wallets.credit(this.accountOf(party), token, qty)
        }
    }

    private accountOf(party: string) {
        return party // shops use their shop:<realm>:<id> key; players use their uid
    }

    // ───────────────────────── simulation ─────────────────────────

    tick() {
        this.t += 1
        if (this.hour === 0) this.newDay()
        // reset this hour's slot in sales ring buffers
        for (const s of Object.values(this.shops)) for (const ring of Object.values(s.soldByHour)) ring![this.hour] = 0

        const daylight = this.hour >= 6 && this.hour < 20
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (!s.open) continue
            if (daylight && def.produces) this.produce(def, s)
            if (daylight && def.recipe) this.craft(def, s)
        }
        if (daylight) {
            this.shopsRestock()
            this.traders()
            this.townsfolk()
        }
        if (this.hour === 12) this.lunch()
        if (this.hour % 3 === 0) this.postJobs()
        this.expireJobs()
        this.updatePacts()
        this.recordPrices()
    }

    private produce(def: ShopDef, s: ShopState) {
        const p = def.produces!
        let rate = p.perHour
        // The farmer works faster with tools; tools wear out once a day.
        if (def.id === 'farmer') rate *= (s.stock.tools ?? 0) > 0 ? 1.5 : 0.8
        s.carry[p.good] = (s.carry[p.good] ?? 0) + rate
        const whole = Math.floor(s.carry[p.good]!)
        if (whole > 0) {
            s.carry[p.good]! -= whole
            const target = (def.targets[p.good] ?? 0) * 2
            const qty = Math.max(0, Math.min(whole, target - (s.stock[p.good] ?? 0)))
            if (qty > 0) this.mintTo(this.shopAccount(def.id), p.good, qty)
        }
    }

    private craft(def: ShopDef, s: ShopState) {
        const r = def.recipe!
        const target = (def.targets[r.output] ?? 0) * 1.5
        for (let i = 0; i < r.perHour; i++) {
            if ((s.stock[r.output] ?? 0) >= target) break
            const ok = Object.entries(r.inputs).every(([g, q]) => (s.stock[g as GoodId] ?? 0) >= q!)
            if (!ok) break
            for (const [g, q] of Object.entries(r.inputs)) this.burnFrom(this.shopAccount(def.id), g as GoodId, q!)
            this.mintTo(this.shopAccount(def.id), r.output, r.qty)
        }
    }

    /** Shops buy inputs they are short of from other shops that sell them. */
    private shopsRestock() {
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (!s.open) continue
            for (const good of def.buys) {
                const need = (def.targets[good] ?? 0) - (s.stock[good] ?? 0)
                if (need <= 0) continue
                for (const seller of SHOPS) {
                    if (seller.id === def.id || !seller.sells.includes(good) || !this.shops[seller.id].open) continue
                    const q = this.quoteSell(seller.id, good)
                    const affordable = Math.floor((s.coins - s.reserved) / q.price)
                    // won't overpay badly: only buy if price is below 1.6x base
                    if (q.price > GOODS[good].basePrice * 1.6) continue
                    const qty = Math.min(need, q.available, affordable, 6)
                    if (qty > 0 && this.exchange(this.shopAccount(def.id), this.shopAccount(seller.id), good, qty, q.price)) {
                        this.noteSale(seller.id, good, qty)
                        if (qty >= 4) this.log('trade', `${def.name} bought ${qty} ${GOODS[good].name} from ${seller.name} at ${q.price} each`, { shopId: def.id })
                    }
                }
            }
        }
    }

    /** Wandering traders sell raw goods to the shop that offers the most. */
    private traders() {
        for (const [good, daily] of Object.entries(TRADER_SUPPLY_DAILY) as [GoodId, number][]) {
            if (!daily) continue
            const buyers = SHOPS.filter(d => d.buys.includes(good) && this.shops[d.id].open)
            if (!buyers.length) continue
            const key = `trader:${good}`
            const anyShop = this.shops[buyers[0].id]
            anyShop.carry[key] = (anyShop.carry[key] ?? 0) + daily / 14
            let units = Math.floor(anyShop.carry[key]!)
            if (units <= 0) continue
            anyShop.carry[key]! -= units
            const best = buyers.map(d => ({ d, q: this.quoteBuy(d.id, good) })).sort((a, b) => b.q.price - a.q.price)[0]
            // traders walk away if offered less than half the base price
            if (best.q.price < GOODS[good].basePrice * 0.5) continue
            units = Math.min(units, best.q.available)
            if (units > 0 && this.exchange(this.shopAccount(best.d.id), TOWNSFOLK, good, units, best.q.price)) {
                this.marketSoldToday[good] = (this.marketSoldToday[good] ?? 0) + units
            }
        }
    }

    /** Off-screen villagers buy finished goods; fewer when prices are high. */
    private townsfolk() {
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (!s.open) continue
            for (const [good, daily] of Object.entries(def.townsfolkDaily) as [GoodId, number][]) {
                const q = this.quoteSell(def.id, good)
                const key = `folk:${good}`
                const crowd = this.hasBuilt('townsfolk') ? 1.2 : 1 // the fountain draws more visitors
                s.carry[key] = (s.carry[key] ?? 0) + townsfolkDemand(good, daily, q.price) * (24 / 14) * crowd
                const want = Math.floor(s.carry[key]!)
                if (want <= 0) continue
                s.carry[key]! -= want
                const qty = Math.min(want, q.available)
                if (qty > 0 && this.exchange(TOWNSFOLK, this.shopAccount(def.id), good, qty, q.price)) this.noteSale(def.id, good, qty)
            }
        }
    }

    /** Every shopkeeper eats a loaf at noon, bought from the baker. */
    private lunch() {
        const baker = this.shops.baker
        if (!baker.open) return
        for (const def of SHOPS) {
            if (def.id === 'baker' || !this.shops[def.id].open) continue
            const q = this.quoteSell('baker', 'bread')
            if (q.available > 0 && this.exchange(this.shopAccount(def.id), this.shopAccount('baker'), 'bread', 1, q.price)) {
                this.noteSale('baker', 'bread', 1)
                this.burnFrom(this.shopAccount(def.id), 'bread', 1) // eaten
            }
        }
        // the farmer's tools wear out
        if (this.shops.farmer.open && (this.shops.farmer.stock.tools ?? 0) > 0 && this.rng() < 0.5) this.burnFrom(this.shopAccount('farmer'), 'tools', 1)
    }

    private newDay() {
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (s.open) {
                // dividends to investors from yesterday's profit
                const profit = s.coins - s.dayStartCoins
                const totalShares = sum(Object.values(s.investors))
                if (profit > 0 && totalShares > 0) {
                    const pot = Math.floor(profit * DIVIDEND_SHARE)
                    let paid = 0
                    for (const [uid, shares] of Object.entries(s.investors)) {
                        const amt = Math.floor((pot * shares) / totalShares)
                        if (amt > 0 && this.balanceOf(this.shopAccount(def.id), COIN) >= amt) {
                            this.move(this.shopAccount(def.id), uid, COIN, amt)
                            paid += amt
                        }
                    }
                    if (paid > 0) this.log('dividend', `${def.name} paid ${paid} coins in dividends to investors`, { shopId: def.id })
                }
                // upkeep
                const avail = s.coins - s.reserved
                const upkeep = dailyCosts(def.upkeep, s.coins)
                if (avail >= upkeep) {
                    this.burnFrom(this.shopAccount(def.id), COIN, upkeep)
                } else {
                    if (avail > 0) this.burnFrom(this.shopAccount(def.id), COIN, avail)
                    this.bankrupt(def, s)
                }
                s.mood = Math.max(-1, Math.min(1, s.mood * 0.6 + (s.coins > s.dayStartCoins ? 0.2 : -0.2)))
            }
            s.dayStartCoins = s.coins
        }
        this.playerSoldToday = {}
        this.marketSoldToday = {}
        this.log('info', `Day ${this.day} begins`)
    }

    private bankrupt(def: ShopDef, s: ShopState) {
        s.open = false
        s.mood = -1
        // cancel its jobs
        for (const j of this.jobs.filter(j => j.shopId === def.id)) this.cancelJob(j)
        this.log('bankrupt', `💸 ${def.name} the ${def.title} went bankrupt and closed the shop! Invest ${REOPEN_CASH} coins to reopen it.`, { shopId: def.id })
    }

    // ───────────────────────── jobs (shopkeepers hire players) ─────────────────────────

    /**
     * Requests board. Every few hours a shopkeeper asks for goods: either something its own shop is short of
     * (the shop pays) or a special order from the townsfolk (the customer pays). Sizes: small, big, urgent.
     */
    postJobs() {
        if (this.jobs.length >= MAX_REQUESTS) return
        const size: RequestSize = ((r: number) => (r < 0.2 ? 'urgent' : r < 0.45 ? 'big' : 'small'))(this.rng())
        const spec = REQUEST_SIZES[size]
        const qtyFor = () => spec.qty[0] + Math.floor(this.rng() * (spec.qty[1] - spec.qty[0] + 1))
        const busy = (id: ShopId) => this.jobs.filter(j => j.shopId === id).length >= 2

        // 1) a shop that is short of something it needs
        const shortages: { def: ShopDef; good: GoodId }[] = []
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (!s.open || busy(def.id)) continue
            for (const good of def.buys) {
                if (this.jobs.some(j => j.shopId === def.id && j.good === good)) continue
                if ((s.stock[good] ?? 0) <= (def.targets[good] ?? 0) * 0.5) shortages.push({ def, good })
            }
        }
        if (shortages.length && this.rng() < 0.6) {
            const { def, good } = pick(shortages, this.rng)
            const s = this.shops[def.id]
            const qty = qtyFor()
            const unit = Math.max(1, Math.ceil(this.quoteBuy(def.id, good).price * spec.premium))
            const reward = qty * unit
            if (s.coins - s.reserved >= reward + def.upkeep) {
                s.reserved += reward
                this.addJob({ shopId: def.id, good, qty, reward, size, funded: 'shop', note: 'running low in the shop' })
                return
            }
        }

        // 2) a townsfolk order passed on by a shopkeeper
        const orders = ORDERS.filter(o => this.shops[o.shopId].open && !busy(o.shopId) && !this.jobs.some(j => j.shopId === o.shopId && j.good === o.good))
        if (!orders.length) return
        const o = pick(orders, this.rng)
        const qty = qtyFor()
        const reward = Math.ceil(qty * GOODS[o.good].basePrice * spec.premium)
        this.addJob({ shopId: o.shopId, good: o.good, qty, reward, size, funded: 'town', note: o.note })
    }

    private addJob(j: Omit<Job, 'id' | 'postedAt' | 'expiresAt'>) {
        const job: Job = { ...j, id: `${j.shopId}-${this.t}-${Math.floor(this.rng() * 1e6)}`, postedAt: this.t, expiresAt: this.t + REQUEST_SIZES[j.size ?? 'small'].hours }
        this.jobs.push(job)
        const def = SHOP_BY_ID[j.shopId]
        const tag = j.size === 'urgent' ? '⏰ URGENT: ' : j.size === 'big' ? '📦 Big order: ' : '📜 '
        this.log('job', `${tag}${def.name} needs ${j.qty} ${GOODS[j.good].icon} ${GOODS[j.good].name} (${j.note}). Pays ${j.reward} coins.`, { shopId: j.shopId })
    }

    private cancelJob(job: Job) {
        if ((job.funded ?? 'shop') === 'shop') this.shops[job.shopId].reserved -= job.reward
        this.jobs = this.jobs.filter(j => j.id !== job.id)
    }

    private expireJobs() {
        for (const j of [...this.jobs]) if (j.expiresAt <= this.t) this.cancelJob(j)
    }

    takeJob(uid: string, jobId: string) {
        const job = this.jobs.find(j => j.id === jobId)
        if (!job) throw new Error('That job is gone.')
        if (job.takenBy && job.takenBy !== uid) throw new Error('Someone else took that job.')
        job.takenBy = uid
        return job
    }

    deliverJob(uid: string, jobId: string) {
        const job = this.jobs.find(j => j.id === jobId)
        if (!job) throw new Error('That job is gone.')
        if (job.takenBy && job.takenBy !== uid) throw new Error('Someone else took that job.')
        const have = this.wallets.balance(uid, job.good)
        if (have < job.qty) throw new Error(`You need ${job.qty} ${GOODS[job.good].icon} ${GOODS[job.good].name} (you have ${have}).`)
        const s = this.shops[job.shopId]
        const def = SHOP_BY_ID[job.shopId]
        if (!s.open) throw new Error(`${def.name}'s shop is closed.`)
        if ((job.funded ?? 'shop') === 'shop') {
            s.reserved -= job.reward
            this.move(uid, this.shopAccount(job.shopId), job.good, job.qty)
            this.move(this.shopAccount(job.shopId), uid, COIN, job.reward)
        } else {
            // a townsfolk order: the shop keeps goods it can use, the rest goes to the customer; the customer pays
            this.move(uid, def.buys.includes(job.good) ? this.shopAccount(job.shopId) : TOWNSFOLK, job.good, job.qty)
            this.move(TOWNSFOLK, uid, COIN, job.reward)
        }
        this.jobs = this.jobs.filter(j => j.id !== jobId)
        s.mood = Math.min(1, s.mood + 0.3)
        this.log('job', `✅ ${this.wallets.name(uid)} delivered ${job.qty} ${GOODS[job.good].icon} to ${def.name} for ${job.reward} coins`, { shopId: job.shopId, uid })
        return { ...job, thanks: pick(THANKS[job.shopId], this.rng) }
    }

    // ───────────────────────── price pacts (collusion) ─────────────────────────

    private updatePacts() {
        // expire, and members who badly need the good defect
        for (const p of [...this.pacts]) {
            if (p.until <= this.t) {
                this.pacts = this.pacts.filter(x => x !== p)
                this.log('pact', `🤝 The ${GOODS[p.good].name} price pact against ${p.againstName} has ended.`)
                continue
            }
            for (const m of [...p.members]) {
                const v = this.stockView(m, p.good)
                if (v.target > 0 && v.stock < v.target * 0.3) {
                    p.members = p.members.filter(x => x !== m)
                    this.log('pact', `🗡️ ${SHOP_BY_ID[m].name} broke the ${GOODS[p.good].name} pact: they need the goods too badly!`, { shopId: m })
                }
            }
            if (!p.members.length) this.pacts = this.pacts.filter(x => x !== p)
        }
        // form new ones against dominant sellers
        for (const [uid, sold] of Object.entries(this.playerSoldToday)) {
            for (const [good, units] of Object.entries(sold) as [GoodId, number][]) {
                const total = this.marketSoldToday[good] ?? 0
                if (units < RULES.PACT_TRIGGER_UNITS || units / Math.max(1, total) < RULES.PACT_TRIGGER_SHARE) continue
                if (this.pacts.some(p => p.good === good && p.against === uid)) continue
                const members = SHOPS.filter(d => d.buys.includes(good) && this.shops[d.id].open).map(d => d.id)
                const allies = SHOPS.filter(d => this.shops[d.id].open && !members.includes(d.id)).slice(0, 2).map(d => d.id)
                if (!members.length) continue
                this.pacts.push({ good, against: uid, againstName: this.wallets.name(uid), members: [...members, ...allies].filter(m => SHOP_BY_ID[m].buys.includes(good)), until: this.t + 24 })
                const names = [...members, ...allies].map(m => SHOP_BY_ID[m].name).join(' & ')
                this.log('pact', `🤫 ${names} whisper together… they agree to lowball ${this.wallets.name(uid)} on ${GOODS[good].name} for a day.`, { uid })
            }
        }
    }

    // ───────────────────────── player actions ─────────────────────────

    gather(uid: string, spot: string, nowMs = Date.now()) {
        const g = GATHER_SPOTS[spot]
        if (!g) throw new Error('Nothing to gather here.')
        const last = this.lastGather[uid]?.[spot] ?? 0
        const wait = GATHER_COOLDOWN_SEC * 1000 - (nowMs - last)
        if (wait > 0) throw new Error(`Still recovering, try again in ${Math.ceil(wait / 1000)}s.`)
        ;(this.lastGather[uid] ??= {})[spot] = nowMs
        const prof = this.profile(uid)
        const [lo, hi] = g.perAction
        let qty = lo + Math.floor(this.rng() * (hi - lo + 1))

        // a tool doubles the haul and wears out
        let tool: { id: string; name: string; icon: string; usesLeft: number; broke: boolean } | undefined
        const t = TOOL_FOR_SPOT[spot]
        if (t && this.wallets.balance(uid, t.id) > 0) {
            qty *= 2
            const wear = (prof.wear ??= {})
            const left = (wear[t.id] ?? t.uses) - 1
            const broke = left <= 0
            if (broke) {
                this.burnFrom(uid, t.id, 1)
                delete wear[t.id]
            } else wear[t.id] = left
            tool = { id: t.id, name: t.name, icon: t.icon, usesLeft: broke ? 0 : left, broke }
        }
        this.mintTo(uid, g.good, qty)

        // rare find: a small chance that grows with every gather that found nothing (the lucky streak)
        const streak = prof.sinceRare ?? 0
        let chance = Math.min(RARE_MAX_CHANCE, RARE_BASE_CHANCE + streak * RARE_STREAK_BONUS + (tool ? TOOL_RARE_BONUS : 0))
        if (this.hasBuilt('luck')) chance = Math.min(0.6, chance * 1.5)
        let rare: { id: string; name: string; icon: string; value: number; isNew: boolean } | undefined
        let collectionDone = false
        if (this.rng() < chance) {
            const tier = this.rng() < RARE_TIER2_SHARE ? 2 : 1
            const r = RARES.find(x => x.spot === spot && x.tier === tier)!
            this.mintTo(uid, r.id, 1)
            prof.sinceRare = 0
            const found = (prof.found ??= [])
            const isNew = !found.includes(r.id)
            if (isNew) found.push(r.id)
            rare = { id: r.id, name: r.name, icon: r.icon, value: r.value, isNew }
            this.log('rare', `✨ ${this.wallets.name(uid)} found ${r.tier === 2 ? 'a very rare' : 'a'} ${r.icon} ${r.name} at the ${g.label.toLowerCase()}!`, { uid })
            if (isNew && found.length >= RARES.length && this.wallets.balance(uid, CROWN) === 0) {
                this.mintTo(uid, CROWN, 1)
                collectionDone = true
                this.log('rare', `👑 ${this.wallets.name(uid)} completed the collection book and earned the Collector's crown!`, { uid })
            }
        } else prof.sinceRare = streak + 1
        return { good: g.good, qty, tool, rare, collectionDone, luck: Math.round(Math.min(RARE_MAX_CHANCE, RARE_BASE_CHANCE + (prof.sinceRare ?? 0) * RARE_STREAK_BONUS) * 100) }
    }

    private profile(uid: string) {
        return this.wallets.profiles[uid] ?? this.wallets.registerPlayer(uid, uid)
    }

    hasBuilt(effect: ProjectEffect) {
        return this.built.some(b => PROJECT_BY_ID[b.id]?.effect === effect)
    }

    // ───────────────────────── tools, hats and rare finds ─────────────────────────

    /** Buy a tool from the blacksmith or a hat from the tailor. Each one uses up one of the shop's goods. */
    buyItem(uid: string, itemId: string) {
        const tool = TOOL_BY_ID[itemId]
        const hat = HAT_BY_ID[itemId]
        if (!tool && !hat) throw new Error('Unknown item.')
        const shopId: ShopId = tool ? 'smith' : 'tailor'
        const material: GoodId = tool ? 'tools' : 'cloth'
        const price = tool ? tool.price : hat.price
        const def = SHOP_BY_ID[shopId]
        const s = this.shops[shopId]
        if (price == null) throw new Error('This one can\'t be bought. Fill the collection book to earn it!')
        if (!s.open) throw new Error(`${def.name}'s shop is closed.`)
        if (hat && this.wallets.balance(uid, itemId) > 0) throw new Error('You already own this hat.')
        if ((s.stock[material] ?? 0) < 1) throw new Error(`${def.name} is out of ${GOODS[material].name.toLowerCase()} to make it. Try later!`)
        if (this.wallets.balance(uid, COIN) < price) throw new Error(`You need ${price} coins.`)
        this.move(uid, this.shopAccount(shopId), COIN, price)
        this.burnFrom(this.shopAccount(shopId), material, 1)
        this.noteSale(shopId, material, 1)
        this.mintTo(uid, itemId, 1)
        const item = tool ?? hat
        if (hat) this.profile(uid).hat = itemId
        this.log('trade', `${this.wallets.name(uid)} bought a ${item.icon} ${item.name} from ${def.name} for ${price}`, { shopId, uid })
        return { item: itemId, price }
    }

    wearHat(uid: string, hatId: string | null) {
        if (hatId && !HAT_BY_ID[hatId]) throw new Error('Unknown hat.')
        if (hatId && this.wallets.balance(uid, hatId) < 1) throw new Error('You don\'t own that hat.')
        this.profile(uid).hat = hatId ?? undefined
        return { hat: hatId }
    }

    /** Rare finds sell to a collector in town through the shopkeeper who knows about them. */
    sellRare(uid: string, rareId: string) {
        const r = RARE_BY_ID[rareId]
        if (!r) throw new Error('Unknown item.')
        const def = SHOP_BY_ID[r.buyer]
        if (!this.shops[r.buyer].open) throw new Error(`${def.name}'s shop is closed.`)
        if (this.wallets.balance(uid, rareId) < 1) throw new Error(`You don't have a ${r.name}.`)
        this.move(uid, TOWNSFOLK, rareId, 1)
        this.move(TOWNSFOLK, uid, COIN, r.value)
        this.mintTo(this.shopAccount(r.buyer), COIN, 5) // the shopkeeper's finder's fee
        this.shops[r.buyer].mood = Math.min(1, this.shops[r.buyer].mood + 0.2)
        this.log('trade', `${def.name} sold ${this.wallets.name(uid)}'s ${r.icon} ${r.name} to a collector for ${r.value} coins`, { shopId: r.buyer, uid })
        return { value: r.value }
    }

    // ───────────────────────── team project (the office builds a landmark) ─────────────────────────

    currentProject(): ProjectInfo | null {
        return PROJECTS[this.project.index] ?? null
    }

    /** Donate goods or coins to the current project. Returns the finished project when this donation completes it. */
    donate(uid: string, token: string, qty: number) {
        const p = this.currentProject()
        if (!p) throw new Error('Every project is built. What a village!')
        const needs = p.needs as Record<string, number>
        const need = (needs[token] ?? 0) - (this.project.given[token] ?? 0)
        if (!needs[token]) throw new Error(`The ${p.name} doesn't need that.`)
        if (need <= 0) throw new Error(`The ${p.name} has enough of that already.`)
        const amount = Math.min(qty, need)
        const have = this.wallets.balance(uid, token)
        if (have < amount) throw new Error(`You only have ${have}.`)
        this.move(uid, TOWNSFOLK, token, amount) // used up in the building
        this.project.given[token] = (this.project.given[token] ?? 0) + amount
        const points = amount * (token === COIN ? 1 : GOODS[token as GoodId].basePrice)
        this.project.helpers[uid] = (this.project.helpers[uid] ?? 0) + points
        const label = token === COIN ? '🪙 coins' : `${GOODS[token as GoodId].icon} ${GOODS[token as GoodId].name}`
        this.log('project', `🧱 ${this.wallets.name(uid)} gave ${amount} ${label} to the ${p.name}`, { uid })
        const done = Object.entries(needs).every(([k, n]) => (this.project.given[k] ?? 0) >= n)
        if (!done) return { amount, completed: null as ProjectInfo | null }
        const helpers = Object.entries(this.project.helpers).sort((a, b) => b[1] - a[1]).map(([u]) => this.wallets.name(u))
        this.built.push({ id: p.id, day: this.day, helpers: helpers.slice(0, 5) })
        this.project = { index: this.project.index + 1, given: {}, helpers: {} }
        this.log('built', `🎉 The office built the ${p.icon} ${p.name}! ${p.reward} Thanks to ${helpers.slice(0, 3).join(', ')}.`)
        return { amount, completed: p }
    }

    projectView() {
        const p = this.currentProject()
        return {
            current: p && {
                ...p, given: this.project.given,
                helpers: Object.entries(this.project.helpers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, pts]) => ({ name: this.wallets.name(u), points: pts })),
            },
            built: this.built.map(b => ({ ...b, ...PROJECT_BY_ID[b.id] })),
            total: PROJECTS.length,
        }
    }

    /** Player buys from a shop at the list price, or at an agreed deal price. */
    buy(uid: string, shopId: ShopId, good: GoodId, qty: number, deal?: Deal) {
        const def = SHOP_BY_ID[shopId]
        if (!this.shops[shopId].open) throw new Error(`${def.name}'s shop is closed.`)
        if (!def.sells.includes(good)) throw new Error(`${def.name} doesn't sell ${GOODS[good].name}.`)
        const q = this.quoteSell(shopId, good)
        if (qty > q.available) throw new Error(`${def.name} will only sell ${q.available} right now.`)
        const unit = deal ? deal.unitPrice : q.price
        if (!this.exchange(uid, this.shopAccount(shopId), good, qty, unit)) throw new Error(`You need ${qty * unit} coins.`)
        this.noteSale(shopId, good, qty)
        this.log('trade', `${this.wallets.name(uid)} bought ${qty} ${GOODS[good].name} from ${def.name} for ${qty * unit}`, { shopId, uid })
        return { qty, unitPrice: unit, total: qty * unit }
    }

    /** Player sells to a shop at its offer, or at an agreed deal price. */
    sell(uid: string, shopId: ShopId, good: GoodId, qty: number, deal?: Deal) {
        const def = SHOP_BY_ID[shopId]
        if (!this.shops[shopId].open) throw new Error(`${def.name}'s shop is closed.`)
        if (!def.buys.includes(good)) throw new Error(`${def.name} doesn't buy ${GOODS[good].name}.`)
        const q = this.quoteBuy(shopId, good, uid)
        const unit = deal ? deal.unitPrice : q.price
        const canAfford = Math.floor(this.balanceOf(this.shopAccount(shopId), COIN) / unit)
        if (qty > Math.min(canAfford, Math.max(q.available, deal ? qty : 0))) throw new Error(`${def.name} can only take ${Math.min(canAfford, q.available)} right now.`)
        if (!this.exchange(this.shopAccount(shopId), uid, good, qty, unit)) throw new Error(`You don't have ${qty} ${GOODS[good].name}.`)
        ;(this.playerSoldToday[uid] ??= {})[good] = (this.playerSoldToday[uid][good] ?? 0) + qty
        this.marketSoldToday[good] = (this.marketSoldToday[good] ?? 0) + qty
        this.log('trade', `${this.wallets.name(uid)} sold ${qty} ${GOODS[good].name} to ${def.name} for ${qty * unit}`, { shopId, uid })
        // the Old Bridge brings traders: +10% on top, paid by them
        const bonus = this.hasBuilt('saleBonus') ? Math.floor(qty * unit * 0.1) : 0
        if (bonus > 0) this.move(TOWNSFOLK, uid, COIN, bonus)
        return { qty, unitPrice: unit, total: qty * unit, bonus }
    }

    invest(uid: string, shopId: ShopId, amount: number) {
        const def = SHOP_BY_ID[shopId]
        if (amount <= 0) throw new Error('Invest a positive amount.')
        if (this.wallets.balance(uid, COIN) < amount) throw new Error(`You only have ${this.wallets.balance(uid, COIN)} coins.`)
        const s = this.shops[shopId]
        this.move(uid, this.shopAccount(shopId), COIN, amount)
        s.investors[uid] = (s.investors[uid] ?? 0) + amount
        s.mood = Math.min(1, s.mood + 0.5)
        this.log('invest', `💰 ${this.wallets.name(uid)} invested ${amount} coins in ${def.name}'s shop`, { shopId, uid })
        if (!s.open && s.coins - s.reserved >= REOPEN_CASH) {
            s.open = true
            s.dayStartCoins = s.coins
            this.log('reopen', `🎉 ${def.name} the ${def.title} reopened thanks to investors!`, { shopId })
        }
        return { shares: s.investors[uid], open: s.open }
    }

    /** Limits for haggling, enforced no matter what the AI says. */
    haggleBounds(uid: string, shopId: ShopId, side: 'buy' | 'sell', good: GoodId, qty: number) {
        const s = this.shops[shopId]
        if (side === 'buy') {
            const q = this.quoteSell(shopId, good)
            return { list: q.price, limit: haggleFloor(q.price, this.stockView(shopId, good), s.mood), reasons: q.reasons, available: q.available }
        }
        const q = this.quoteBuy(shopId, good, uid)
        return { list: q.price, limit: haggleCeiling(q.price, this.stockView(shopId, good), s.mood, s.coins - s.reserved, qty), reasons: q.reasons, available: q.available }
    }

    // ───────────────────────── supply changes (mint/burn) ─────────────────────────

    private mintTo(party: string, good: string, qty: number) {
        const shopId = this.isShop(party)
        if (shopId) {
            if (good === COIN) this.shops[shopId].coins += qty
            else this.addStock(shopId, good as GoodId, qty)
        }
        this.wallets.credit(party, good, qty)
    }

    private burnFrom(party: string, good: string, qty: number) {
        const shopId = this.isShop(party)
        if (shopId) {
            if (good === COIN) this.shops[shopId].coins -= qty
            else this.addStock(shopId, good as GoodId, -qty)
        }
        this.wallets.debit(party, good, qty)
    }

    // ───────────────────────── views ─────────────────────────

    private recordPrices() {
        for (const good of GOOD_IDS) {
            const sellers = SHOPS.filter(d => d.sells.includes(good) && this.shops[d.id].open)
            let price: number
            if (sellers.length) price = Math.round(sellers.reduce((a, d) => a + this.quoteSell(d.id, good).price, 0) / sellers.length)
            else {
                const buyers = SHOPS.filter(d => d.buys.includes(good) && this.shops[d.id].open)
                if (!buyers.length) continue
                price = Math.round(buyers.reduce((a, d) => a + this.quoteBuy(d.id, good).price, 0) / buyers.length)
            }
            const h = (this.priceHistory[good] ??= [])
            h.push({ t: this.t, price })
            if (h.length > 24 * 14) h.splice(0, h.length - 24 * 14)
        }
    }

    publicState() {
        return {
            t: this.t, day: this.day, hour: this.hour,
            shops: SHOPS.map(def => {
                const s = this.shops[def.id]
                return {
                    id: def.id, name: def.name, title: def.title, skin: def.skin, stall: def.stall,
                    open: s.open, coins: s.coins, reserved: s.reserved, mood: Math.round(s.mood * 100) / 100,
                    stock: s.stock, investors: s.investors, account: this.wallets.accountId(this.shopAccount(def.id)),
                    sells: def.sells.map(g => ({ good: g, ...this.quoteSell(def.id, g) })),
                    buys: def.buys.map(g => ({ good: g, ...this.quoteBuy(def.id, g) })),
                }
            }),
            jobs: this.jobs,
            pacts: this.pacts,
            project: this.projectView(),
            prices: Object.fromEntries(Object.entries(this.priceHistory).map(([g, h]) => [g, h.slice(-24 * 7)])),
        }
    }

    toJSON(): VillageSnapshot {
        return {
            t: this.t, shops: Object.values(this.shops), jobs: this.jobs, pacts: this.pacts, priceHistory: this.priceHistory,
            eventSeq: this.eventSeq, events: this.events.slice(-100), playerSoldToday: this.playerSoldToday,
            marketSoldToday: this.marketSoldToday, lastGather: this.lastGather, project: this.project, built: this.built,
        }
    }

    static fromJSON(realmId: string, wallets: Wallets, snap: VillageSnapshot): Village {
        const v = Object.create(Village.prototype) as Village
        Object.assign(v, {
            realmId, wallets, rng: Math.random, deals: {},
            t: snap.t, jobs: snap.jobs, pacts: snap.pacts, priceHistory: snap.priceHistory, eventSeq: snap.eventSeq,
            events: snap.events, playerSoldToday: snap.playerSoldToday, marketSoldToday: snap.marketSoldToday,
            lastGather: snap.lastGather ?? {},
            project: snap.project ?? { index: 0, given: {}, helpers: {} }, built: snap.built ?? [],
            shops: Object.fromEntries(snap.shops.map(s => [s.id, s])),
        })
        return v
    }
}
