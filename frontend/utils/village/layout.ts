// Shops and gathering spots of the Market Square (pure data: safe to import anywhere, including the editor UI).

export type VillageSpotKind = 'shop' | 'gather'
export interface VillageSpot {
    kind: VillageSpotKind
    id: string
    label: string
    icon: string
    x: number // relative to market origin
    y: number
}

export interface NpcInfo {
    id: string
    name: string
    title: string
    skin: string
    open: boolean
    icon: string
}

// Market Square layout (tiles, relative to the origin). Shops on the top row, gathering spots below.
export const LAYOUT: VillageSpot[] = [
    { kind: 'shop', id: 'farmer', label: 'Bram · Farmer', icon: '🌾', x: 2, y: 2 },
    { kind: 'shop', id: 'baker', label: 'Mira · Baker', icon: '🍞', x: 6, y: 2 },
    { kind: 'shop', id: 'smith', label: 'Tor · Blacksmith', icon: '🔨', x: 10, y: 2 },
    { kind: 'shop', id: 'tailor', label: 'Ivo · Tailor', icon: '🧵', x: 14, y: 2 },
    { kind: 'shop', id: 'fishmonger', label: 'Nell · Fishmonger', icon: '🐟', x: 2, y: 7 },
    { kind: 'gather', id: 'dock', label: 'Fishing dock', icon: '🎣', x: 5, y: 8 },
    { kind: 'gather', id: 'field', label: 'Wheat field', icon: '🌾', x: 8, y: 8 },
    { kind: 'gather', id: 'mine', label: 'Iron mine', icon: '⛏️', x: 11, y: 8 },
    { kind: 'gather', id: 'pasture', label: 'Sheep pasture', icon: '🐑', x: 14, y: 8 },
]
