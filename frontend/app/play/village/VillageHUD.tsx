'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { call, fmtHour, joinVillage, VillageEvent } from '@/utils/village/client'
import { useVillage } from './useVillage'
import ShopPanel from './ShopPanel'
import MarketBoard from './MarketBoard'
import RequestsPanel from './RequestsPanel'
import BagPanel from './BagPanel'
import ProjectPanel from './ProjectPanel'
import Celebrate from './Celebrate'
import HowToPlay from './HowToPlay'
import { btnGhost, icon, nearAccountUrl, panel } from './ui'
import type { BuiltLandmark } from '@/utils/village/client'

type Near = { kind: 'shop' | 'gather' | 'build'; id: string; label: string; icon: string } | null
type Side = 'requests' | 'bag' | 'build' | null

const BIG_NEWS = ['bankrupt', 'reopen', 'pact', 'job', 'dividend', 'rare', 'built', 'project']

export default function VillageHUD() {
    const { joined, state, wallet, fastForward, chain, goods: villageGoods } = useVillage()
    const [near, setNear] = useState<Near>(null)
    const [openShop, setOpenShop] = useState<string | null>(null)
    const [board, setBoard] = useState(false)
    const [side, setSide] = useState<Side>(null)
    const [ticker, setTicker] = useState<VillageEvent | null>(null)

    // join once the office socket is connected
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') (window as any).hwSignal = signal // handy for screenshots/tests
        let stop = false
        const tryJoin = async () => {
            while (!stop && !server.socket?.connected) await new Promise(r => setTimeout(r, 400))
            // The socket can be connected before the server has placed us in the office, so retry until it works.
            for (let attempt = 0; !stop && attempt < 30; attempt++) {
                try {
                    await joinVillage()
                    return
                } catch {
                    await new Promise(r => setTimeout(r, 700))
                }
            }
        }
        tryJoin()
        return () => { stop = true }
    }, [])

    const gather = useCallback(async (spot: string) => {
        try {
            const r: any = await call('village:gather', { spot })
            const g = r.gathered
            signal.emit('villageFloat', { text: `+${g.qty} ${icon(g.good)}${g.tool ? ` ${g.tool.icon}` : ''}` })
            if (g.tool?.broke) toast.info(`${g.tool.icon} Your ${g.tool.name.toLowerCase()} broke! Tor sells new ones.`, { autoClose: 4000 })
            if (g.collectionDone) {
                signal.emit('celebrate', { icon: '👑', title: 'Collection complete!', text: `You found every rare item and earned the Collector's crown. Wear it from your 🎒 bag!`, big: true })
            } else if (g.rare) {
                signal.emit('celebrate', { icon: g.rare.icon, title: g.rare.isNew ? 'New rare find!' : 'Rare find!', text: `${g.rare.name}, worth ${g.rare.value} coins.${g.rare.isNew ? ' Added to your 📖 collection book.' : ''}` })
            }
        } catch (e: any) {
            toast.info(e.message, { autoClose: 2000 })
        }
    }, [])

    const activate = useCallback((target: Near) => {
        if (!target) return
        if (target.kind === 'shop') { setOpenShop(target.id); setSide(null) }
        else if (target.kind === 'build') { setSide('build'); setOpenShop(null) }
        else gather(target.id)
    }, [gather])

    useEffect(() => {
        const onNear = (n: Near) => setNear(n)
        const onOpen = (t: { kind: 'shop' | 'gather' | 'build'; id: string }) => {
            if (t.kind === 'shop') { setOpenShop(t.id); setSide(null) }
            else if (t.kind === 'build') { setSide('build'); setOpenShop(null) }
            else gather(t.id)
        }
        const onBuilt = (b: BuiltLandmark) => {
            signal.emit('celebrate', { icon: b.icon, title: `The ${b.name} is built!`, text: `${b.reward} Look for it in your Market Square.`, big: true })
        }
        const onEvent = (e: VillageEvent) => {
            if (!BIG_NEWS.includes(e.kind)) return
            setTicker(e)
            if (e.kind === 'bankrupt' || e.kind === 'pact') toast.warn(e.text, { autoClose: 6000 })
        }
        signal.on('villageProximity', onNear)
        signal.on('villageOpen', onOpen)
        signal.on('villageEvent', onEvent)
        signal.on('villageBuilt', onBuilt)
        return () => {
            signal.off('villageBuilt', onBuilt)
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
            const toggle = (s: Side) => { setOpenShop(null); setSide(cur => (cur === s ? null : s)) }
            if (e.key === 'r' || e.key === 'R') toggle('requests')
            if (e.key === 'b' || e.key === 'B') toggle('bag')
            if (e.key === 't' || e.key === 'T') toggle('build')
            if (e.key === 'Escape') { setOpenShop(null); setBoard(false); setSide(null) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [near, activate])

    // close a shop panel when walking away from it
    useEffect(() => {
        if (openShop && near?.kind === 'shop' && near.id !== openShop) setOpenShop(near.id)
    }, [near, openShop])

    if (!joined || !state || !wallet) return null
    const goods = Object.entries(wallet.balances).filter(([g, n]) => g !== 'coin' && n > 0 && g in (villageGoods ?? {}))
    const ready = state.jobs.filter(j => (wallet.balances[j.good] ?? 0) >= j.qty).length
    const open = (s: Side) => { setOpenShop(null); setSide(cur => (cur === s ? null : s)) }
    const proj = state.project?.current
    const projPct = proj ? Math.floor((Object.entries(proj.needs).reduce((a, [k, n]) => a + Math.min(n, proj.given[k] ?? 0), 0) / Object.values(proj.needs).reduce((a, b) => a + b, 0)) * 100) : 100

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
                    <button className={`${btnGhost} relative`} onClick={() => open('requests')}>
                        📜 Requests <kbd className='text-[10px] opacity-60'>R</kbd>
                        {state.jobs.length > 0 && <span className={`absolute -top-1.5 -right-1.5 rounded-full text-[10px] px-1.5 font-bold ${ready ? 'bg-[#7fb069] text-[#1f1913] animate-pulse' : 'bg-[#c9a227] text-[#1f1913]'}`}>{ready || state.jobs.length}</span>}
                    </button>
                    <button className={btnGhost} onClick={() => open('bag')}>🎒 Bag <kbd className='text-[10px] opacity-60'>B</kbd></button>
                    <button className={btnGhost} onClick={() => open('build')} title={proj ? `${proj.name}: ${projPct}% built` : 'All built'}>🏗️ {proj ? `${projPct}%` : 'Built'} <kbd className='text-[10px] opacity-60'>T</kbd></button>
                </div>
                <div className='flex gap-1.5 flex-wrap'>
                    <button className={btnGhost} onClick={() => signal.emit('villageWalk')}>🚶 Market</button>
                    <button className={btnGhost} onClick={() => setBoard(true)}>📈 Board <kbd className='text-[10px] opacity-60'>M</kbd></button>
                    <button className={btnGhost} disabled={fastForward} onClick={fastForwardWeek}>⏩ 1 week</button>
                    <button className={btnGhost} onClick={() => signal.emit('openMarkets')}>🎯 Predictions</button>
                    <button className={btnGhost} onClick={() => signal.emit('openPool')}>🏦 Team pool</button>
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
                    {near.kind === 'shop' ? `Talk to ${near.label}` : near.kind === 'build' ? '🏗️ Help build' : `${near.icon} Gather at the ${near.label.toLowerCase()}`}
                </button>
            )}

            {openShop && <ShopPanel shopId={openShop} onClose={() => setOpenShop(null)} />}
            {!openShop && side === 'requests' && <RequestsPanel onClose={() => setSide(null)} />}
            {!openShop && side === 'bag' && <BagPanel onClose={() => setSide(null)} />}
            {!openShop && side === 'build' && <ProjectPanel onClose={() => setSide(null)} />}
            <Celebrate />
            <HowToPlay />
            {board && <MarketBoard onClose={() => setBoard(false)} />}
        </>
    )
}

