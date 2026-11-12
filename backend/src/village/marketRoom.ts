// The Market Square is a room of its own.
//
// * Office owners can customise it in the editor like any other room. It is marked `market: true`, and
//   its special tiles say where each shopkeeper stands (`villageSpot: 'baker'`, ...), where each gathering
//   spot is (`villageSpot: 'mine'`, ...) and which tile leads back to the office (`villageExit`).
// * An office that never saved one gets the default room below, generated at play time.
// * "Market Square entrance" tiles in the office (`villageId`) become teleporters into the square, and the
//   exit tiles become teleporters back next to the first entrance. Those teleporters are wired at play time
//   only, so moving an entrance in the editor never leaves stale links behind.

import type { RealmData, Room } from '../session'

export const MARKET_ROOM_NAME = 'Market Square'

/** Default positions inside the default room (the client falls back to the same layout). */
export const DEFAULT_SPOTS: Record<string, { x: number; y: number }> = {
    farmer: { x: 6, y: 4 }, baker: { x: 10, y: 4 }, smith: { x: 14, y: 4 }, tailor: { x: 18, y: 4 }, fishmonger: { x: 6, y: 9 },
    dock: { x: 9, y: 10 }, field: { x: 12, y: 10 }, mine: { x: 15, y: 10 }, pasture: { x: 18, y: 10 },
}
const W = 25
const H = 17
const EXIT = { x: 12, y: 16 }

type Tile = Room['tilemap'][`${number}, ${number}`] & { villageId?: string; villageSpot?: string; villageExit?: boolean; [k: string]: unknown }
type MarketRoom = Room & { market?: boolean }
const key = (x: number, y: number) => `${x}, ${y}` as `${number}, ${number}`

export function isMarketRoom(room: Room) {
    return !!(room as MarketRoom).market || room.name === MARKET_ROOM_NAME
}

/** The default Market Square: walled dirt plaza, stalls and gathering spots, forest around it. */
export function defaultMarketRoom(): MarketRoom {
    const t: Record<string, Tile> = {}
    const PAD = 14
    for (let x = -PAD; x < W + PAD; x++) for (let y = -PAD; y < H + PAD; y++) t[key(x, y)] = { floor: 'ground-normal_detailed_grass' }
    for (let x = -PAD; x < W + PAD; x += 4) {
        for (let y = -PAD; y < H + PAD; y += 4) {
            // tree sprites are 5x5 tiles anchored at the bottom centre: keep the whole canopy outside the walls
            const outside = x + 3 < -1 || x - 3 > W || y < -1 || y - 6 > H
            if (outside) t[key(x, y)] = { floor: 'ground-normal_detailed_grass', object: 'grasslands-light_basic_tree_bundle' }
        }
    }
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
            const tile: Tile = { floor: x >= 2 && x <= W - 3 && y >= 2 && y <= H - 3 ? 'ground-detailed_dirt' : 'ground-normal_detailed_grass' }
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
    for (let y = H - 3; y < H; y++) t[key(EXIT.x, y)] = { floor: 'ground-detailed_dirt' }
    t[key(EXIT.x, EXIT.y)] = { floor: 'ground-detailed_dirt', villageExit: true }
    for (const [x, y, obj] of [[2, 13, 'village-crate'], [3, 13, 'village-small_crate'], [22, 13, 'village-crate'], [21, 2, 'village-small_crate']] as const) {
        t[key(x, y)] = { ...t[key(x, y)], object: obj }
    }
    for (const [id, p] of Object.entries(DEFAULT_SPOTS)) t[key(p.x, p.y)] = { ...t[key(p.x, p.y)], villageSpot: id }
    return { name: MARKET_ROOM_NAME, market: true, tilemap: t as Room['tilemap'] }
}

function walkable(tile: Tile | undefined) {
    return !!tile && !!tile.floor && !tile.object && !tile.impassable && !tile.teleporter && !tile.villageId && !tile.villageExit && !tile.villageSpot
}

function tilesWhere(room: Room, pred: (t: Tile) => boolean) {
    return Object.entries(room.tilemap)
        .filter(([, t]) => pred(t as Tile))
        .map(([k]) => { const [x, y] = k.split(',').map(Number); return { x, y } })
}

function besideTile(room: Room, p: { x: number; y: number }, fallback: { x: number; y: number }) {
    return [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
        .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
        .find(q => walkable(room.tilemap[key(q.x, q.y)] as Tile)) ?? fallback
}

/** For the editor: the map with a Market Square room to customise (the default one if none was saved). */
export function withEditableMarket(map: RealmData): RealmData {
    const data: RealmData = JSON.parse(JSON.stringify(map))
    if (!data.rooms.some(isMarketRoom)) data.rooms.push(defaultMarketRoom())
    return data
}

/** For playing: the map with the Market Square present and every entrance/exit wired as a teleporter. */
export function withMarketSquare(map: RealmData): RealmData {
    const data: RealmData = JSON.parse(JSON.stringify(map))
    let marketIndex = data.rooms.findIndex(isMarketRoom)
    if (marketIndex === -1) {
        data.rooms.push(defaultMarketRoom())
        marketIndex = data.rooms.length - 1
    }
    const market = data.rooms[marketIndex]
    ;(market as MarketRoom).market = true

    // entrances live in the office rooms
    const entrances: { roomIndex: number; x: number; y: number }[] = []
    data.rooms.forEach((room, roomIndex) => {
        if (roomIndex === marketIndex) return
        for (const p of tilesWhere(room, t => !!t.villageId)) entrances.push({ roomIndex, ...p })
    })
    if (!entrances.length) {
        // none placed yet: put one a few steps from the spawn point
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

    // exits live in the market; if the owner removed them all, fall back to the default exit spot
    let exits = tilesWhere(market, t => !!t.villageExit)
    if (!exits.length) {
        const t = (market.tilemap[key(EXIT.x, EXIT.y)] ?? { floor: 'ground-detailed_dirt' }) as Tile
        const fixed: Tile = { ...t, villageExit: true }
        delete fixed.impassable
        delete fixed.object
        market.tilemap[key(EXIT.x, EXIT.y)] = fixed
        exits = [EXIT]
    }

    const arrive = besideTile(market, exits[0], { x: EXIT.x, y: EXIT.y - 2 })
    for (const e of entrances) {
        ;(data.rooms[e.roomIndex].tilemap[key(e.x, e.y)] as Tile).teleporter = { roomIndex: marketIndex, ...arrive }
    }
    const first = entrances[0] ?? { roomIndex: data.spawnpoint.roomIndex, x: data.spawnpoint.x, y: data.spawnpoint.y }
    const landing = besideTile(data.rooms[first.roomIndex], first, { x: data.spawnpoint.x, y: data.spawnpoint.y })
    for (const x of exits) {
        ;(market.tilemap[key(x.x, x.y)] as Tile).teleporter = { roomIndex: first.roomIndex, ...landing }
    }
    return data
}
