// Places the Market Square inside the office world: shopkeeper NPCs at their stalls and gathering spots.
// It finds an open patch of ground near the spawn point, so it works on any office map.

import * as PIXI from 'pixi.js'
import { Player } from '../Player/Player'
import type { PlayApp } from '../PlayApp'
import signal from '@/utils/signal'
import { TilePoint } from '../types'

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
const WIDTH = 17
const HEIGHT = 11

const STALL_COLORS: Record<string, number> = { farmer: 0xc9a227, baker: 0xe07a5f, smith: 0x6c757d, tailor: 0x9b5de5, fishmonger: 0x3a86ff }
const GATHER_COLORS: Record<string, number> = { dock: 0x3a86ff, field: 0xe9c46a, mine: 0x7f7f7f, pasture: 0x90be6d }

export class VillageLayer {
    origin: { x: number; y: number } | null = null
    npcs: Record<string, Player> = {}
    private container = new PIXI.Container()
    private signs: Record<string, PIXI.Text> = {}
    private interval: ReturnType<typeof setInterval> | null = null
    private current: string | null = null

    constructor(private app: PlayApp, private floor: PIXI.Container, private objects: PIXI.Container) {}

    private isFree(x: number, y: number) {
        const key = `${x}, ${y}` as TilePoint
        const tile = this.app.realmData.rooms[this.app.currentRoomIndex].tilemap[key]
        return !!tile && !!tile.floor && !tile.object && !tile.above_floor && !this.app.blocked.has(key) && !tile.teleporter
    }

