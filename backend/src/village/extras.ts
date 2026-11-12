// Things that make the Market Square worth coming back to:
//   * rare finds while gathering, collected in a book (variable rewards with a fair "lucky streak")
//   * tools that double what you gather, sold by the blacksmith (they wear out)
//   * hats sold by the tailor, worn by your character in the office too
//   * team projects: the whole office donates goods to build a landmark that appears on its own map
//
// Every item here is a NEP-245 token in the items contract, just like goods.

import { GoodId, Inventory } from './goods'
import { ShopId } from './shops'

export interface RareInfo { id: string; name: string; icon: string; spot: string; value: number; buyer: ShopId; tier: 1 | 2 }

/** Two rare finds per gathering spot. Tier 2 is rarer and worth more. */
export const RARES: RareInfo[] = [
    { id: 'golden_wheat', name: 'Golden wheat', icon: '🌟', spot: 'field', value: 30, buyer: 'baker', tier: 1 },
    { id: 'clover', name: 'Four-leaf clover', icon: '🍀', spot: 'field', value: 65, buyer: 'farmer', tier: 2 },
    { id: 'gem', name: 'Gem', icon: '💎', spot: 'mine', value: 40, buyer: 'smith', tier: 1 },
    { id: 'relic', name: 'Old relic', icon: '🏺', spot: 'mine', value: 80, buyer: 'smith', tier: 2 },
    { id: 'bottle', name: 'Message in a bottle', icon: '🍾', spot: 'dock', value: 35, buyer: 'fishmonger', tier: 1 },
    { id: 'pearl', name: 'Pearl', icon: '🦪', spot: 'dock', value: 75, buyer: 'fishmonger', tier: 2 },
    { id: 'rainbow_wool', name: 'Rainbow wool', icon: '🌈', spot: 'pasture', value: 35, buyer: 'tailor', tier: 1 },
    { id: 'golden_fleece', name: 'Golden fleece', icon: '🐏', spot: 'pasture', value: 75, buyer: 'tailor', tier: 2 },
]
export const RARE_BY_ID = Object.fromEntries(RARES.map(r => [r.id, r])) as Record<string, RareInfo>

/** Chance of a rare find on a gather, and how much it grows with every gather that found nothing. */
export const RARE_BASE_CHANCE = 0.06
export const RARE_STREAK_BONUS = 0.02
export const RARE_MAX_CHANCE = 0.4
export const RARE_TIER2_SHARE = 0.25

export interface ToolInfo { id: string; name: string; icon: string; spot: string; price: number; uses: number }

/** Sold by Tor the blacksmith. Each one uses up one of his `tools`. Doubles what you gather at one spot. */
export const TOOLS: ToolInfo[] = [
    { id: 'pickaxe', name: 'Pickaxe', icon: '⛏️', spot: 'mine', price: 32, uses: 25 },
    { id: 'rod', name: 'Fishing rod', icon: '🎣', spot: 'dock', price: 28, uses: 25 },
    { id: 'basket', name: 'Harvest basket', icon: '🧺', spot: 'field', price: 20, uses: 25 },
    { id: 'shears', name: 'Shears', icon: '✂️', spot: 'pasture', price: 26, uses: 25 },
]
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map(t => [t.id, t])) as Record<string, ToolInfo>
export const TOOL_FOR_SPOT = Object.fromEntries(TOOLS.map(t => [t.spot, t])) as Record<string, ToolInfo>
export const TOOL_RARE_BONUS = 0.03

export interface HatInfo { id: string; name: string; icon: string; price: number | null }

/** Sold by Ivo the tailor (each uses one cloth). The crown can't be bought: fill the collection book. */
export const HATS: HatInfo[] = [
    { id: 'hat_straw', name: 'Straw hat', icon: '👒', price: 20 },
    { id: 'hat_cap', name: 'Cap', icon: '🧢', price: 35 },
    { id: 'hat_top', name: 'Top hat', icon: '🎩', price: 80 },
    { id: 'hat_scholar', name: 'Scholar cap', icon: '🎓', price: 150 },
    { id: 'hat_crown', name: 'Collector\'s crown', icon: '👑', price: null },
]
export const HAT_BY_ID = Object.fromEntries(HATS.map(h => [h.id, h])) as Record<string, HatInfo>
export const CROWN = 'hat_crown'

export type ProjectEffect = 'saleBonus' | 'townsfolk' | 'luck'

