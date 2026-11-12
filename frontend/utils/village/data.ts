// Client-side copy of static village info (names, skins, icons). Live prices and balances come from the server.
import type { NpcInfo } from '../pixi/village/VillageLayer'

export const VILLAGE_NPCS: NpcInfo[] = [
    { id: 'farmer', name: 'Bram', title: 'Farmer', skin: '005', open: true, icon: '🌾' },
    { id: 'baker', name: 'Mira', title: 'Baker', skin: '012', open: true, icon: '🍞' },
    { id: 'smith', name: 'Tor', title: 'Blacksmith', skin: '020', open: true, icon: '🔨' },
    { id: 'fishmonger', name: 'Nell', title: 'Fishmonger', skin: '030', open: true, icon: '🐟' },
    { id: 'tailor', name: 'Ivo', title: 'Tailor', skin: '040', open: true, icon: '🧵' },
]

export const GOOD_ICONS: Record<string, string> = {
    coin: '🪙', wheat: '🌾', iron: '🪨', fish: '🐟', wool: '🧶', bread: '🍞', tools: '🔨', cloth: '🧵',
}

/** Must match backend/src/village/marketRoom.ts */
export const MARKET_ROOM = 'Market Square'
export const MARKET_ORIGIN = { x: 4, y: 2 }
