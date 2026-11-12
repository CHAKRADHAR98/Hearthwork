// Every good in the village. Each one is a token id in the NEP-245 contract (contracts/village_items).

export type GoodId = 'wheat' | 'bread' | 'iron' | 'tools' | 'fish' | 'wool' | 'cloth'
export const COIN = 'coin'

export interface GoodInfo {
    id: GoodId
    name: string
    icon: string
    /** Fair price in coins when supply and demand are balanced. */
    basePrice: number
    /** Raw goods can be gathered by players in the world. */
    raw: boolean
}

export const GOODS: Record<GoodId, GoodInfo> = {
    wheat: { id: 'wheat', name: 'Wheat', icon: '🌾', basePrice: 4, raw: true },
    iron: { id: 'iron', name: 'Iron ore', icon: '🪨', basePrice: 7, raw: true },
    fish: { id: 'fish', name: 'Fish', icon: '🐟', basePrice: 6, raw: true },
    wool: { id: 'wool', name: 'Wool', icon: '🧶', basePrice: 5, raw: true },
    bread: { id: 'bread', name: 'Bread', icon: '🍞', basePrice: 11, raw: false },
    tools: { id: 'tools', name: 'Tools', icon: '🔨', basePrice: 24, raw: false },
    cloth: { id: 'cloth', name: 'Cloth', icon: '🧵', basePrice: 13, raw: false },
}

export const GOOD_IDS = Object.keys(GOODS) as GoodId[]

export type Inventory = Partial<Record<GoodId, number>>

/** Where players can gather raw goods. Tile kinds are placed in the Market Square map. */
export const GATHER_SPOTS: Record<string, { good: GoodId; label: string; perAction: [number, number] }> = {
    field: { good: 'wheat', label: 'Wheat field', perAction: [2, 4] },
    mine: { good: 'iron', label: 'Iron mine', perAction: [1, 2] },
    dock: { good: 'fish', label: 'Fishing dock', perAction: [1, 3] },
    pasture: { good: 'wool', label: 'Sheep pasture', perAction: [1, 3] },
}

/** Seconds a player must wait between gathers at the same spot. */
export const GATHER_COOLDOWN_SEC = 20
