'use client'
import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { VILLAGE_NPCS } from '@/utils/village/data'
import { fmtHour } from '@/utils/village/client'
import { useVillage } from './useVillage'
import { icon, moodFace, nearAccountUrl, panel } from './ui'

const W = 220
const H = 64
const PAD = 4

/** One good's price over the last week: a single 2px line, crosshair + readout on hover. */
function PriceChart({ good, points }: { good: string; points: { t: number; price: number }[] }) {
    const [hover, setHover] = useState<number | null>(null)
    if (points.length < 2) return null
    const prices = points.map(p => p.price)
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const span = Math.max(1, hi - lo)
    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = (p: number) => H - PAD - ((p - lo) / span) * (H - PAD * 2)
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')
    const first = prices[0]
    const last = prices[prices.length - 1]
    const change = Math.round(((last - first) / first) * 100)
    const h = hover !== null ? points[hover] : null
    return (
        <div className='rounded-lg bg-[#2a2119] border border-[#5a4a36] p-2'>
            <div className='flex items-baseline justify-between text-sm'>
                <span>{icon(good)} <span className='capitalize'>{good}</span></span>
                <span className='tabular-nums'>
                    <b>{h ? h.price : last} 🪙</b>{' '}
                    <span className='text-xs text-[#cdb88f]'>{h ? `day ${Math.floor(h.t / 24) + 1} ${fmtHour(h.t % 24)}` : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% this week`}</span>
                </span>
            </div>
            <svg
                viewBox={`0 0 ${W} ${H}`} className='w-full h-16 touch-none' role='img'
                aria-label={`${good} price, from ${first} to ${last} coins`}
                onPointerMove={e => {
                    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))
                    setHover(Math.max(0, Math.min(points.length - 1, i)))
                }}
                onPointerLeave={() => setHover(null)}
            >
                <line x1={PAD} x2={W - PAD} y1={y(lo)} y2={y(lo)} stroke='#5a4a36' strokeWidth={1} />
                <path d={d} fill='none' stroke='#e0b93a' strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
                {h && hover !== null && (
                    <>
                        <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke='#cdb88f' strokeWidth={1} strokeDasharray='2 2' />
                        <circle cx={x(hover)} cy={y(h.price)} r={4} fill='#e0b93a' stroke='#1f1913' strokeWidth={2} />
                    </>
                )}
            </svg>
            <div className='flex justify-between text-[10px] text-[#cdb88f] tabular-nums'><span>low {lo}</span><span>high {hi}</span></div>
        </div>
    )
}

export default function MarketBoard({ onClose }: { onClose: () => void }) {
    const { state, events, chain, wallet } = useVillage()
    const [tab, setTab] = useState<'prices' | 'news' | 'chain'>('prices')
    if (!state) return null
    return (
        <div className='absolute inset-0 z-50 grid place-items-center bg-black/50 p-2' onClick={onClose}>
            <div className={`${panel} w-[min(880px,100%)] max-h-[90vh] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
                <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                    <h2 className='font-bold text-lg'>📈 Market board</h2>
                    <span className='text-sm text-[#cdb88f]'>Day {state.day}, {fmtHour(state.hour)}</span>
                    <div className='ml-auto flex gap-1 text-sm'>
                        {(['prices', 'news', 'chain'] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-lg ${tab === t ? 'bg-[#c9a227] text-[#1f1913]' : 'bg-[#3a2f24]'}`}>
                                {t === 'prices' ? 'Prices & shops' : t === 'news' ? 'Village news' : 'On NEAR'}
                            </button>
                        ))}
                    </div>
                    <button onClick={onClose} className='p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
                </div>
                <div className='overflow-y-auto p-3 text-sm'>
                    {tab === 'prices' && (
                        <div className='flex flex-col gap-4'>
                            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'>
                                {Object.entries(state.prices).map(([g, pts]) => <PriceChart key={g} good={g} points={pts} />)}
                            </div>
                            <table className='w-full text-left'>
                                <thead className='text-xs text-[#cdb88f]'>
                                    <tr><th className='py-1'>Shop</th><th>Status</th><th className='text-right'>Cash</th><th>Mood</th><th>Stock</th><th>Wallet</th></tr>
                                </thead>
                                <tbody>
                                    {state.shops.map(s => (
                                        <tr key={s.id} className='border-t border-[#3a2f24]'>
                                            <td className='py-1'>{VILLAGE_NPCS.find(n => n.id === s.id)?.icon} {s.name} <span className='text-xs text-[#cdb88f]'>{s.title}</span></td>
                                            <td>{s.open ? '🟢 open' : '🔴 bankrupt'}</td>
                                            <td className='text-right tabular-nums'>{s.coins} 🪙</td>
                                            <td>{moodFace(s.mood)}</td>
                                            <td className='text-xs'>{Object.entries(s.stock).filter(([, n]) => n > 0).map(([g, n]) => `${icon(g)}${n}`).join(' ')}</td>
                                            <td><a className='underline text-xs' href={nearAccountUrl(s.account)} target='_blank' rel='noreferrer'>{s.account.split('.')[0]}</a></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {state.pacts.length > 0 && (
                                <div className='rounded-lg border border-red-400/60 bg-red-900/30 p-2'>
                                    <b>🤫 Active price pacts</b>
                                    {state.pacts.map((p, i) => <p key={i}>{p.members.map(m => VILLAGE_NPCS.find(n => n.id === m)?.name).join(' & ')} are lowballing {p.againstName} on {icon(p.good)} {p.good}</p>)}
                                </div>
                            )}
                            {state.jobs.length > 0 && (
                                <div><b>📜 Jobs on offer</b>{state.jobs.map(j => <p key={j.id}>{VILLAGE_NPCS.find(n => n.id === j.shopId)?.name}: deliver {j.qty} {icon(j.good)} for {j.reward} 🪙</p>)}</div>
                            )}
                        </div>
                    )}
                    {tab === 'news' && (
                        <ul className='flex flex-col gap-1'>
                            {[...events].reverse().map(e => (
                                <li key={e.id} className='flex gap-2'><span className='text-xs text-[#cdb88f] w-20 shrink-0 tabular-nums'>D{Math.floor(e.t / 24) + 1} {fmtHour(e.t % 24)}</span><span>{e.text}</span></li>
                            ))}
                        </ul>
                    )}
                    {tab === 'chain' && (
                        <div className='flex flex-col gap-3'>
                            <p className='text-[#cdb88f]'>
                                Every good and coin is a NEP-245 token in <a className='underline' target='_blank' rel='noreferrer' href={nearAccountUrl(chain.items)}>{chain.items}</a>.
                                Shopkeepers and players each own a NEAR testnet account. Trades with shopkeepers are atomic on-chain swaps; the rest of the village&apos;s activity is settled every few seconds.
                            </p>
                            {wallet && <p>Your wallet: <a className='underline' target='_blank' rel='noreferrer' href={nearAccountUrl(wallet.accountId)}>{wallet.accountId}</a></p>}
                            {!chain.enabled && <p className='text-red-300'>The server is running off-chain (no NEAR key configured).</p>}
                            <ul className='flex flex-col gap-1'>
                                {chain.recent.map((t, i) => (
                                    <li key={t.hash || i} className='flex gap-2 items-start'>
                                        <span>{t.ok ? '✅' : '❌'}</span>
                                        <span className='font-mono text-xs bg-[#2c241b] px-1 rounded'>{t.method}</span>
                                        <span className='flex-1'>{t.summary}</span>
                                        {t.url && <a className='underline text-xs shrink-0' href={t.url} target='_blank' rel='noreferrer'>tx ↗</a>}
                                    </li>
                                ))}
                                {chain.recent.length === 0 && <li className='text-[#cdb88f]'>No transactions yet. Trade with a shopkeeper!</li>}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
