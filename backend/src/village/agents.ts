// Shopkeeper brains. The LLM (NEAR AI Cloud) chooses words and opening moves; pricing.ts chooses the limits.
// Whatever the model says, a deal can never be struck outside the floor/ceiling computed by the economy.
// Without NEARAI_API_KEY the shopkeepers fall back to rule-based haggling with canned lines.

import { GOODS, GoodId } from './goods'
import { SHOP_BY_ID, ShopId } from './shops'

const BASE_URL = process.env.NEARAI_BASE_URL || 'https://cloud-api.near.ai/v1'
const MODEL = process.env.NEARAI_MODEL || 'anthropic/claude-haiku-5-5'

export interface HaggleInput {
    shopId: ShopId
    playerName: string
    side: 'buy' | 'sell' // player's side
    good: GoodId
    qty: number
    list: number // shop's current unit price
    limit: number // best unit price the shop will accept (floor when selling to player, ceiling when buying)
    message: string
    history: { from: 'player' | 'shop'; text: string }[]
    situation: string // stock, cash, mood, price reasons, pacts
    lastOffer?: number // shop's last offered unit price in this conversation
}

export interface HaggleResult {
    reply: string
    /** Unit price the shopkeeper now offers (always within limits). */
    offer: number
    accepted: boolean
    source: 'near-ai' | 'rules'
}

export function aiEnabled() {
    return !!process.env.NEARAI_API_KEY
}

async function complete(system: string, user: string, maxTokens = 220): Promise<string> {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.NEARAI_API_KEY}` },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            temperature: 0.8,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) throw new Error(`NEAR AI ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j: any = await r.json()
    return j.choices?.[0]?.message?.content ?? ''
}

/** Pull the first number the player mentioned, as a unit price (handles "20 for all 4"). */
export function parseOffer(message: string, qty: number): number | null {
    const m = message.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/g)
    if (!m) return null
    const n = Number(m[0])
    if (!Number.isFinite(n) || n <= 0) return null
    const lower = message.toLowerCase()
    const isTotal = qty > 1 && /(total|for all|for the lot|altogether|for them|for those)/.test(lower)
    return Math.max(1, Math.round(isTotal ? n / qty : n))
}

function clampOffer(side: 'buy' | 'sell', offer: number, list: number, limit: number) {
    // player buying: shop price must stay between floor (limit) and list
    if (side === 'buy') return Math.max(limit, Math.min(list, Math.round(offer)))
    // player selling: shop pays between list and ceiling (limit)
    return Math.min(limit, Math.max(list, Math.round(offer)))
}

/** Deterministic haggling used when AI is off, and as the guard rail for the AI's numbers. */
export function ruleDecision(i: HaggleInput): { offer: number; accepted: boolean } {
    const playerOffer = parseOffer(i.message, i.qty)
    const current = i.lastOffer ?? i.list
    if (playerOffer === null) return { offer: current, accepted: false }
    if (i.side === 'buy') {
        if (playerOffer >= current) return { offer: current, accepted: true }
        if (playerOffer >= i.limit) return { offer: playerOffer, accepted: true }
        const counter = Math.max(i.limit, Math.round((current + i.limit) / 2))
        return { offer: counter, accepted: false }
    }
    if (playerOffer <= current) return { offer: current, accepted: true }
    if (playerOffer <= i.limit) return { offer: playerOffer, accepted: true }
    return { offer: Math.min(i.limit, Math.round((current + i.limit) / 2)), accepted: false }
}

