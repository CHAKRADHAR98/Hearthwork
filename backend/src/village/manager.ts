// Runs one Village per office, persists them, ticks the clock, settles to NEAR and talks to clients.

import fs from 'fs'
import path from 'path'
import { Server, Socket } from 'socket.io'
import { z } from 'zod'
import { aiEnabled, gossip, haggle } from './agents'
import { chain, ITEMS_CONTRACT, MARKET_CONTRACT, parseNear, POOL_CONTRACT } from './chain'
import { COIN, GATHER_SPOTS, GOODS, GOOD_IDS, GoodId } from './goods'
import { SHOP_BY_ID, ShopId, SHOPS } from './shops'
import { Deal, Village, VillageEvent } from './village'
import { Wallets } from './wallets'
import { EXTRA_TOKENS, HAT_BY_ID, HATS, ProjectInfo, PROJECTS, RARES, TOOLS } from './extras'
import { placeLandmarks } from './marketRoom'
import { sessionManager } from '../session'

const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const HOUR_MS = Number(process.env.VILLAGE_HOUR_MS || 2500) // one game hour; a day lasts one minute
const FAST_HOUR_MS = 350 // fast-forward: a week in about a minute
const SETTLE_MS = Number(process.env.NEAR_SETTLE_MS || 15000)
const STARTING_COINS = 40
/** Testnet NEAR given to each new player's wallet so they can bet and use the team pool. */
const WELCOME_GRANT = parseNear(process.env.NEAR_WELCOME_GRANT || '0.05')

const ShopIdZ = z.enum(SHOPS.map(s => s.id) as [ShopId, ...ShopId[]])
const GoodZ = z.enum(GOOD_IDS as [GoodId, ...GoodId[]])
const Qty = z.number().int().min(1).max(99)

interface Running {
    village: Village
    timer: NodeJS.Timeout
    fastForwardLeft: number
    lastEventSent: number
    conversations: Record<string, { from: 'player' | 'shop'; text: string; offer?: number }[]>
    lastGossip: number
}

class VillageManager {
    wallets = new Wallets()
    running: Record<string, Running> = {}
    io!: Server

