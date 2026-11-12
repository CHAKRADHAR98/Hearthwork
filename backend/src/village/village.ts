// The village economy simulation. One Village per office (realm).
// One tick = one game hour. All prices come from pricing.ts; this file only moves goods and coins.

import { COIN, GATHER_COOLDOWN_SEC, GATHER_SPOTS, GOODS, GOOD_IDS, GoodId, Inventory } from './goods'
import { buyPrice, dailyCosts, haggleCeiling, haggleFloor, PriceQuote, RULES, sellPrice, StockView, townsfolkDemand } from './pricing'
import { DIVIDEND_SHARE, REOPEN_CASH, SHOPS, SHOP_BY_ID, ShopDef, ShopId, TRADER_SUPPLY_DAILY } from './shops'
import { Wallets } from './wallets'

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
    kind: 'trade' | 'bankrupt' | 'reopen' | 'job' | 'pact' | 'invest' | 'gossip' | 'gather' | 'dividend' | 'info'
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
        if (this.hour % 6 === 0) this.postJobs()
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
                s.carry[key] = (s.carry[key] ?? 0) + townsfolkDemand(good, daily, q.price) * (24 / 14)
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

    private postJobs() {
        for (const def of SHOPS) {
            const s = this.shops[def.id]
            if (!s.open || this.jobs.some(j => j.shopId === def.id)) continue
            for (const good of def.buys) {
                const target = def.targets[good] ?? 0
                const have = s.stock[good] ?? 0
                if (have > target * 0.4) continue
                const qty = Math.max(3, Math.min(12, Math.ceil(target - have)))
                const unit = Math.ceil(this.quoteBuy(def.id, good).price * 1.25)
                const reward = qty * unit
                if (s.coins - s.reserved < reward + def.upkeep) continue
                s.reserved += reward
                const job: Job = { id: `${def.id}-${this.t}`, shopId: def.id, good, qty, reward, postedAt: this.t, expiresAt: this.t + 24 }
                this.jobs.push(job)
                this.log('job', `📜 ${def.name} is hiring: deliver ${qty} ${GOODS[good].name} for ${reward} coins`, { shopId: def.id })
                break
            }
        }
    }

    private cancelJob(job: Job) {
        this.shops[job.shopId].reserved -= job.reward
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
        if (this.wallets.balance(uid, job.good) < job.qty) throw new Error(`You need ${job.qty} ${GOODS[job.good].name}.`)
        const s = this.shops[job.shopId]
        s.reserved -= job.reward
        this.move(uid, this.shopAccount(job.shopId), job.good, job.qty)
        this.move(this.shopAccount(job.shopId), uid, COIN, job.reward)
        this.jobs = this.jobs.filter(j => j.id !== jobId)
        s.mood = Math.min(1, s.mood + 0.3)
        this.log('job', `✅ ${this.wallets.name(uid)} delivered ${job.qty} ${GOODS[job.good].name} to ${SHOP_BY_ID[job.shopId].name} for ${job.reward} coins`, { shopId: job.shopId, uid })
        return job
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
        const [lo, hi] = g.perAction
        const qty = lo + Math.floor(this.rng() * (hi - lo + 1))
        this.mintTo(uid, g.good, qty)
        return { good: g.good, qty }
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
        return { qty, unitPrice: unit, total: qty * unit }
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
            prices: Object.fromEntries(Object.entries(this.priceHistory).map(([g, h]) => [g, h.slice(-24 * 7)])),
        }
    }

    toJSON(): VillageSnapshot {
        return {
            t: this.t, shops: Object.values(this.shops), jobs: this.jobs, pacts: this.pacts, priceHistory: this.priceHistory,
            eventSeq: this.eventSeq, events: this.events.slice(-100), playerSoldToday: this.playerSoldToday,
            marketSoldToday: this.marketSoldToday, lastGather: this.lastGather,
        }
    }

    static fromJSON(realmId: string, wallets: Wallets, snap: VillageSnapshot): Village {
        const v = Object.create(Village.prototype) as Village
        Object.assign(v, {
            realmId, wallets, rng: Math.random, deals: {},
            t: snap.t, jobs: snap.jobs, pacts: snap.pacts, priceHistory: snap.priceHistory, eventSeq: snap.eventSeq,
            events: snap.events, playerSoldToday: snap.playerSoldToday, marketSoldToday: snap.marketSoldToday,
            lastGather: snap.lastGather ?? {},
            shops: Object.fromEntries(snap.shops.map(s => [s.id, s])),
        })
        return v
    }
}
