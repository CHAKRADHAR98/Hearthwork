'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call } from '@/utils/village/client'
import { btnGhost, btnGold, input, nearAccountUrl, panel } from '../village/ui'

type Market = {
    market_id: string; name: string; description: string; creator: string; deadline_sec: number; status: string
    outcome: 'Yes' | 'No' | null; yes_shares: number; no_shares: number
    prices: { yes: number; no: number } | null
    position: { yes_shares: number; no_shares: number } | null
}
type Listing = { markets: Market[]; account: string; bettorBalance: string; walletBalance: string; shareValue: string; feeBps: number; contract: string }

const txUrl = (h: string) => `https://testnet.nearblocks.io/txns/${h}`

function timeLeft(deadline: number) {
    const s = deadline - Date.now() / 1000
    if (s <= 0) return 'closed'
    if (s < 3600) return `${Math.ceil(s / 60)} min left`
    if (s < 86400) return `${Math.round(s / 3600)} h left`
    return `${Math.round(s / 86400)} days left`
}

function MarketCard({ m, me, shareValue, busy, act }: { m: Market; me: string; shareValue: string; busy: boolean; act: (ev: string, data: any, ok: (r: any) => string) => void }) {
    const [shares, setShares] = useState(5)
    const [quote, setQuote] = useState<{ yes?: string; no?: string }>({})
    const resolved = m.status === 'Resolved' || !!m.outcome
    const closed = m.deadline_sec <= Date.now() / 1000
    const yes = m.prices?.yes ?? 0.5
    const mine = m.position
    const isCreator = m.creator === me

    useEffect(() => {
        if (resolved || closed) return
        let live = true
        const t = setTimeout(async () => {
            try {
                const [y, n] = await Promise.all([
                    call('markets:quote', { marketId: m.market_id, isYes: true, shares }),
                    call('markets:quote', { marketId: m.market_id, isYes: false, shares }),
                ])
                if (live) setQuote({ yes: y.total, no: n.total })
            } catch { /* ignore */ }
        }, 250)
        return () => { live = false; clearTimeout(t) }
    }, [shares, m.market_id, m.yes_shares, m.no_shares, resolved, closed])

    return (
        <div className='rounded-lg border border-[#5a4a36] bg-[#2a2119] p-3 flex flex-col gap-2'>
            <div className='flex items-start gap-2'>
                <div className='flex-1'>
                    <p className='font-bold'>{m.name}</p>
                    <p className='text-xs text-[#cdb88f]'>{m.description} · {resolved ? `resolved ${m.outcome?.toUpperCase()}` : timeLeft(m.deadline_sec)}</p>
                </div>
                <div className='text-right tabular-nums'>
                    <p className='text-lg font-bold'>{Math.round(yes * 100)}%</p>
                    <p className='text-[10px] text-[#cdb88f]'>chance YES</p>
                </div>
            </div>
            {/* probability bar: YES share of the bar, labelled */}
            <div className='flex h-2 rounded-full overflow-hidden bg-[#3a2f24]' aria-hidden>
                <div className='bg-[#7fb069]' style={{ width: `${yes * 100}%` }} />
                <div className='bg-[#c96f5b] flex-1' />
            </div>
            <div className='flex justify-between text-[11px] text-[#cdb88f]'><span>YES {Math.round(yes * 100)}%</span><span>NO {Math.round((1 - yes) * 100)}%</span></div>
            {mine && (mine.yes_shares > 0 || mine.no_shares > 0) && (
                <p className='text-xs'>You hold <b>{mine.yes_shares} YES</b> / <b>{mine.no_shares} NO</b> · a winning share pays {shareValue} NEAR</p>
            )}
            {!resolved && !closed && (
                <div className='flex flex-wrap items-center gap-2'>
                    <input type='number' min={1} max={1000} className={`${input} w-20`} value={shares} onChange={e => setShares(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} onKeyDown={e => e.stopPropagation()} />
                    <span className='text-xs'>shares</span>
                    <button className={`${btn('yes')}`} disabled={busy} onClick={() => act('markets:buy', { marketId: m.market_id, isYes: true, shares }, r => `Bought ${shares} YES for ${r.cost} NEAR`)}>Buy YES {quote.yes ? `· ${quote.yes} Ⓝ` : ''}</button>
                    <button className={`${btn('no')}`} disabled={busy} onClick={() => act('markets:buy', { marketId: m.market_id, isYes: false, shares }, r => `Bought ${shares} NO for ${r.cost} NEAR`)}>Buy NO {quote.no ? `· ${quote.no} Ⓝ` : ''}</button>
                    {mine && mine.yes_shares > 0 && <button className={btnGhost} disabled={busy} onClick={() => act('markets:sell', { marketId: m.market_id, isYes: true, shares: Math.min(shares, mine.yes_shares) }, r => `Sold YES for ${r.proceeds} NEAR`)}>Sell YES</button>}
                    {mine && mine.no_shares > 0 && <button className={btnGhost} disabled={busy} onClick={() => act('markets:sell', { marketId: m.market_id, isYes: false, shares: Math.min(shares, mine.no_shares) }, r => `Sold NO for ${r.proceeds} NEAR`)}>Sell NO</button>}
                </div>
            )}
            {!resolved && closed && isCreator && (
                <div className='flex items-center gap-2 text-sm'>
                    <span>You asked this. What happened?</span>
                    <button className={btn('yes')} disabled={busy} onClick={() => act('markets:resolve', { marketId: m.market_id, outcome: 'Yes' }, () => 'Resolved YES')}>It happened</button>
                    <button className={btn('no')} disabled={busy} onClick={() => act('markets:resolve', { marketId: m.market_id, outcome: 'No' }, () => 'Resolved NO')}>It didn&apos;t</button>
                </div>
            )}
            {!resolved && closed && !isCreator && <p className='text-xs text-[#cdb88f]'>Waiting for {m.creator.split('.')[0]} to resolve it.</p>}
            {resolved && mine && ((m.outcome === 'Yes' && mine.yes_shares > 0) || (m.outcome === 'No' && mine.no_shares > 0)) && (
                <button className={btnGold} disabled={busy} onClick={() => act('markets:claim', { marketId: m.market_id }, r => `Claimed ${r.amount} NEAR`)}>Claim winnings</button>
            )}
        </div>
    )
}

const btn = (k: 'yes' | 'no') => `px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 ${k === 'yes' ? 'bg-[#7fb069] text-[#14210f] hover:bg-[#93c47d]' : 'bg-[#c96f5b] text-[#2a110b] hover:bg-[#d98370]'}`

export default function MarketsPanel({ onClose }: { onClose: () => void }) {
    const [data, setData] = useState<Listing | null>(null)
    const [busy, setBusy] = useState(false)
    const [q, setQ] = useState('')
    const [hours, setHours] = useState(24)

    const load = useCallback(async () => {
        try { setData(await call('markets:list')) } catch (e: any) { toast.error(e.message) }
    }, [])
    useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

    const act = async (ev: string, d: any, ok: (r: any) => string) => {
        setBusy(true)
        try {
            const r = await call(ev, d)
            toast.success(<span>{ok(r)} {r.tx && <a className='underline' href={txUrl(r.tx)} target='_blank' rel='noreferrer'>tx ↗</a>}</span>)
            await load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return (
        <div className='absolute inset-0 z-50 grid place-items-center bg-black/50 p-2' onClick={onClose}>
            <div className={`${panel} w-[min(720px,100%)] max-h-[90vh] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
                <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                    <h2 className='font-bold text-lg'>🎯 Office predictions</h2>
                    <span className='text-xs text-[#cdb88f] hidden sm:inline'>on NEAR · {data?.contract}</span>
                    <button onClick={onClose} className='ml-auto p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
                </div>
                <div className='overflow-y-auto p-3 flex flex-col gap-3 text-sm'>
                    {data && (
                        <p className='text-xs text-[#cdb88f]'>
                            Wallet <a className='underline' href={nearAccountUrl(data.account)} target='_blank' rel='noreferrer'>{data.account}</a>: <b className='text-[#f6ead2]'>{data.walletBalance} NEAR</b> · betting balance {data.bettorBalance} NEAR
                            {Number(data.bettorBalance) > 0 && <button className='ml-2 underline' disabled={busy} onClick={() => act('markets:withdraw', {}, () => 'Moved your betting balance back to your wallet')}>withdraw</button>}
                            <br />You never pay gas: your wallet signs and Hearthwork relays the transaction (NEAR meta transactions).
                        </p>
                    )}
                    <form className='flex flex-wrap gap-2 items-center rounded-lg border border-[#5a4a36] p-2' onSubmit={e => { e.preventDefault(); if (q.trim().length >= 3) act('markets:create', { question: q.trim(), hours }, () => 'Market opened').then(() => setQ('')) }}>
                        <input className={`${input} flex-1 min-w-[200px]`} maxLength={50} placeholder='Ask the office: “Will we ship v2 by Friday?”' value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} />
                        <select className={input} value={hours} onChange={e => setHours(Number(e.target.value))}>
                            <option value={0.1}>closes in 6 min</option>
                            <option value={1}>in 1 hour</option>
                            <option value={24}>in 1 day</option>
                            <option value={168}>in 1 week</option>
                        </select>
                        <button className={btnGold} disabled={busy || q.trim().length < 3}>Open market</button>
                    </form>
                    {!data && <p>Loading markets from NEAR…</p>}
                    {data && data.markets.length === 0 && <p className='text-[#cdb88f]'>No predictions yet in this office. Ask the first question!</p>}
                    {data?.markets.map(m => <MarketCard key={m.market_id} m={m} me={data.account} shareValue={data.shareValue} busy={busy} act={act} />)}
                </div>
            </div>
        </div>
    )
}