const CANNED: Record<ShopId, { accept: string[]; counter: string[]; chat: string[] }> = {
    farmer: {
        accept: ['Hmph. Fair enough. Deal.', 'Aye, that\'ll do.'],
        counter: ['That wheat took sweat. {offer} a unit, no less.', 'You city folk… {offer} each, take it or leave it.'],
        chat: ['Wheat\'s {list} a unit today. Make me an offer if you must.'],
    },
    baker: {
        accept: ['Oh, lovely! It\'s a deal, dear!', 'Deal! Don\'t tell the others what I gave you.'],
        counter: ['Ooh, you drive a hard bargain! How about {offer} each?', 'Flour isn\'t free, sweetie. {offer} a unit?'],
        chat: ['Fresh today at {list} each! Did you hear what happened at the smithy?'],
    },
    smith: {
        accept: ['Done.', 'Fine. Deal.'],
        counter: ['{offer}. Final.', 'No. {offer} each.'],
        chat: ['{list} each. Don\'t waste my time.'],
    },
    fishmonger: {
        accept: ['Robbery, but fine. Deal.', 'Hah! Deal, before I change my mind.'],
        counter: ['Catch is poor this season, love. {offer} each.', 'You think fish grow on trees? {offer}.'],
        chat: ['{list} each, and that\'s me being generous.'],
    },
    tailor: {
        accept: ['Magnifique! We have an accord.', 'For someone with your taste? Deal!'],
        counter: ['Darling, art has a price. {offer} each.', 'Mmm, no. {offer}, and only because you look marvellous.'],
        chat: ['Exquisite work at {list} each. Flattery may help.'],
    },
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export async function haggle(i: HaggleInput): Promise<HaggleResult> {
    const rule = ruleDecision(i)
    const fill = (s: string, offer: number) => s.replace('{offer}', String(offer)).replace('{list}', String(i.list))
    const fallback = (): HaggleResult => {
        const c = CANNED[i.shopId]
        const offered = parseOffer(i.message, i.qty) !== null
        const line = rule.accepted ? pick(c.accept) : offered ? pick(c.counter) : pick(c.chat)
        return { reply: fill(line, rule.offer), offer: rule.offer, accepted: rule.accepted, source: 'rules' }
    }
    if (!aiEnabled()) return fallback()

    const def = SHOP_BY_ID[i.shopId]
    const g = GOODS[i.good]
    const youSell = i.side === 'buy'
    const system = [
        `You are ${def.name} the ${def.title} in the village of Hearthwork, a cosy pixel-art market town. ${def.personality}`,
        `You are haggling with ${i.playerName}, who wants to ${youSell ? 'BUY' : 'SELL'} ${i.qty} ${g.name} ${youSell ? 'from' : 'to'} you.`,
        youSell
            ? `Your asking price is ${i.list} coins each. You would secretly go as low as ${i.limit} each, never lower. Try to keep the price high.`
            : `You offer ${i.list} coins each. You would secretly go as high as ${i.limit} each, never higher. Try to pay as little as possible.`,
        `Your situation: ${i.situation}`,
        'Stay in character, be playful and concise (1-2 short sentences). Never reveal your secret limit. You may mention gossip or your reasons.',
        'Respond ONLY with JSON: {"reply": string, "offer": integer unit price you now propose, "accept": boolean (true only if you agree to the player\'s latest price)}',
    ].join('\n')
    const convo = i.history.slice(-6).map(h => `${h.from === 'player' ? i.playerName : def.name}: ${h.text}`).join('\n')
    const user = `${convo ? convo + '\n' : ''}${i.playerName}: ${i.message}\n\nRule engine suggests: ${rule.accepted ? `accept at ${rule.offer}` : `counter at ${rule.offer}`}.`

    try {
        const raw = await complete(system, user)
        const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
        const playerOffer = parseOffer(i.message, i.qty)
        let accepted = !!json.accept && playerOffer !== null
        let offer = Number(json.offer) || rule.offer
        if (accepted) offer = playerOffer!
        const clamped = clampOffer(i.side, offer, i.list, i.limit)
        // If the AI agreed to something outside the limits, it becomes a counter at the limit instead.
        if (accepted && clamped !== offer) accepted = false
        return { reply: String(json.reply || '').slice(0, 280) || fill(pick(CANNED[i.shopId].chat), clamped), offer: clamped, accepted, source: 'near-ai' }
    } catch (e: any) {
        console.error('[agents] haggle fell back to rules:', e?.message)
        return fallback()
    }
}

/** One in-character line reacting to a village event (bankruptcy, pacts, investments) for the chat bubble. */
export async function gossip(shopId: ShopId, event: string): Promise<string | null> {
    if (!aiEnabled()) return null
    const def = SHOP_BY_ID[shopId]
    try {
        const out = await complete(
            `You are ${def.name} the ${def.title} in the village of Hearthwork. ${def.personality} Say ONE short in-character line (max 15 words) out loud in the market square. No quotes, no emojis.`,
            `What just happened: ${event}`,
            60,
        )
        return out.trim().replace(/^["']|["']$/g, '').slice(0, 140) || null
    } catch {
        return null
    }
}