export interface ProjectInfo {
    id: string
    name: string
    icon: string
    /** Goods (and `coin`) the office must donate. */
    needs: Inventory & { coin?: number }
    reward: string
    effect: ProjectEffect
    /** Map object placed in the office's own Market Square when finished (frontend landmarks sprite sheet). */
    sprite: string
}

/** Built in this order, one at a time, per office. */
export const PROJECTS: ProjectInfo[] = [
    {
        id: 'bridge', name: 'Old Bridge', icon: '🌉', sprite: 'landmarks-bridge',
        needs: { wheat: 20, iron: 10, fish: 8, coin: 60 },
        reward: 'Traders cross the river: +10% coins on everything you sell to a shopkeeper.', effect: 'saleBonus',
    },
    {
        id: 'fountain', name: 'Golden Fountain', icon: '⛲', sprite: 'landmarks-fountain',
        needs: { iron: 15, bread: 10, cloth: 4, tools: 3, coin: 150 },
        reward: 'Townsfolk gather around it: every shop sells 20% more.', effect: 'townsfolk',
    },
    {
        id: 'well', name: 'Wishing Well', icon: '🪣', sprite: 'landmarks-well',
        needs: { iron: 20, wool: 15, bread: 15, tools: 5, coin: 250 },
        reward: 'Lucky water: rare finds are 50% more likely.', effect: 'luck',
    },
]
export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map(p => [p.id, p])) as Record<string, ProjectInfo>

/** Every token id the items contract must know about (besides goods and coin). */
export const EXTRA_TOKENS: { id: string; name: string; icon: string }[] = [
    ...RARES.map(r => ({ id: r.id, name: r.name, icon: r.icon })),
    ...TOOLS.map(t => ({ id: t.id, name: t.name, icon: t.icon })),
    ...HATS.map(h => ({ id: h.id, name: h.name, icon: h.icon })),
]

// ───────────────────────── requests (shopkeepers ask players for goods) ─────────────────────────

export type RequestSize = 'small' | 'big' | 'urgent'

/** How long each request stays open (game hours: a day is 24) and how much more than the market it pays. */
export const REQUEST_SIZES: Record<RequestSize, { hours: number; premium: number; qty: [number, number] }> = {
    small: { hours: 48, premium: 1.3, qty: [3, 5] },
    big: { hours: 96, premium: 1.5, qty: [8, 14] },
    urgent: { hours: 24, premium: 2.0, qty: [3, 6] },
}
export const MAX_REQUESTS = 5

/** Special orders the townsfolk place through a shopkeeper (paid by the customer, not the shop). */
export const ORDERS: { shopId: ShopId; good: GoodId; note: string }[] = [
    { shopId: 'baker', good: 'fish', note: 'for a fish pie at the mayor\'s dinner' },
    { shopId: 'baker', good: 'wheat', note: 'for the harvest festival cakes' },
    { shopId: 'smith', good: 'iron', note: 'to forge a new town gate' },
    { shopId: 'smith', good: 'wool', note: 'to pad the horses\' saddles' },
    { shopId: 'tailor', good: 'wool', note: 'for a wedding dress' },
    { shopId: 'tailor', good: 'fish', note: 'don\'t ask. Fashion is fashion' },
    { shopId: 'farmer', good: 'bread', note: 'to feed the harvest helpers' },
    { shopId: 'farmer', good: 'iron', note: 'to mend the plough' },
    { shopId: 'fishmonger', good: 'wool', note: 'to patch the fishing nets' },
    { shopId: 'fishmonger', good: 'bread', note: 'as bait. Old bread works best' },
]

export const THANKS: Record<ShopId, string[]> = {
    farmer: ['Hm. Good work. The fields thank you.', 'Right on time. You\'ve a farmer\'s heart.'],
    baker: ['Oh you darling! I\'ll tell everyone you saved my day!', 'Perfect! Wait till Nell hears about this!'],
    smith: ['Good. Fair pay for fair work.', 'Solid. Come back anytime.'],
    fishmonger: ['Hmph. Fine. Better than I expected, I suppose.', 'Not bad... don\'t let it go to your head.'],
    tailor: ['Magnificent! You have taste, darling!', 'Exquisite! You have saved my collection!'],
}

export const pick = <T>(arr: T[], rng: () => number = Math.random) => arr[Math.floor(rng() * arr.length)]
