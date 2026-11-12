// The shopkeepers of every Hearthwork village. Each one is an agent with its own NEAR account (wallet).

import { GoodId, Inventory } from './goods'

export type ShopId = 'farmer' | 'baker' | 'smith' | 'fishmonger' | 'tailor'

export interface ShopDef {
    id: ShopId
    name: string
    title: string
    /** Character skin id from the existing sprite set. */
    skin: string
    personality: string
    sells: GoodId[]
    buys: GoodId[]
    /** Turns inputs into an output, up to `perHour` times each hour while the shop is open. */
    recipe?: { inputs: Inventory; output: GoodId; qty: number; perHour: number }
    /** Grows or catches goods by itself during daylight. */
    produces?: { good: GoodId; perHour: number }
    /** Stock level the shopkeeper aims to hold of each good it deals in. */
    targets: Inventory
    /** Units of each sold good the townsfolk buy per day at base price. */
    townsfolkDaily: Inventory
    /** Units it normally sells per day in total (townsfolk + other shops). Defaults to townsfolkDaily. */
    expectedSales?: Inventory
    startCash: number
    startStock: Inventory
    /** Coins paid each morning for rent and wages. */
    upkeep: number
    /** Tile position of the stall in the Market Square room. */
    stall: { x: number; y: number }
}

export const SHOPS: ShopDef[] = [
    {
        id: 'farmer', name: 'Bram', title: 'Farmer', skin: '005',
        personality: 'A slow-talking, stubborn farmer who hates waste and distrusts city folk. Proud of his wheat.',
        sells: ['wheat'], buys: ['tools'],
        produces: { good: 'wheat', perHour: 1.6 },
        targets: { wheat: 40, tools: 2 }, townsfolkDaily: { wheat: 4 }, expectedSales: { wheat: 22 },
        startCash: 120, startStock: { wheat: 30, tools: 1 }, upkeep: 30, stall: { x: 4, y: 4 },
    },
    {
        id: 'baker', name: 'Mira', title: 'Baker', skin: '012',
        personality: 'A cheerful, gossipy baker who knows everyone\'s business and loves a bargain, but guards her flour jealously.',
        sells: ['bread'], buys: ['wheat'],
        recipe: { inputs: { wheat: 1 }, output: 'bread', qty: 1, perHour: 2 },
        targets: { bread: 20, wheat: 24 }, townsfolkDaily: { bread: 18 },
        startCash: 140, startStock: { bread: 14, wheat: 16 }, upkeep: 22, stall: { x: 10, y: 4 },
    },
    {
        id: 'smith', name: 'Tor', title: 'Blacksmith', skin: '020',
        personality: 'A gruff, terse blacksmith. Speaks in short sentences. Respects hard work, despises haggling, but pays fair for good ore.',
        sells: ['tools'], buys: ['iron'],
        recipe: { inputs: { iron: 2 }, output: 'tools', qty: 1, perHour: 1 },
        targets: { tools: 6, iron: 14 }, townsfolkDaily: { tools: 3 }, expectedSales: { tools: 4 },
        startCash: 180, startStock: { tools: 4, iron: 9 }, upkeep: 20, stall: { x: 16, y: 4 },
    },
    {
        id: 'fishmonger', name: 'Nell', title: 'Fishmonger', skin: '030',
        personality: 'A sharp-tongued, shrewd fishmonger who always claims the catch is poor this season. Loves to lowball.',
        sells: ['fish'], buys: ['fish'],
        produces: { good: 'fish', perHour: 0.4 },
        targets: { fish: 20 }, townsfolkDaily: { fish: 10 },
        startCash: 110, startStock: { fish: 12 }, upkeep: 16, stall: { x: 4, y: 10 },
    },
    {
        id: 'tailor', name: 'Ivo', title: 'Tailor', skin: '040',
        personality: 'A vain, theatrical tailor obsessed with fashion. Flattery works on him; rudeness does not.',
        sells: ['cloth'], buys: ['wool'],
        recipe: { inputs: { wool: 2 }, output: 'cloth', qty: 1, perHour: 1 },
        targets: { cloth: 10, wool: 16 }, townsfolkDaily: { cloth: 6 },
        startCash: 130, startStock: { cloth: 6, wool: 8 }, upkeep: 14, stall: { x: 10, y: 10 },
    },
]

export const SHOP_BY_ID = Object.fromEntries(SHOPS.map(s => [s.id, s])) as Record<ShopId, ShopDef>

/** Wandering traders bring this many raw goods per day to whichever shop buys them. */
export const TRADER_SUPPLY_DAILY: Inventory = { iron: 10, wool: 7, fish: 5, wheat: 0 }

/** Coins a bankrupt shop needs on hand before it can reopen. */
export const REOPEN_CASH = 60

/** Share of a shop's daily profit paid out to its investors. */
export const DIVIDEND_SHARE = 0.4