    init(io: Server) {
        this.io = io
        fs.mkdirSync(path.join(DATA_DIR, 'villages'), { recursive: true })
        try {
            this.wallets = Wallets.fromJSON(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wallets.json'), 'utf8')))
        } catch { /* fresh start */ }
        chain.init()
        chain.registerTokens(EXTRA_TOKENS)
        chain.onTx(tx => io.emit('village:chainTx', { ...tx, url: tx.hash ? chain.explorerTx(tx.hash) : null }))
        setInterval(() => this.save(), 30000)
        setInterval(() => {
            const day = Object.values(this.running)[0]?.village.day
            chain.settle(this.wallets, day ? `village activity up to day ${day}` : 'village activity')
        }, SETTLE_MS)
    }

    // ───────────────────────── lifecycle ─────────────────────────

    get(realmId: string): Running {
        if (this.running[realmId]) return this.running[realmId]
        let village: Village
        try {
            const snap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'villages', `${realmId}.json`), 'utf8'))
            village = Village.fromJSON(realmId, this.wallets, snap)
        } catch {
            village = new Village(realmId, this.wallets)
        }
        const r: Running = { village, timer: null as any, fastForwardLeft: 0, lastEventSent: village.eventSeq, conversations: {}, lastGossip: 0 }
        this.running[realmId] = r
        for (const def of SHOPS) chain.ensureAccount(this.wallets.accountId(village.shopAccount(def.id)))
        this.schedule(realmId)
        return r
    }

    /** Landmarks this office has built (works without starting its simulation, e.g. for the editor). */
    builtIds(realmId: string): string[] {
        if (this.running[realmId]) return this.running[realmId].village.built.map(b => b.id)
        try {
            const snap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'villages', `${realmId}.json`), 'utf8'))
            return (snap.built ?? []).map((b: { id: string }) => b.id)
        } catch {
            return []
        }
    }

    /** A project was finished: put the landmark on this office's live map and show it to everyone inside. */
    private onBuilt(realmId: string, p: ProjectInfo) {
        const session = sessionManager.getSession(realmId)
        if (!session) return
        const placed = placeLandmarks(session.map_data, [p.id])
        for (const pl of placed) this.io.to(this.room(realmId)).emit('village:built', { ...pl, name: p.name, icon: p.icon, reward: p.reward })
        if (!placed.length) this.io.to(this.room(realmId)).emit('village:built', { id: p.id, name: p.name, icon: p.icon, reward: p.reward })
    }

    /** Hats worn by everyone currently in this office. */
    private hatsInRoom(realmId: string) {
        const hats: Record<string, string> = {}
        for (const sid of this.io.sockets.adapter.rooms.get(this.room(realmId)) ?? []) {
            const uid = this.io.sockets.sockets.get(sid)?.handshake.query.uid as string
            const hat = uid && this.wallets.profiles[uid]?.hat
            if (hat && HAT_BY_ID[hat]) hats[uid] = HAT_BY_ID[hat].icon
        }
        return hats
    }

    private emitHat(realmId: string, uid: string) {
        const hat = this.wallets.profiles[uid]?.hat
        this.io.to(this.room(realmId)).emit('village:hat', { uid, hat: hat && HAT_BY_ID[hat] ? HAT_BY_ID[hat].icon : null })
    }

    private schedule(realmId: string) {
        const r = this.running[realmId]
        clearTimeout(r.timer)
        r.timer = setTimeout(() => {
            r.village.tick()
            if (r.fastForwardLeft > 0) {
                r.fastForwardLeft--
                if (r.fastForwardLeft === 0) this.io.to(this.room(realmId)).emit('village:fastForward', { running: false })
            }
            this.broadcast(realmId)
            this.schedule(realmId)
        }, r.fastForwardLeft > 0 ? FAST_HOUR_MS : HOUR_MS)
    }

    private room(realmId: string) {
        return `village:${realmId}`
    }

    private broadcast(realmId: string) {
        const r = this.running[realmId]
        const v = r.village
        this.io.to(this.room(realmId)).emit('village:state', v.publicState())
        const fresh = v.eventsSince(r.lastEventSent)
        if (fresh.length) {
            r.lastEventSent = fresh[fresh.length - 1].id
            this.io.to(this.room(realmId)).emit('village:events', fresh)
            this.maybeGossip(realmId, fresh)
            // players whose balances changed via jobs/dividends get a wallet refresh
            for (const uid of new Set(fresh.filter(e => e.kind === 'dividend' || e.uid).map(e => e.uid).filter(Boolean))) this.sendWallet(uid!)
        }
        // dividends credit investors without a uid on the event, so refresh everyone in the village occasionally
        if (v.hour === 0) for (const s of this.io.sockets.adapter.rooms.get(this.room(realmId)) ?? []) {
            const uid = (this.io.sockets.sockets.get(s)?.handshake.query.uid as string) || ''
            if (uid) this.sendWallet(uid)
        }
    }

    private maybeGossip(realmId: string, events: VillageEvent[]) {
        const r = this.running[realmId]
        const juicy = events.find(e => ['bankrupt', 'pact', 'reopen', 'invest'].includes(e.kind))
        if (!juicy || Date.now() - r.lastGossip < 8000 || r.fastForwardLeft > 0) return
        r.lastGossip = Date.now()
        const speaker = (juicy.shopId && juicy.kind !== 'bankrupt' ? juicy.shopId : SHOPS.filter(s => s.id !== juicy.shopId)[Math.floor(Math.random() * 4)].id) as ShopId
        gossip(speaker, juicy.text).then(line => {
            if (line) this.io.to(this.room(realmId)).emit('village:say', { shopId: speaker, text: line })
        })
    }

    save() {
        try {
            fs.writeFileSync(path.join(DATA_DIR, 'wallets.json'), JSON.stringify(this.wallets))
            for (const [id, r] of Object.entries(this.running)) fs.writeFileSync(path.join(DATA_DIR, 'villages', `${id}.json`), JSON.stringify(r.village))
        } catch (e) {
            console.error('[village] save failed', e)
        }
    }

    // ───────────────────────── players ─────────────────────────

    ensurePlayer(uid: string, username: string) {
        const isNew = !this.wallets.profiles[uid]
        const profile = this.wallets.registerPlayer(uid, username)
        if (isNew) {
            this.wallets.credit(uid, COIN, STARTING_COINS)
            chain.ensureAccount(profile.accountId, WELCOME_GRANT)
        }
        return profile
    }

    walletView(uid: string) {
        const p = this.wallets.profiles[uid]
        return {
            uid, name: p?.name, accountId: p?.accountId, balances: this.wallets.all(uid), onChain: chain.enabled,
            hat: p?.hat ?? null, found: p?.found ?? [], wear: p?.wear ?? {}, sinceRare: p?.sinceRare ?? 0,
        }
    }

    sendWallet(uid: string) {
        for (const [, s] of this.io.sockets.sockets) if (s.handshake.query.uid === uid) s.emit('village:wallet', this.walletView(uid))
    }

    // ───────────────────────── socket handlers ─────────────────────────

    attach(socket: Socket, getContext: () => { uid: string; username: string; realmId: string } | null) {
        const handle = <T extends z.ZodTypeAny>(event: string, schema: T, fn: (ctx: { uid: string; username: string; realmId: string; r: Running }, data: z.infer<T>) => any) => {
            socket.on(event, async (data: unknown, ack?: (res: any) => void) => {
                const reply = typeof ack === 'function' ? ack : () => {}
                const parsed = schema.safeParse(data ?? {})
                if (!parsed.success) return reply({ error: 'Invalid request.' })
                const ctx = getContext()
                if (!ctx) return reply({ error: 'Join an office first.' })
                try {
                    const r = this.get(ctx.realmId)
                    const result = await fn({ ...ctx, r }, parsed.data)
                    reply({ ok: true, ...result })
                    this.broadcast(ctx.realmId)
                    this.sendWallet(ctx.uid)
                } catch (e: any) {
                    reply({ error: e?.message ?? 'Something went wrong.' })
                }
            })
        }

        handle('village:join', z.object({}), ({ uid, username, realmId, r }) => {
            this.ensurePlayer(uid, username)
            socket.join(this.room(realmId))
            return {
                state: r.village.publicState(),
                events: r.village.events.slice(-40),
                wallet: this.walletView(uid),
                goods: GOODS,
                gatherSpots: GATHER_SPOTS,
                chain: { enabled: chain.enabled, items: ITEMS_CONTRACT, market: MARKET_CONTRACT, pool: POOL_CONTRACT, recent: chain.recent.slice(0, 15).map(t => ({ ...t, url: t.hash ? chain.explorerTx(t.hash) : null })) },
                ai: aiEnabled(),
                fastForward: r.fastForwardLeft > 0,
                catalog: { rares: RARES, tools: TOOLS, hats: HATS, projects: PROJECTS },
                hats: this.hatsInRoom(realmId),
            }
        })

        handle('village:leave', z.object({}), ({ realmId }) => {
            socket.leave(this.room(realmId))
            return {}
        })

        handle('village:gather', z.object({ spot: z.string() }), ({ uid, r }, { spot }) => {
            const got = r.village.gather(uid, spot)
            return { gathered: got, text: `+${got.qty} ${GOODS[got.good].icon} ${GOODS[got.good].name}` }
        })

        handle('village:buyItem', z.object({ item: z.string().max(32) }), ({ uid, realmId, r }, { item }) => {
            const res = r.village.buyItem(uid, item)
            if (HAT_BY_ID[item]) this.emitHat(realmId, uid)
            return res
        })

        handle('village:wearHat', z.object({ hat: z.string().max(32).nullable() }), ({ uid, realmId, r }, { hat }) => {
            const res = r.village.wearHat(uid, hat)
            this.emitHat(realmId, uid)
            return res
        })

        handle('village:sellRare', z.object({ rare: z.string().max(32) }), ({ uid, r }, { rare }) => r.village.sellRare(uid, rare))

        handle('village:donate', z.object({ token: z.string().max(32), qty: z.number().int().min(1).max(10000) }), ({ uid, realmId, r }, d) => {
            const res = r.village.donate(uid, d.token, d.qty)
            if (res.completed) {
                this.onBuilt(realmId, res.completed)
                this.save()
            }
            return { amount: res.amount, completed: res.completed?.id ?? null }
        })

        handle('village:buy', z.object({ shopId: ShopIdZ, good: GoodZ, qty: Qty, dealId: z.string().optional() }), ({ uid, r }, d) => {
            const deal = this.takeDeal(r, uid, d.dealId, d.shopId, 'buy', d.good, d.qty)
            const res = r.village.buy(uid, d.shopId, d.good, d.qty, deal)
            chain.trade(this.wallets, uid, r.village.shopAccount(d.shopId), d.good, res.qty, res.unitPrice)
            return { trade: res }
        })

        handle('village:sell', z.object({ shopId: ShopIdZ, good: GoodZ, qty: Qty, dealId: z.string().optional() }), ({ uid, r }, d) => {
            const deal = this.takeDeal(r, uid, d.dealId, d.shopId, 'sell', d.good, d.qty)
            const res = r.village.sell(uid, d.shopId, d.good, d.qty, deal)
            chain.trade(this.wallets, r.village.shopAccount(d.shopId), uid, d.good, res.qty, res.unitPrice)
            return { trade: res }
        })

        handle('village:haggle', z.object({ shopId: ShopIdZ, side: z.enum(['buy', 'sell']), good: GoodZ, qty: Qty, message: z.string().min(1).max(300) }), async ({ uid, username, r }, d) => {
            const v = r.village
            const def = SHOP_BY_ID[d.shopId]
            if (!v.shops[d.shopId].open) throw new Error(`${def.name}'s shop is closed.`)
            if (d.side === 'buy' && !def.sells.includes(d.good)) throw new Error(`${def.name} doesn't sell that.`)
            if (d.side === 'sell' && !def.buys.includes(d.good)) throw new Error(`${def.name} doesn't buy that.`)
            const bounds = v.haggleBounds(uid, d.shopId, d.side, d.good, d.qty)
            const key = `${uid}:${d.shopId}:${d.side}:${d.good}`
            const convo = (r.conversations[key] ??= [])
            const lastOffer = [...convo].reverse().find(m => m.from === 'shop' && m.offer)?.offer
            const s = v.shops[d.shopId]
            const pact = v.pacts.find(p => p.good === d.good && p.against === uid && p.members.includes(d.shopId))
            const situation = [
                `Stock of ${GOODS[d.good].name}: ${s.stock[d.good] ?? 0}. Cash: ${s.coins - s.reserved} coins. Mood: ${s.mood > 0.3 ? 'good' : s.mood < -0.3 ? 'grumpy' : 'neutral'}.`,
                `Why your price is what it is: ${bounds.reasons.join('; ')}.`,
                pact ? `You and ${pact.members.filter(m => m !== d.shopId).map(m => SHOP_BY_ID[m].name).join(', ')} secretly agreed to lowball ${username} today because they flooded the market. Hint at it slyly.` : '',
            ].join(' ')
            const res = await haggle({
                shopId: d.shopId, playerName: username, side: d.side, good: d.good, qty: d.qty,
                list: bounds.list, limit: bounds.limit, message: d.message,
                history: convo.map(m => ({ from: m.from, text: m.text })), situation, lastOffer,
            })
            convo.push({ from: 'player', text: d.message }, { from: 'shop', text: res.reply, offer: res.offer })
            if (convo.length > 12) convo.splice(0, convo.length - 12)
            const dealId = `${key}:${Date.now()}`
            v.deals[dealId] = { uid, shopId: d.shopId, side: d.side, good: d.good, qty: d.qty, unitPrice: res.offer, expiresAt: Date.now() + 90000 }
            this.io.to(this.room(r.village.realmId)).emit('village:say', { shopId: d.shopId, text: res.reply })
            return { reply: res.reply, offer: res.offer, accepted: res.accepted, dealId, list: bounds.list, total: res.offer * d.qty, source: res.source, reasons: bounds.reasons }
        })

        handle('village:takeJob', z.object({ jobId: z.string() }), ({ uid, r }, { jobId }) => ({ job: r.village.takeJob(uid, jobId) }))

        handle('village:deliverJob', z.object({ jobId: z.string() }), ({ uid, realmId, r }, { jobId }) => {
            const job = r.village.deliverJob(uid, jobId)
            this.io.to(this.room(realmId)).emit('village:say', { shopId: job.shopId, text: job.thanks })
            return { job }
        })

        handle('village:invest', z.object({ shopId: ShopIdZ, amount: z.number().int().min(1).max(100000) }), ({ uid, r }, d) => r.village.invest(uid, d.shopId, d.amount))

        handle('village:fastForward', z.object({ days: z.number().int().min(1).max(14).default(7) }), ({ realmId, r }, { days }) => {
            if (r.fastForwardLeft > 0) throw new Error('Already fast-forwarding.')
            r.fastForwardLeft = days * 24
            this.schedule(realmId)
            this.io.to(this.room(realmId)).emit('village:fastForward', { running: true, days })
            return { days }
        })

        handle('village:wallet', z.object({}), ({ uid }) => ({ wallet: this.walletView(uid) }))
    }

    private takeDeal(r: Running, uid: string, dealId: string | undefined, shopId: ShopId, side: 'buy' | 'sell', good: GoodId, qty: number): Deal | undefined {
        if (!dealId) return undefined
        const deal = r.village.deals[dealId]
        delete r.village.deals[dealId]
        if (!deal || deal.uid !== uid || deal.shopId !== shopId || deal.side !== side || deal.good !== good) throw new Error('That deal is no longer on the table.')
        if (deal.expiresAt < Date.now()) throw new Error('That offer expired. Haggle again!')
        if (qty !== deal.qty) throw new Error(`The deal was for ${deal.qty}.`)
        return deal
    }
}

export const villageManager = new VillageManager()
