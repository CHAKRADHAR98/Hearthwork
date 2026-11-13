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
import DEFAULT_MARKET from './defaultMarket.json'

export const MARKET_ROOM_NAME = 'Market Square'

/** The default room, drawn with the game's own tiles by frontend/scripts/make-maps.py (editable in the map editor). */
const DEFAULT_ROOM = DEFAULT_MARKET as unknown as Room & { market?: boolean }

/** Where each shopkeeper and gathering spot stands in the default room (read from its villageSpot tiles). */
export const DEFAULT_SPOTS: Record<string, { x: number; y: number }> = Object.fromEntries(
    Object.entries(DEFAULT_ROOM.tilemap)
        .filter(([, t]) => (t as { villageSpot?: string }).villageSpot)
        .map(([k, t]) => { const [x, y] = k.split(',').map(Number); return [(t as { villageSpot: string }).villageSpot, { x, y }] }),
)
/** The road out of the default room; also the fallback exit for a customised room that lost all its exits. */
const EXIT = { x: 19, y: 30 }

/** Footprint (tiles) of each team-project landmark, and where it goes in the default room (bottom-left tile). */
export const LANDMARKS: Record<string, { sprite: string; w: number; h: number; site: { x: number; y: number } }> = {
    bridge: { sprite: 'landmarks-bridge', w: 4, h: 3, site: { x: 12, y: 29 } }, // left of the exit road
    fountain: { sprite: 'landmarks-fountain', w: 4, h: 4, site: { x: 21, y: 20 } }, // middle of the plaza
    well: { sprite: 'landmarks-well', w: 2, h: 3, site: { x: 23, y: 29 } }, // right of the exit road
}

type Tile = Room['tilemap'][`${number}, ${number}`] & { villageId?: string; villageSpot?: string; villageExit?: boolean; [k: string]: unknown }
type MarketRoom = Room & { market?: boolean }
const key = (x: number, y: number) => `${x}, ${y}` as `${number}, ${number}`

export function isMarketRoom(room: Room) {
    return !!(room as MarketRoom).market || room.name === MARKET_ROOM_NAME
}

/** The default Market Square: shop lane, plaza, wheat field, mine, pond and pasture in a wood (a fresh copy each time). */
export function defaultMarketRoom(): MarketRoom {
    return { ...JSON.parse(JSON.stringify(DEFAULT_ROOM)), name: MARKET_ROOM_NAME, market: true }
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

// ───────────────────────── team-project landmarks ─────────────────────────

export const isLandmark = (object?: string) => !!object && object.startsWith('landmarks-')

/** Can a landmark of this size sit with its bottom-left tile at (x, y)? Keeps clear of stalls, spots and exits. */
function siteFree(room: Room, x: number, y: number, w: number, h: number) {
    const near = tilesWhere(room, t => !!t.villageSpot || !!t.villageExit || !!t.villageId || !!t.teleporter)
    // tiles covered by landmarks already standing (only their bottom-left tile holds the object)
    const covered = new Set<string>()
    for (const p of tilesWhere(room, t => isLandmark(t.object as string))) {
        const lm = Object.values(LANDMARKS).find(l => l.sprite === (room.tilemap[key(p.x, p.y)] as Tile).object)
        if (!lm) continue
        for (let dx = 0; dx < lm.w; dx++) for (let dy = 0; dy < lm.h; dy++) covered.add(key(p.x + dx, p.y - dy))
    }
    for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
            const tx = x + dx, ty = y - dy
            if (!walkable(room.tilemap[key(tx, ty)] as Tile) || covered.has(key(tx, ty))) return false
            if (near.some(p => Math.abs(p.x - tx) <= 1 && ty - p.y >= -1 && ty - p.y <= 2)) return false
        }
    }
    return true
}

/** Nearest free site to `prefer` for a landmark, or null if the room is full. */
function findSite(room: Room, w: number, h: number, prefer: { x: number; y: number }) {
    if (siteFree(room, prefer.x, prefer.y, w, h)) return prefer
    const cells = Object.keys(room.tilemap).map(k => { const [x, y] = k.split(',').map(Number); return { x, y } })
    cells.sort((a, b) => Math.abs(a.x - prefer.x) + Math.abs(a.y - prefer.y) - (Math.abs(b.x - prefer.x) + Math.abs(b.y - prefer.y)))
    return cells.find(c => siteFree(room, c.x, c.y, w, h)) ?? null
}

/**
 * Put every landmark this office has built into its Market Square, unless the owner already placed it somewhere
 * (in the editor they can move it to any room). Mutates `data`. Returns what was newly placed.
 */
export function placeLandmarks(data: RealmData, built: string[]) {
    const placed: { id: string; sprite: string; roomIndex: number; x: number; y: number }[] = []
    const marketIndex = data.rooms.findIndex(isMarketRoom)
    if (marketIndex === -1) return placed
    const market = data.rooms[marketIndex]
    for (const id of built) {
        const lm = LANDMARKS[id]
        if (!lm) continue
        const already = data.rooms.some(r => Object.values(r.tilemap).some(t => (t as Tile).object === lm.sprite))
        if (already) continue
        const site = findSite(market, lm.w, lm.h, lm.site)
        if (!site) continue
        ;(market.tilemap[key(site.x, site.y)] as Tile).object = lm.sprite
        placed.push({ id, sprite: lm.sprite, roomIndex: marketIndex, ...site })
    }
    return placed
}

/** Where the landmark of project `id` will appear (shown as a building site until it is finished). */
export function buildSiteFor(data: RealmData, id: string) {
    const lm = LANDMARKS[id]
    const roomIndex = data.rooms.findIndex(isMarketRoom)
    if (!lm || roomIndex === -1) return null
    const site = findSite(data.rooms[roomIndex], lm.w, lm.h, lm.site)
    return site && { roomIndex, x: site.x, y: site.y, w: lm.w, h: lm.h }
}

/** Remove landmarks this office hasn't built (the editor can't be used to sneak one in). */
export function stripLockedLandmarks(map: RealmData, built: string[]) {
    const allowed = new Set(built.map(id => LANDMARKS[id]?.sprite).filter(Boolean))
    for (const room of map.rooms ?? []) {
        for (const t of Object.values(room.tilemap ?? {}) as Tile[]) {
            if (isLandmark(t.object as string) && !allowed.has(t.object as string)) delete t.object
        }
    }
    return map
}

/** For the editor: the map with a Market Square room to customise (the default one if none was saved). */
export function withEditableMarket(map: RealmData, built: string[] = []): RealmData {
    const data: RealmData = JSON.parse(JSON.stringify(map))
    if (!data.rooms.some(isMarketRoom)) data.rooms.push(defaultMarketRoom())
    placeLandmarks(data, built)
    return data
}

/** For playing: the map with the Market Square present and every entrance/exit wired as a teleporter. */
export function withMarketSquare(map: RealmData, built: string[] = []): RealmData {
    const data: RealmData = JSON.parse(JSON.stringify(map))
    let marketIndex = data.rooms.findIndex(isMarketRoom)
    if (marketIndex === -1) {
        data.rooms.push(defaultMarketRoom())
        marketIndex = data.rooms.length - 1
    }
    placeLandmarks(data, built)
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
