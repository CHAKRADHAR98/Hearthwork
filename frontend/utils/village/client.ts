// Village client: talks to the backend over the office socket and keeps a small observable store.
import { server } from '../backend/server'
import signal from '../signal'

export interface Quote { good: string; price: number; available: number; reasons: string[] }
export interface ShopView {
    id: string; name: string; title: string; skin: string; open: boolean; coins: number; reserved: number; mood: number
    stock: Record<string, number>; investors: Record<string, number>; account: string
    sells: Quote[]; buys: Quote[]
}
export interface Job { id: string; shopId: string; good: string; qty: number; reward: number; expiresAt: number; takenBy?: string }
export interface Pact { good: string; against: string; againstName: string; members: string[]; until: number }
export interface VillageState {
    t: number; day: number; hour: number; shops: ShopView[]; jobs: Job[]; pacts: Pact[]
    prices: Record<string, { t: number; price: number }[]>
}
export interface VillageEvent { id: number; t: number; kind: string; text: string; shopId?: string; uid?: string }
export interface Wallet { uid: string; name: string; accountId: string; balances: Record<string, number>; onChain: boolean }
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
}

let store: Store = {
    joined: false, state: null, events: [], wallet: null, goods: {},
    chain: { enabled: false, items: '', market: '', pool: '', recent: [] }, ai: false, fastForward: false,
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
        })
        s.on('village:events', (evs: VillageEvent[]) => {
            set({ events: [...store.events, ...evs].slice(-80) })
            evs.forEach(e => signal.emit('villageEvent', e))
        })
        s.on('village:wallet', (wallet: Wallet) => set({ wallet }))
        s.on('village:say', (m: { shopId: string; text: string }) => signal.emit('villageSay', m))
        s.on('village:chainTx', (tx: ChainTx) => set({ chain: { ...store.chain, recent: [tx, ...store.chain.recent].slice(0, 30) } }))
        s.on('village:fastForward', (f: { running: boolean }) => set({ fastForward: f.running }))
        s.on('connect', () => { joinVillage() })
    }
    const res = await call('village:join')
    set({
        joined: true, state: res.state, events: res.events, wallet: res.wallet, goods: res.goods,
        chain: res.chain, ai: res.ai, fastForward: res.fastForward,
    })
    signal.emit('villageShops', res.state.shops)
}

export const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`
