'use client'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call } from '@/utils/village/client'
import { VILLAGE_NPCS } from '@/utils/village/data'
import { LAYOUT } from '@/utils/village/layout'
import { useVillage } from './useVillage'
import { btnGhost, panel } from './ui'

const spotLabel = (id: string) => {
    const s = LAYOUT.find(x => x.id === id)
    return s ? `${s.icon} ${s.label.toLowerCase()}` : id
}
const shopName = (id: string) => VILLAGE_NPCS.find(n => n.id === id)?.name ?? id

/** Your bag: the collection book of rare finds, your tools and your hats. */
export default function BagPanel({ onClose }: { onClose: () => void }) {
    const { wallet, catalog } = useVillage()
    const [busy, setBusy] = useState(false)
    if (!wallet) return null
    const bal = (id: string) => wallet.balances[id] ?? 0
    const found = new Set(wallet.found)
    const luck = Math.min(40, 6 + wallet.sinceRare * 2)

    async function wear(hat: string | null) {
        setBusy(true)
        try {
            await call('village:wearHat', { hat })
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={`${panel} absolute right-2 top-2 bottom-16 w-[min(420px,calc(100vw-1rem))] z-40 flex flex-col overflow-hidden`}>
            <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                <div className='flex-1'>
                    <p className='font-bold text-lg leading-tight'>🎒 Your bag</p>
                    <p className='text-xs text-[#cdb88f]'>Everything here is a real item in your NEAR wallet.</p>
                </div>
                <button onClick={onClose} className='p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
            </div>
            <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-4 text-sm'>
                <section>
                    <div className='flex items-baseline justify-between'>
                        <h3 className='font-bold'>📖 Collection book <span className='font-normal text-[#cdb88f]'>{found.size}/{catalog.rares.length}</span></h3>
                        <span className='text-xs text-[#cdb88f]' title='Every gather that finds nothing makes the next one luckier'>🍀 next find: {luck}%</span>
                    </div>
                    <p className='text-xs text-[#cdb88f] mb-2'>Gathering sometimes turns up something rare. Find all {catalog.rares.length} to earn the 👑 Collector&apos;s crown.</p>
                    <div className='grid grid-cols-4 gap-2'>
                        {catalog.rares.map(r => {
                            const has = found.has(r.id)
                            return (
                                <div key={r.id} title={has ? `${r.name}: sell to ${shopName(r.buyer)} for ${r.value} coins` : `Found at the ${spotLabel(r.spot)}`}
                                    className={`rounded-lg border p-1.5 text-center ${has ? 'border-[#e0b93a] bg-[#3a2f1c]' : 'border-dashed border-[#5a4a36] bg-[#2a2119]'}`}>
                                    <div className={`text-2xl ${has ? '' : 'opacity-25 grayscale'}`}>{has ? r.icon : '❔'}</div>
                                    <div className='text-[10px] leading-tight'>{has ? r.name : spotLabel(r.spot)}</div>
                                    {r.tier === 2 && <div className='text-[9px] text-[#e0b93a]'>very rare</div>}
                                    {bal(r.id) > 0 && <div className='text-[10px] text-[#cdb88f]'>×{bal(r.id)} · {r.value}🪙</div>}
                                </div>
                            )
                        })}
                    </div>
                    <p className='text-[11px] text-[#cdb88f] mt-1'>Sell spare finds to the shopkeeper who collects them (open their shop).</p>
                </section>

                <section>
                    <h3 className='font-bold mb-1'>🛠️ Tools <span className='font-normal text-xs text-[#cdb88f]'>double what you gather · sold by Tor</span></h3>
                    {catalog.tools.map(t => {
                        const n = bal(t.id)
                        const left = wallet.wear[t.id] ?? t.uses
                        return (
                            <div key={t.id} className='flex items-center gap-2 py-1'>
                                <span className={`w-36 ${n ? '' : 'opacity-50'}`}>{t.icon} {t.name}</span>
                                {n > 0 ? (
                                    <>
                                        <div className='flex-1 h-1.5 rounded bg-[#1f1913] overflow-hidden' title={`${left} of ${t.uses} uses left`}>
                                            <div className='h-full bg-[#7fb069]' style={{ width: `${(left / t.uses) * 100}%` }} />
                                        </div>
                                        <span className='text-xs tabular-nums w-16 text-right'>{left} uses{n > 1 ? ` +${n - 1}` : ''}</span>
                                    </>
                                ) : <span className='text-xs text-[#cdb88f]'>for the {spotLabel(t.spot)} · {t.price} 🪙</span>}
                            </div>
                        )
                    })}
                </section>

                <section>
                    <h3 className='font-bold mb-1'>🎩 Hats <span className='font-normal text-xs text-[#cdb88f]'>your teammates see them in the office · sold by Ivo</span></h3>
                    <div className='grid grid-cols-5 gap-2'>
                        {catalog.hats.map(h => {
                            const owned = bal(h.id) > 0
                            const on = wallet.hat === h.id
                            return (
                                <button key={h.id} disabled={busy || !owned} onClick={() => wear(on ? null : h.id)}
                                    title={owned ? (on ? 'Take it off' : 'Wear it') : h.price ? `Buy at Ivo's for ${h.price} coins` : 'Complete the collection book'}
                                    className={`rounded-lg border p-1.5 text-center disabled:cursor-not-allowed ${on ? 'border-[#e0b93a] bg-[#4a3a1c]' : owned ? 'border-[#5a4a36] hover:border-[#e0b93a]' : 'border-dashed border-[#5a4a36] opacity-40'}`}>
                                    <div className='text-2xl'>{h.icon}</div>
                                    <div className='text-[10px] leading-tight'>{on ? 'wearing' : owned ? 'wear' : h.price ? `${h.price}🪙` : '📖'}</div>
                                </button>
                            )
                        })}
                    </div>
                    {wallet.hat && <button className={`${btnGhost} mt-2 text-xs`} disabled={busy} onClick={() => wear(null)}>Take hat off</button>}
                </section>
            </div>
        </div>
    )
}

