'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { call, fmtHour, joinVillage, VillageEvent } from '@/utils/village/client'
import { useVillage } from './useVillage'
import ShopPanel from './ShopPanel'
import MarketBoard from './MarketBoard'
import { btnGhost, icon, nearAccountUrl, panel } from './ui'

type Near = { kind: 'shop' | 'gather'; id: string; label: string; icon: string } | null

const BIG_NEWS = ['bankrupt', 'reopen', 'pact', 'job', 'dividend']

export default function VillageHUD() {
    const { joined, state, wallet, fastForward, chain } = useVillage()
    const [near, setNear] = useState<Near>(null)
    const [openShop, setOpenShop] = useState<string | null>(null)
    const [board, setBoard] = useState(false)
    const [ticker, setTicker] = useState<VillageEvent | null>(null)

    // join once the office socket is connected
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') (window as any).hwSignal = signal // handy for screenshots/tests
        let stop = false
        const tryJoin = async () => {
            while (!stop && !server.socket?.connected) await new Promise(r => setTimeout(r, 400))
            if (stop) return
            joinVillage().catch(e => console.error('village join failed', e))
        }
        tryJoin()
        return () => { stop = true }
    }, [])

    const gather = useCallback(async (spot: string) => {
        try {
            const r: any = await call('village:gather', { spot })
            toast.success(`Gathered ${r.text}`, { autoClose: 1500 })
        } catch (e: any) {
            toast.info(e.message, { autoClose: 2000 })
        }
    }, [])

    const activate = useCallback((target: Near) => {
        if (!target) return
        if (target.kind === 'shop') setOpenShop(target.id)
        else gather(target.id)
    }, [gather])

    useEffect(() => {
        const onNear = (n: Near) => setNear(n)
        const onOpen = (t: { kind: 'shop' | 'gather'; id: string }) => {
            if (t.kind === 'shop') setOpenShop(t.id)
            else gather(t.id)
        }
        const onEvent = (e: VillageEvent) => {
            if (!BIG_NEWS.includes(e.kind)) return
            setTicker(e)
            if (e.kind === 'bankrupt' || e.kind === 'pact') toast.warn(e.text, { autoClose: 6000 })
        }
        signal.on('villageProximity', onNear)
        signal.on('villageOpen', onOpen)
        signal.on('villageEvent', onEvent)
        return () => {
            signal.off('villageProximity', onNear)
            signal.off('villageOpen', onOpen)
            signal.off('villageEvent', onEvent)
        }
    }, [gather])

    // E to interact, M for the market board
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
            if (e.key === 'e' || e.key === 'E') activate(near)
            if (e.key === 'm' || e.key === 'M') setBoard(b => !b)
            if (e.key === 'Escape') { setOpenShop(null); setBoard(false) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [near, activate])

    // close a shop panel when walking away from it
    useEffect(() => {
        if (openShop && near?.kind === 'shop' && near.id !== openShop) setOpenShop(near.id)
    }, [near, openShop])

    if (!joined || !state || !wallet) return null
    const goods = Object.entries(wallet.balances).filter(([g, n]) => g !== 'coin' && n > 0)

    async function fastForwardWeek() {
        try {
            await call('village:fastForward', { days: 7 })
            toast.info('⏩ Fast-forwarding a week of village life…', { autoClose: 3000 })
            setBoard(true)
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    return (
        <>
            {/* top-left HUD */}
            <div className={`${panel} absolute left-2 top-2 z-30 p-2 flex flex-col gap-2 text-sm max-w-[calc(100vw-1rem)] sm:max-w-sm`}>
                <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-bold'>🏘️ Day {state.day} · {fmtHour(state.hour)}</span>
                    {fastForward && <span className='text-xs bg-[#c9a227] text-[#1f1913] rounded px-1.5 animate-pulse'>⏩ fast-forward</span>}
                </div>
                <div className='flex items-center gap-2 flex-wrap'>
                    <span className='text-base font-bold tabular-nums'>🪙 {wallet.balances.coin ?? 0}</span>
                    {goods.map(([g, n]) => <span key={g} className='tabular-nums'>{icon(g)} {n}</span>)}
                </div>
                <a className='text-[11px] text-[#cdb88f] underline truncate' href={nearAccountUrl(wallet.accountId)} target='_blank' rel='noreferrer' title='Your NEAR wallet (created for you at sign-in)'>
                    {chain.enabled ? '⛓️' : '⚠️ off-chain'} {wallet.accountId}
                </a>
                <div className='flex gap-1.5 flex-wrap'>
                    <button className={btnGhost} onClick={() => signal.emit('villageWalk')}>🚶 Market</button>
                    <button className={btnGhost} onClick={() => setBoard(true)}>📈 Board <kbd className='text-[10px] opacity-60'>M</kbd></button>
                    <button className={btnGhost} disabled={fastForward} onClick={fastForwardWeek}>⏩ 1 week</button>
                </div>
            </div>

            {/* news ticker */}
            {ticker && (
                <div className={`${panel} absolute left-1/2 -translate-x-1/2 top-2 z-20 px-3 py-1.5 text-sm max-w-[min(560px,calc(100vw-1rem))] hidden md:block`}>
                    {ticker.text}
                </div>
            )}

            {/* interaction prompt */}
            {near && !openShop && (
                <button onClick={() => activate(near)} className={`${panel} absolute left-1/2 -translate-x-1/2 bottom-20 z-30 px-4 py-2 text-sm hover:border-[#e0b93a]`}>
                    <kbd className='bg-[#c9a227] text-[#1f1913] rounded px-1.5 mr-2 font-bold'>E</kbd>
                    {near.kind === 'shop' ? `Talk to ${near.label}` : `${near.icon} Gather at the ${near.label.toLowerCase()}`}
                </button>
            )}

            {openShop && <ShopPanel shopId={openShop} onClose={() => setOpenShop(null)} />}
            {board && <MarketBoard onClose={() => setBoard(false)} />}
        </>
    )
}

