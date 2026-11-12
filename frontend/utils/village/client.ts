// Village client: talks to the backend over the office socket and keeps a small observable store.
import { server } from '../backend/server'
import signal from '../signal'

export interface Quote { good: string; price: number; available: number; reasons: string[] }
export interface ShopView {
    id: string; name: string; title: string; skin: string; open: boolean; coins: number; reserved: number; mood: number
    stock: Record<string, number>; investors: Record<string, number>; account: string
    sells: Quote[]; buys: Quote[]
}
export interface Job {
    id: string; shopId: string; good: string; qty: number; reward: number; postedAt: number; expiresAt: number; takenBy?: string
    size?: 'small' | 'big' | 'urgent'; funded?: 'shop' | 'town'; note?: string
}
export interface ProjectInfo { id: string; name: string; icon: string; needs: Record<string, number>; reward: string; sprite: string }
export interface ProjectView {
    current: (ProjectInfo & { given: Record<string, number>; helpers: { name: string; points: number }[] }) | null
    built: (ProjectInfo & { day: number; helpers: string[] })[]
    total: number
}
export interface Catalog {
    rares: { id: string; name: string; icon: string; spot: string; value: number; buyer: string; tier: 1 | 2 }[]
    tools: { id: string; name: string; icon: string; spot: string; price: number; uses: number }[]
    hats: { id: string; name: string; icon: string; price: number | null }[]
    projects: ProjectInfo[]
}
export interface Pact { good: string; against: string; againstName: string; members: string[]; until: number }
export interface VillageState {
    t: number; day: number; hour: number; shops: ShopView[]; jobs: Job[]; pacts: Pact[]; project: ProjectView
    prices: Record<string, { t: number; price: number }[]>
}
export interface VillageEvent { id: number; t: number; kind: string; text: string; shopId?: string; uid?: string }
export interface Wallet {
    uid: string; name: string; accountId: string; balances: Record<string, number>; onChain: boolean
    hat: string | null; found: string[]; wear: Record<string, number>; sinceRare: number
}
export interface ChainTx { hash: string; method: string; summary: string; ok: boolean; at: number; url: string | null }
export interface GoodInfo { id: string; name: string; icon: string; basePrice: number; raw: boolean }

export interface Store {
    joined: boolean
    state: VillageState | null
    events: VillageEvent[]
    wallet: Wallet | null
    goods: Record<string, GoodInfo>
    chain: { enabled: boolean; items: string; market: string; pool: string; recent: ChainTx[] }
    ai: boolean
    fastForward: boolean
    catalog: Catalog
    /** Hat icon worn by each player in this office (uid → emoji). */
    hats: Record<string, string>
    /** Where the current team project will stand (Market Square room), drawn as a building site. */
    buildSite: BuildSite | null
}
export interface BuildSite { roomIndex: number; x: number; y: number; w: number; h: number }

let store: Store = {
    joined: false, state: null, events: [], wallet: null, goods: {},
    chain: { enabled: false, items: '', market: '', pool: '', recent: [] }, ai: false, fastForward: false,
    catalog: { rares: [], tools: [], hats: [], projects: [] }, hats: {}, buildSite: null,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<Store>) => {
    store = { ...store, ...patch }
    listeners.forEach(l => l())
}

export const villageStore = {
    get: () => store,
    subscribe: (l: () => void) => {
        listeners.add(l)
        return () => { listeners.delete(l) }
    },
}

export function call<T = any>(event: string, data: any = {}): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!server.socket?.emit) return reject(new Error('Not connected'))
        server.socket.timeout(20000).emit(event, data, (err: any, res: any) => {
            if (err) return reject(new Error('The server did not answer.'))
            if (res?.error) return reject(new Error(res.error))
            resolve(res)
        })
    })
}

let attached = false
export async function joinVillage() {
    const s = server.socket
    if (!s?.on) return
    if (!attached) {
        attached = true
        s.on('village:state', (state: VillageState) => {
            set({ state })
            signal.emit('villageShops', state.shops)
            signal.emit('villageProject', state.project)
        })
        s.on('village:events', (evs: VillageEvent[]) => {
            set({ events: [...store.events, ...evs].slice(-80) })
            evs.forEach(e => signal.emit('villageEvent', e))
        })
        s.on('village:wallet', (wallet: Wallet) => set({ wallet }))
        s.on('village:say', (m: { shopId: string; text: string }) => signal.emit('villageSay', m))
        s.on('village:chainTx', (tx: ChainTx) => set({ chain: { ...store.chain, recent: [tx, ...store.chain.recent].slice(0, 30) } }))
        s.on('village:fastForward', (f: { running: boolean }) => set({ fastForward: f.running }))
        s.on('village:hat', (h: { uid: string; hat: string | null }) => {
            const hats = { ...store.hats }
            if (h.hat) hats[h.uid] = h.hat
            else delete hats[h.uid]
            set({ hats })
            signal.emit('villageHat', h)
        })
        s.on('village:built', (b: BuiltLandmark) => {
            set({ buildSite: b.nextSite ?? null })
            signal.emit('villageBuilt', b)
        })
        s.on('connect', async () => {
            // after a reconnect, wait for the office session to be restored before rejoining
            for (let i = 0; i < 30; i++) {
                try { await joinVillage(); return } catch { await new Promise(r => setTimeout(r, 700)) }
            }
        })
    }
    const res = await call('village:join')
    set({
        joined: true, state: res.state, events: res.events, wallet: res.wallet, goods: res.goods,
        chain: res.chain, ai: res.ai, fastForward: res.fastForward, catalog: res.catalog, hats: res.hats ?? {}, buildSite: res.buildSite ?? null,
    })
    signal.emit('villageBuildSite', store.buildSite)
    signal.emit('villageProject', res.state.project)
    for (const [uid, hat] of Object.entries(store.hats)) signal.emit('villageHat', { uid, hat })
    signal.emit('villageShops', res.state.shops)
}

export interface BuiltLandmark {
    id: string; name: string; icon: string; reward: string; sprite?: string; roomIndex?: number; x?: number; y?: number; nextSite?: BuildSite | null
}

/** Every item's icon and name: goods, rare finds, tools and hats. */
export function itemInfo(id: string): { name: string; icon: string } {
    const g = store.goods[id]
    if (g) return g
    const c = store.catalog
    const x = c.rares.find(r => r.id === id) ?? c.tools.find(t => t.id === id) ?? c.hats.find(h => h.id === id)
    if (x) return x
    if (id === 'coin') return { name: 'Coins', icon: '🪙' }
    return { name: id, icon: '📦' }
}

export const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`
