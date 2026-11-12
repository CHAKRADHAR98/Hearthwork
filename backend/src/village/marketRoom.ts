// The Market Square is its own room, generated for every office at play time (never saved into the map).
// Office owners place one or more "Market Square entrance" tiles in the editor (tile field `villageId`);
// each one becomes a teleporter into this room, and the room's exit leads back to the first entrance.
// Offices without an entrance get one placed automatically near the spawn point.

import type { RealmData, Room } from '../session'

export const MARKET_ROOM_NAME = 'Market Square'
export const MARKET = {
    width: 25,
    height: 17,
    /** Top-left of the stall/gathering layout used by the client (frontend VillageLayer LAYOUT). */
    origin: { x: 4, y: 2 },
    arrive: { x: 12, y: 14 },
    exit: { x: 12, y: 16 },
}

type Tile = Room['tilemap'][`${number}, ${number}`] & { villageId?: string; [k: string]: unknown }
const key = (x: number, y: number) => `${x}, ${y}` as `${number}, ${number}`

function buildRoom(back: { roomIndex: number; x: number; y: number }): Room {
    const t: Record<string, Tile> = {}
    const { width: W, height: H } = MARKET
    // a forest all around the walled square, so the camera never shows empty space
    const PAD = 14
    for (let x = -PAD; x < W + PAD; x++) {
        for (let y = -PAD; y < H + PAD; y++) t[key(x, y)] = { floor: 'ground-normal_detailed_grass' }
    }
    for (let x = -PAD; x < W + PAD; x += 4) {
        for (let y = -PAD; y < H + PAD; y += 4) {
            // tree sprites are 5x5 tiles anchored at the bottom centre: keep the whole canopy outside the walls
            const outside = x + 3 < -1 || x - 3 > W || y < -1 || y - 6 > H
            if (outside) t[key(x, y)] = { floor: 'ground-normal_detailed_grass', object: 'grasslands-light_basic_tree_bundle' }
        }
    }
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
            const tile: Tile = { floor: 'ground-normal_detailed_grass' }
            if (x >= 2 && x <= W - 3 && y >= 2 && y <= H - 3) tile.floor = 'ground-detailed_dirt'
            const wall =
                y === 0 ? (x === 0 ? 'stone_wall_tl' : x === W - 1 ? 'stone_wall_tr' : 'stone_wall_top')
                : y === H - 1 ? (x === 0 ? 'stone_wall_bl' : x === W - 1 ? 'stone_wall_br' : 'stone_wall_bottom')
                : x === 0 ? 'stone_wall_left' : x === W - 1 ? 'stone_wall_right' : null
            if (wall) {
                tile.object = `grasslands-${wall}`
                tile.impassable = true
            }
            t[key(x, y)] = tile
        }
    }
    // the path out, through a gap in the bottom wall
    for (let y = H - 3; y < H; y++) t[key(MARKET.exit.x, y)] = { floor: 'ground-detailed_dirt' }
    t[key(MARKET.exit.x, MARKET.exit.y)] = { floor: 'ground-detailed_dirt', teleporter: back }
    // a little clutter in the corners, clear of the stalls and gathering spots
    for (const [x, y, obj] of [[2, 13, 'village-crate'], [3, 13, 'village-small_crate'], [22, 13, 'village-crate'], [21, 2, 'village-small_crate']] as const) {
        t[key(x, y)] = { ...t[key(x, y)], object: obj }
    }
    return { name: MARKET_ROOM_NAME, tilemap: t as Room['tilemap'] }
}

function walkable(tile: Tile | undefined) {
    return !!tile && !!tile.floor && !tile.object && !tile.impassable && !tile.teleporter && !tile.villageId
}

/** A copy of the office map with the Market Square room added and entrances wired to it. */
export function withMarketSquare(map: RealmData): RealmData {
    const data: RealmData = JSON.parse(JSON.stringify(map))
    if (data.rooms.some(r => r.name === MARKET_ROOM_NAME && (r as any).generated)) return data
    const marketIndex = data.rooms.length

    const entrances: { roomIndex: number; x: number; y: number }[] = []
    data.rooms.forEach((room, roomIndex) => {
        for (const [k, tile] of Object.entries(room.tilemap) as [string, Tile][]) {
            if (tile.villageId) {
                const [x, y] = k.split(',').map(Number)
                entrances.push({ roomIndex, x, y })
            }
        }
    })

    // No entrance placed yet: put one a few steps from the spawn point.
    if (!entrances.length) {
        const sp = data.spawnpoint
        const room = data.rooms[sp.roomIndex]
        outer: for (let r = 2; r < 12; r++) {
            for (const [dx, dy] of [[0, -r], [r, 0], [-r, 0], [0, r], [r, -r], [-r, -r], [r, r], [-r, r]]) {
                const x = sp.x + dx, y = sp.y + dy
                if (walkable(room.tilemap[key(x, y)] as Tile)) {
                    ;(room.tilemap[key(x, y)] as Tile).villageId = 'auto'
                    entrances.push({ roomIndex: sp.roomIndex, x, y })
                    break outer
                }
            }
        }
    }

    for (const e of entrances) {
        const tile = data.rooms[e.roomIndex].tilemap[key(e.x, e.y)] as Tile
        tile.teleporter = { roomIndex: marketIndex, x: MARKET.arrive.x, y: MARKET.arrive.y }
    }

    // Coming back, land on a free tile next to the first entrance (not on it, or you'd bounce straight back in).
    const first = entrances[0] ?? { roomIndex: data.spawnpoint.roomIndex, x: data.spawnpoint.x, y: data.spawnpoint.y - 1 }
    const room = data.rooms[first.roomIndex]
    const landing = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]]
        .map(([dx, dy]) => ({ x: first.x + dx, y: first.y + dy }))
        .find(p => walkable(room.tilemap[key(p.x, p.y)] as Tile)) ?? { x: data.spawnpoint.x, y: data.spawnpoint.y }
    const market = buildRoom({ roomIndex: first.roomIndex, ...landing })
    ;(market as any).generated = true
    data.rooms.push(market)
    return data
}