    private rectFree(x0: number, y0: number, w: number, h: number) {
        for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) if (!this.isFree(x, y)) return false
        return true
    }

    /** Find an origin near the spawn point where every stall/spot (and the tile in front of it) is walkable. */
    private findOrigin(spawn: { x: number; y: number }) {
        const candidates: { x: number; y: number; d: number }[] = []
        for (let dx = -30; dx <= 30; dx++) for (let dy = -30; dy <= 30; dy++) {
            const x = spawn.x + dx - Math.floor(WIDTH / 2)
            const y = spawn.y + dy - 2
            candidates.push({ x, y, d: Math.abs(dx) + Math.abs(dy) })
        }
        candidates.sort((a, b) => a.d - b.d)
        for (const c of candidates) {
            const ok = this.rectFree(c.x, c.y, WIDTH, HEIGHT)
            // avoid covering the spawn tile itself
            const coversSpawn = LAYOUT.some(s => c.x + s.x === spawn.x && c.y + s.y === spawn.y)
            if (ok && !coversSpawn) return { x: c.x, y: c.y }
        }
        for (const c of candidates) {
            const ok = LAYOUT.every(s => this.isFree(c.x + s.x, c.y + s.y) && this.isFree(c.x + s.x, c.y + s.y + 1))
            if (ok) return { x: c.x, y: c.y }
        }
        return null
    }

    async mount(npcs: NpcInfo[], spawn: { x: number; y: number }) {
        this.origin = this.findOrigin(spawn)
        if (!this.origin) {
            console.warn('[village] no room for the Market Square on this map')
            return
        }
        const o = this.origin
        this.floor.addChild(this.container)

        // Market square ground: soft cobblestone area
        const ground = new PIXI.Graphics()
        ground.roundRect(o.x * 32 - 8, o.y * 32 + 8, WIDTH * 32 + 16, HEIGHT * 32 - 8, 18).fill({ color: 0xd8c3a5, alpha: 0.35 })
        this.container.addChild(ground)
        const title = new PIXI.Text({ text: '🏘️ MARKET SQUARE', style: { fontFamily: 'silkscreen', fontSize: 128, fill: 0xfff3d6 } })
        title.scale.set(0.11)
        title.anchor.set(0.5, 0)
        title.x = (o.x + WIDTH / 2) * 32
        title.y = o.y * 32 + 12
        this.container.addChild(title)

        for (const spot of LAYOUT) {
            const tx = o.x + spot.x
            const ty = o.y + spot.y
            const g = new PIXI.Graphics()
            if (spot.kind === 'shop') {
                g.roundRect((tx - 1) * 32 + 4, (ty - 0.5) * 32, 3 * 32 - 8, 2 * 32, 8).fill({ color: STALL_COLORS[spot.id] ?? 0x888888, alpha: 0.55 })
                g.roundRect((tx - 1) * 32 + 4, (ty - 0.5) * 32, 3 * 32 - 8, 10, 6).fill({ color: 0xffffff, alpha: 0.5 })
            } else {
                g.circle(tx * 32 + 16, ty * 32 + 16, 26).fill({ color: GATHER_COLORS[spot.id] ?? 0x888888, alpha: 0.45 })
                g.circle(tx * 32 + 16, ty * 32 + 16, 26).stroke({ color: 0xffffff, alpha: 0.6, width: 2 })
                const icon = new PIXI.Text({ text: spot.icon, style: { fontSize: 128 } })
                icon.scale.set(0.2)
                icon.anchor.set(0.5)
                icon.x = tx * 32 + 16
                icon.y = ty * 32 + 14
                this.container.addChild(g, icon)
                this.addLabel(spot.label, tx * 32 + 16, ty * 32 + 46)
                // gathering spots are clickable
                g.eventMode = 'static'
                g.cursor = 'pointer'
                g.on('pointerdown', e => { e.stopPropagation(); this.app.player.moveToTile(tx, ty + 1); signal.emit('villageOpen', { kind: 'gather', id: spot.id }) })
                continue
            }
            this.container.addChild(g)
            this.signs[spot.id] = this.addLabel(`${spot.icon} ${spot.label}`, tx * 32 + 16, (ty - 0.5) * 32 - 8)
        }

        for (const info of npcs) {
            const spot = LAYOUT.find(s => s.kind === 'shop' && s.id === info.id)
            if (!spot) continue
            const npc = new Player(info.skin, this.app, `${info.name}`)
            await npc.init()
            npc.setPosition(o.x + spot.x, o.y + spot.y)
            npc.parent.eventMode = 'static'
            npc.parent.cursor = 'pointer'
            npc.parent.on('pointerdown', e => {
                e.stopPropagation()
                this.app.player.moveToTile(o.x + spot.x, o.y + spot.y + 1)
                signal.emit('villageOpen', { kind: 'shop', id: info.id })
            })
            this.objects.addChild(npc.parent)
            this.app.blocked.add(`${o.x + spot.x}, ${o.y + spot.y}` as TilePoint)
            this.npcs[info.id] = npc
        }
        this.app.sortObjectsByY()
        this.updateShops(npcs)

        this.interval = setInterval(() => this.checkProximity(), 250)
    }

    private addLabel(text: string, x: number, y: number) {
        const t = new PIXI.Text({ text, style: { fontFamily: 'silkscreen', fontSize: 128, fill: 0xffffff, stroke: { color: 0x000000, width: 18 } } })
        t.scale.set(0.075)
        t.anchor.set(0.5, 1)
        t.x = x
        t.y = y
        this.container.addChild(t)
        return t
    }

    /** Reflect open/closed shops. */
    updateShops(npcs: NpcInfo[]) {
        for (const info of npcs) {
            const npc = this.npcs[info.id]
            const sign = this.signs[info.id]
            const spot = LAYOUT.find(s => s.id === info.id)
            if (npc) npc.parent.alpha = info.open ? 1 : 0.45
            if (sign && spot) sign.text = info.open ? `${spot.icon} ${spot.label}` : `🚫 CLOSED · ${spot.label}`
        }
    }

    say(shopId: string, text: string) {
        this.npcs[shopId]?.setMessage(text)
    }

    private checkProximity() {
        if (!this.origin) return
        const p = this.app.player.currentTilePosition
        let found: VillageSpot | null = null
        for (const s of LAYOUT) {
            const sx = this.origin.x + s.x
            const sy = this.origin.y + s.y
            const dx = Math.abs(p.x - sx)
            const dy = p.y - sy
            if (dx <= 1 && dy >= -1 && dy <= (s.kind === 'shop' ? 2 : 1)) { found = s; break }
        }
        const key = found ? `${found.kind}:${found.id}` : null
        if (key !== this.current) {
            this.current = key
            signal.emit('villageProximity', found ? { kind: found.kind, id: found.id, label: found.label, icon: found.icon } : null)
        }
    }

    /** Walk the local player to the Market Square. */
    walkHere() {
        if (!this.origin) return
        this.app.player.moveToTile(this.origin.x + 8, this.origin.y + 5)
    }

    destroy() {
        if (this.interval) clearInterval(this.interval)
        Object.values(this.npcs).forEach(n => n.parent.destroy({ children: true }))
        this.npcs = {}
        this.container.destroy({ children: true })
    }
}
