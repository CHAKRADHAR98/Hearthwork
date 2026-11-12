// ─────────────────────────────────────────────────────────────────────────────
//  HEARTHWORK PRICING RULES
//
//  Every price in the village comes from this one file. Shopkeepers (the AI
//  agents) may talk however they like, but they can never trade outside the
//  limits computed here. Each function returns the price AND the reasons, which
//  the game shows in a tooltip over the shopkeeper.
// ─────────────────────────────────────────────────────────────────────────────

import { GOODS, GoodId } from './goods'

export const RULES = {
    /** How strongly price reacts to stock. 0 = never, 1 = price doubles when stock halves. */
    STOCK_ELASTICITY: 0.6,
    /** How strongly price reacts to the last day's sales compared with normal. */
    DEMAND_WEIGHT: 0.35,
    /** Below this share of its target stock, a shopkeeper starts hoarding. */
    HOARD_THRESHOLD: 0.25,
    /** Extra markup while hoarding. */
    HOARD_MARKUP: 1.35,
    /** Share of target stock a hoarding shopkeeper refuses to sell at all. */
    HOARD_RESERVE: 0.1,
    /** Prices never leave this band around the base price. */
    MIN_PRICE_FACTOR: 0.35,
    MAX_PRICE_FACTOR: 4,
    /** Shopkeepers buy at a discount to resell at a profit. */
    BUY_SPREAD: 0.65,
    /** Cash a shopkeeper feels comfortable with; below it they offer less when buying. */
    CASH_COMFORT: 150,
    /** Haggling: the most a shopkeeper ever drops their asking price. */
    MAX_DISCOUNT: 0.25,
    /** Haggling: the most a shopkeeper ever raises the price they pay you. */
    MAX_PREMIUM: 0.3,
    /** When colluding against a dominant seller, shopkeepers pay this fraction of the normal price. */
    PACT_LOWBALL: 0.75,
    /** A player who supplies more than this share of a good in a day triggers a pact. */
    PACT_TRIGGER_SHARE: 0.5,
    /** ...but only if they sold at least this many units. */
    PACT_TRIGGER_UNITS: 12,
    /** Rich shopkeepers spend: each morning they pay this share of coins above WEALTH_LINE (family, taxes, luxuries). */
    WEALTH_LINE: 300,
    WEALTH_SPEND: 0.08,
} as const

export interface StockView {
    stock: number
    target: number
    /** Units of this good sold by this shop in the last 24 game hours. */
    soldLastDay: number
    /** Units it normally sells per day. */
    expectedDaily: number
}

