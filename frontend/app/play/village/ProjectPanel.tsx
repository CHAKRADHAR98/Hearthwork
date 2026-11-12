'use client'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call, itemInfo } from '@/utils/village/client'
import signal from '@/utils/signal'
import { useVillage } from './useVillage'
import { btnGhost, btnGold, panel } from './ui'

/** The office's team project: everyone donates goods and coins to build a landmark on this office's map. */
export default function ProjectPanel({ onClose }: { onClose: () => void }) {
    const { state, wallet, catalog } = useVillage()
    const [busy, setBusy] = useState(false)
    if (!state || !wallet) return null
    const { current, built, total } = state.project
    const bal = (id: string) => wallet.balances[id] ?? 0

    async function give(token: string, qty: number) {
        if (qty < 1) return
        setBusy(true)
        try {
            const r: any = await call('village:donate', { token, qty })
            const info = itemInfo(token)
            signal.emit('villageFloat', { text: `-${r.amount} ${info.icon} for the team`, color: 0xe0b93a })
            if (!r.completed) toast.success(`Thanks! You gave ${r.amount} ${info.icon} to the build.`)
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }

    const need = current ? Object.values(current.needs).reduce((a, b) => a + b, 0) : 1
    const got = current ? Object.entries(current.needs).reduce((a, [k, n]) => a + Math.min(n, current.given[k] ?? 0), 0) : 0
    const pct = Math.floor((got / need) * 100)

    return (
        <div className={`${panel} absolute right-2 top-2 bottom-16 w-[min(420px,calc(100vw-1rem))] z-40 flex flex-col overflow-hidden`}>
            <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                <div className='flex-1'>
                    <p className='font-bold text-lg leading-tight'>🏗️ Team build</p>
                    <p className='text-xs text-[#cdb88f]'>The whole office builds together. Finished builds appear on <b>your office&apos;s</b> map.</p>
                </div>
                <button onClick={onClose} className='p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
            </div>
            <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-4 text-sm'>
                {current ? (
                    <section className='rounded-lg border border-[#b08a3e] bg-[#2a2119] p-3 flex flex-col gap-2'>
                        <div className='flex items-center gap-3'>
                            <span className='text-4xl'>{current.icon}</span>
                            <div className='flex-1'>
                                <p className='font-bold text-base'>{current.name} <span className='text-xs font-normal text-[#cdb88f]'>project {built.length + 1} of {total}</span></p>
                                <p className='text-xs text-[#cdb88f]'>🎁 {current.reward}</p>
                            </div>
                        </div>
                        <div className='h-3 rounded-full bg-[#1f1913] overflow-hidden border border-[#5a4a36]'>
                            <div className='h-full bg-gradient-to-r from-[#c9a227] to-[#f0d27a] transition-all duration-700' style={{ width: `${pct}%` }} />
                        </div>
                        <p className='text-xs text-right tabular-nums'>{pct}% built</p>
                        {Object.entries(current.needs).map(([token, n]) => {
                            const given = Math.min(n, current.given[token] ?? 0)
                            const left = n - given
                            const mine = bal(token)
                            const info = itemInfo(token)
                            const can = Math.min(left, mine)
                            const step = token === 'coin' ? 10 : 1
                            return (
                                <div key={token} className='flex items-center gap-2'>
                                    <span className='w-24'>{info.icon} {info.name}</span>
                                    <div className='flex-1 h-1.5 rounded bg-[#1f1913] overflow-hidden'>
                                        <div className={`h-full ${left ? 'bg-[#c9a227]' : 'bg-[#7fb069]'}`} style={{ width: `${(given / n) * 100}%` }} />
                                    </div>
                                    <span className='w-14 text-xs tabular-nums text-right'>{given}/{n}</span>
                                    {left > 0 ? (
                                        <>
                                            <button className={btnGhost} disabled={busy || mine < 1} onClick={() => give(token, Math.min(step, can))} title={`You have ${mine}`}>+{Math.min(step, Math.max(1, can))}</button>
                                            <button className={btnGold} disabled={busy || can < 1} onClick={() => give(token, can)} title={`You have ${mine}`}>All {can > 0 ? can : ''}</button>
                                        </>
                                    ) : <span className='text-xs text-[#7fb069] w-[88px] text-center'>✓ done</span>}
                                </div>
                            )
                        })}
                        {current.helpers.length > 0 && (
                            <div className='text-xs text-[#cdb88f] border-t border-[#5a4a36] pt-2'>
                                <b className='text-[#f6ead2]'>Top helpers:</b> {current.helpers.map((h, i) => `${['🥇', '🥈', '🥉', '·', '·'][i]} ${h.name} (${h.points})`).join('  ')}
                            </div>
                        )}
                    </section>
                ) : (
                    <p className='rounded-lg border border-[#b08a3e] p-3'>🎉 Your office has built every landmark. What a village!</p>
                )}

                <section>
                    <h3 className='font-bold mb-1'>🏆 Built by your office</h3>
                    {built.length === 0 && <p className='text-xs text-[#cdb88f]'>Nothing yet. Your first landmark will appear at the 🏗️ building site in the Market Square.</p>}
                    {built.map(b => (
                        <div key={b.id} className='flex items-start gap-2 py-1'>
                            <span className='text-2xl'>{b.icon}</span>
                            <div>
                                <p><b>{b.name}</b> <span className='text-xs text-[#cdb88f]'>built on day {b.day}</span></p>
                                <p className='text-xs text-[#cdb88f]'>{b.reward}</p>
                                {b.helpers.length > 0 && <p className='text-xs text-[#cdb88f]'>Built by {b.helpers.join(', ')}</p>}
                            </div>
                        </div>
                    ))}
                    <p className='text-[11px] text-[#cdb88f] mt-2'>The office owner can move built landmarks anywhere in the map editor (🏆 landmarks palette). Other offices can&apos;t use them.</p>
                </section>
                {catalog.projects.length > built.length + 1 && (
                    <section className='text-xs text-[#cdb88f]'>
                        <b className='text-[#f6ead2]'>Coming next:</b> {catalog.projects.slice(built.length + 1).map(p => `${p.icon} ${p.name}`).join(' → ')}
                    </section>
                )}
            </div>
        </div>
    )
}
