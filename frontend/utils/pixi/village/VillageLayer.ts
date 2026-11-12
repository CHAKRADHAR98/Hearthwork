// Places the Market Square inside the office world: shopkeeper NPCs at their stalls and gathering spots.
// It finds an open patch of ground near the spawn point, so it works on any office map.

import * as PIXI from 'pixi.js'
import { Player } from '../Player/Player'
import type { PlayApp } from '../PlayApp'
import signal from '@/utils/signal'
import { TilePoint } from '../types'
import type { BuildSite, ProjectView } from '../../village/client'

import { LAYOUT, NpcInfo, VillageSpot } from '../../village/layout'
export { LAYOUT } from '../../village/layout'
export type { NpcInfo, VillageSpot, VillageSpotKind } from '../../village/layout'

/** Default layout origin inside the default Market Square room (backend/src/village/marketRoom.ts DEFAULT_SPOTS). */
const MARKET_ORIGIN_DEFAULT = { x: 4, y: 2 }
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
    private site: BuildSite | null = null
    private siteGfx: PIXI.Container | null = null
    private siteLabel: PIXI.Text | null = null

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

    /** Absolute tile position of every shop and gathering spot in this room. */
    pos: Record<string, { x: number; y: number }> = {}

    /**
     * `positions` come from the room's villageSpot tiles (customisable in the editor); anything missing
     * falls back to the default layout. `exit` is the tile that leads back to the office.
     */
    async mount(npcs: NpcInfo[], positions: Record<string, { x: number; y: number }>, exit?: { x: number; y: number }) {
        const o = MARKET_ORIGIN_DEFAULT
        this.origin = o
        for (const spot of LAYOUT) this.pos[spot.id] = positions[spot.id] ?? { x: o.x + spot.x, y: o.y + spot.y }
        this.floor.addChild(this.container)

        for (const spot of LAYOUT) {
            const tx = this.pos[spot.id].x
            const ty = this.pos[spot.id].y
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
            const at = this.pos[spot.id]
            npc.setPosition(at.x, at.y)
            npc.parent.eventMode = 'static'
            npc.parent.cursor = 'pointer'
            npc.parent.on('pointerdown', e => {
                e.stopPropagation()
                this.app.player.moveToTile(at.x, at.y + 1)
                signal.emit('villageOpen', { kind: 'shop', id: info.id })
            })
            this.objects.addChild(npc.parent)
            this.app.blocked.add(`${at.x}, ${at.y}` as TilePoint)
            this.npcs[info.id] = npc
        }
        this.app.sortObjectsByY()
        this.updateShops(npcs)
        if (exit) this.addLabel('⬇ Back to the office', exit.x * 32 + 16, exit.y * 32 - 2)

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

    /** The team project's building site: a roped-off plot with a sign showing progress. */
    setBuildSite(site: BuildSite | null, project: ProjectView | null) {
        this.siteGfx?.destroy({ children: true })
        this.siteGfx = null
        this.siteLabel = null
        this.site = site
        if (!site || !project?.current) return
        const c = new PIXI.Container()
        const left = site.x * 32, top = (site.y - site.h + 1) * 32, w = site.w * 32, h = site.h * 32
        const g = new PIXI.Graphics()
        g.rect(left + 2, top + 2, w - 4, h - 4).fill({ color: 0x8a6a3c, alpha: 0.25 })
        // rope and posts around the plot
        g.rect(left + 2, top + 2, w - 4, h - 4).stroke({ color: 0xe0b93a, width: 2, alpha: 0.9 })
        for (const [px, py] of [[left + 2, top + 2], [left + w - 2, top + 2], [left + 2, top + h - 2], [left + w - 2, top + h - 2]]) {
            g.rect(px - 3, py - 6, 6, 9).fill(0x6b4423)
        }
        // a few planks and stones waiting to be used
        g.rect(left + 10, top + h - 18, 22, 5).fill(0xb4804a).rect(left + 12, top + h - 12, 22, 5).fill(0x96623a)
        g.circle(left + w - 18, top + h - 14, 5).fill(0x9a948a).circle(left + w - 26, top + h - 11, 4).fill(0x8a847a)
        g.eventMode = 'static'
        g.cursor = 'pointer'
        g.on('pointerdown', e => { e.stopPropagation(); this.app.player.moveToTile(site.x + Math.floor(site.w / 2), site.y + 1); signal.emit('villageOpen', { kind: 'build', id: 'project' }) })
        const icon = new PIXI.Text({ text: '🏗️', style: { fontSize: 128 } })
        icon.scale.set(0.22)
        icon.anchor.set(0.5)
        icon.x = left + w / 2
        icon.y = top + h / 2
        c.addChild(g, icon)
        this.container.addChild(c)
        this.siteGfx = c
        this.siteLabel = this.addLabel('', left + w / 2, top - 2)
        c.addChild(this.siteLabel)
        this.updateProject(project)
    }

    updateProject(project: ProjectView | null) {
        const p = project?.current
        if (!this.siteLabel || !p) return
        const need = Object.values(p.needs).reduce((a, b) => a + b, 0)
        const got = Object.entries(p.needs).reduce((a, [k, n]) => a + Math.min(n, p.given[k] ?? 0), 0)
        this.siteLabel.text = `${p.icon} ${p.name} · ${Math.floor((got / need) * 100)}%`
    }

    say(shopId: string, text: string) {
        this.npcs[shopId]?.setMessage(text)
    }

    private checkProximity() {
        if (!this.origin) return
        const p = this.app.player.currentTilePosition
        let found: VillageSpot | null = null
        for (const s of LAYOUT) {
            const sx = this.pos[s.id].x
            const sy = this.pos[s.id].y
            const dx = Math.abs(p.x - sx)
            const dy = p.y - sy
            if (dx <= 1 && dy >= -1 && dy <= (s.kind === 'shop' ? 2 : 1)) { found = s; break }
        }
        let near: { kind: string; id: string; label: string; icon: string } | null = found ? { kind: found.kind, id: found.id, label: found.label, icon: found.icon } : null
        const s = this.site
        if (!near && s && this.siteGfx && p.x >= s.x - 1 && p.x <= s.x + s.w && p.y >= s.y - s.h && p.y <= s.y + 1) {
            near = { kind: 'build', id: 'project', label: 'building site', icon: '🏗️' }
        }
        const key = near ? `${near.kind}:${near.id}` : null
        if (key !== this.current) {
            this.current = key
            signal.emit('villageProximity', near)
        }
    }

    /** Walk the local player to the Market Square. */
    walkHere() {
        const all = Object.values(this.pos)
        if (!all.length) return
        const cx = Math.round(all.reduce((a, p) => a + p.x, 0) / all.length)
        const cy = Math.round(all.reduce((a, p) => a + p.y, 0) / all.length)
        this.app.player.moveToTile(cx, cy)
    }

    destroy() {
        if (this.interval) clearInterval(this.interval)
        if (this.current) signal.emit('villageProximity', null)
        Object.values(this.npcs).forEach(n => n.parent.destroy({ children: true }))
        this.npcs = {}
        this.container.destroy({ children: true })
    }
}

/** Glowing markers on Market Square entrance tiles in the office, so players can see where to go. */
export function drawEntrances(layer: PIXI.Container, tiles: { x: number; y: number }[]) {
    const c = new PIXI.Container()
    for (const { x, y } of tiles) {
        const g = new PIXI.Graphics()
        g.roundRect(x * 32 + 2, y * 32 + 2, 28, 28, 6).fill({ color: 0xe0b93a, alpha: 0.45 }).stroke({ color: 0xfff3d6, width: 2, alpha: 0.9 })
        const t = new PIXI.Text({ text: '🏘️ Market Square', style: { fontFamily: 'silkscreen', fontSize: 128, fill: 0xfff3d6, stroke: { color: 0x1f1913, width: 20 } } })
        t.scale.set(0.08)
        t.anchor.set(0.5, 1)
        t.x = x * 32 + 16
        t.y = y * 32 - 2
        c.addChild(g, t)
    }
    layer.addChild(c)
    return c
}