export interface PriceQuote {
    price: number
    /** Units the shopkeeper will part with (hoarding keeps a reserve back). */
    available: number
    reasons: string[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const pct = (f: number) => `${f >= 1 ? '+' : ''}${Math.round((f - 1) * 100)}%`

function band(good: GoodId, price: number) {
    const base = GOODS[good].basePrice
    return Math.max(1, Math.round(clamp(price, base * RULES.MIN_PRICE_FACTOR, base * RULES.MAX_PRICE_FACTOR)))
}

/** The price a shopkeeper asks when selling `good` to anyone. */
export function sellPrice(good: GoodId, s: StockView): PriceQuote {
    const base = GOODS[good].basePrice
    const reasons: string[] = [`Base price ${base}`]
    const ratio = s.target > 0 ? s.stock / s.target : 1

    const scarcity = Math.pow(clamp(ratio, 0.15, 3), -RULES.STOCK_ELASTICITY)
    reasons.push(`Stock ${s.stock}/${s.target} → ${pct(scarcity)}`)

    const demandRatio = s.expectedDaily > 0 ? s.soldLastDay / s.expectedDaily : 1
    const demand = clamp(1 + RULES.DEMAND_WEIGHT * (demandRatio - 1), 0.7, 1.6)
    if (Math.abs(demand - 1) >= 0.03) reasons.push(`Sold ${s.soldLastDay} today vs usual ${s.expectedDaily} → ${pct(demand)}`)

    let price = base * scarcity * demand
    let available = s.stock
    if (ratio < RULES.HOARD_THRESHOLD) {
        price *= RULES.HOARD_MARKUP
        available = Math.max(0, s.stock - Math.ceil(s.target * RULES.HOARD_RESERVE))
        reasons.push(`Hoarding (stock is low) → ${pct(RULES.HOARD_MARKUP)}, keeping ${s.stock - available} back`)
    }
    return { price: band(good, price), available, reasons }
}

/** The price a shopkeeper offers when buying `good` from a player or another shop. */
export function buyPrice(good: GoodId, s: StockView, cash: number, ownSellPrice?: number, pactAgainstSeller = false): PriceQuote {
    const base = GOODS[good].basePrice
    const reasons: string[] = [`Base price ${base}, buys at ${Math.round(RULES.BUY_SPREAD * 100)}%`]
    const ratio = s.target > 0 ? s.stock / s.target : 1

    const desire = Math.pow(clamp(ratio, 0.1, 3), -RULES.STOCK_ELASTICITY)
    reasons.push(`Needs it: stock ${s.stock}/${s.target} → ${pct(desire)}`)

    const cashFactor = clamp(cash / RULES.CASH_COMFORT, 0.4, 1)
    if (cashFactor < 1) reasons.push(`Short on cash (${cash}) → ${pct(cashFactor)}`)

    let price = base * RULES.BUY_SPREAD * desire * cashFactor
    if (ownSellPrice !== undefined) {
        const cap = ownSellPrice * 0.75
        if (price > cap) {
            price = cap
            reasons.push(`Must resell at a profit (sells for ${ownSellPrice})`)
        }
    }
    if (pactAgainstSeller) {
        price *= RULES.PACT_LOWBALL
        reasons.push(`Price pact with other shopkeepers → ${pct(RULES.PACT_LOWBALL)}`)
    }
    // Will not buy more than it can afford, nor much beyond 2x target.
    const p = band(good, price)
    const wantUnits = Math.max(0, Math.ceil(s.target * 2 - s.stock))
    const canAfford = Math.floor(cash / p)
    return { price: p, available: Math.min(wantUnits, canAfford), reasons }
}

/** How far a shopkeeper can be talked down from `asking` when selling. Mood is -1 (grumpy) .. 1 (friendly). */
export function haggleFloor(asking: number, s: StockView, mood: number): number {
    const ratio = s.target > 0 ? s.stock / s.target : 1
    const overstock = clamp(ratio - 1, 0, 1) // more stock than needed → more willing
    const discount = clamp(0.04 + 0.13 * overstock + 0.06 * mood, 0, RULES.MAX_DISCOUNT)
    return Math.max(1, Math.floor(asking * (1 - discount)))
}

/** How far a shopkeeper can be talked up from `offer` when buying from you. */
export function haggleCeiling(offer: number, s: StockView, mood: number, cash: number, units: number): number {
    const ratio = s.target > 0 ? s.stock / s.target : 1
    const desperation = clamp(1 - ratio / 0.5, 0, 1) // below half target → keener
    const premium = clamp(0.04 + 0.2 * desperation + 0.06 * mood, 0, RULES.MAX_PREMIUM)
    const affordable = units > 0 ? Math.floor(cash / units) : offer
    return Math.max(offer, Math.min(Math.ceil(offer * (1 + premium)), affordable))
}

/** How many units the off-screen townsfolk buy per hour at a given price (they buy less when it is expensive). */
export function townsfolkDemand(good: GoodId, dailyDemand: number, price: number): number {
    const base = GOODS[good].basePrice
    const perHour = (dailyDemand / 24) * Math.pow(base / price, 1.2)
    return perHour
}

/** Coins a shop pays each morning: fixed upkeep plus spending of wealth above the line (keeps coin from piling up forever). */
export function dailyCosts(upkeep: number, coins: number): number {
    return upkeep + Math.floor(Math.max(0, coins - RULES.WEALTH_LINE) * RULES.WEALTH_SPEND)
}
