'use client'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call, Job } from '@/utils/village/client'
import { VILLAGE_NPCS } from '@/utils/village/data'
import { LAYOUT } from '@/utils/village/layout'
import signal from '@/utils/signal'
import { useVillage } from './useVillage'
import { btnGold, icon, panel } from './ui'

const SIZE_STYLE: Record<string, { label: string; cls: string }> = {
    urgent: { label: '⏰ Urgent · double pay', cls: 'bg-red-800/70 text-red-100' },
    big: { label: '📦 Big order', cls: 'bg-[#4a3d2f] text-[#f6ead2]' },
    small: { label: '📜 Request', cls: 'bg-[#3a2f24] text-[#cdb88f]' },
}
const ORDER = { urgent: 0, big: 1, small: 2 } as Record<string, number>

/** Where to get a good: a gathering spot for raw goods, a shop for crafted ones. */
function whereToGet(good: string, sellers: string[]) {
    const spot = LAYOUT.find(s => s.kind === 'gather' && ({ dock: 'fish', field: 'wheat', mine: 'iron', pasture: 'wool' } as Record<string, string>)[s.id] === good)
    if (spot) return `gather at the ${spot.icon} ${spot.label.toLowerCase()}`
    if (sellers.length) return `buy from ${sellers.join(' or ')}`
    return ''
}

export default function RequestsPanel({ onClose }: { onClose: () => void }) {
    const { state, wallet, goods } = useVillage()
    const [busy, setBusy] = useState<string | null>(null)
    if (!state || !wallet) return null
    const jobs = [...state.jobs].sort((a, b) => (ORDER[a.size ?? 'small'] - ORDER[b.size ?? 'small']) || a.expiresAt - b.expiresAt)

    async function deliver(j: Job) {
        setBusy(j.id)
        try {
            await call('village:deliverJob', { jobId: j.id })
            toast.success(`✅ Request done! +${j.reward} 🪙`)
            signal.emit('villageFloat', { text: `+${j.reward} coins`, color: 0xe0b93a })
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className={`${panel} absolute right-2 top-2 bottom-16 w-[min(420px,calc(100vw-1rem))] z-40 flex flex-col overflow-hidden`}>
            <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                <div className='flex-1'>
                    <p className='font-bold text-lg leading-tight'>📜 Requests board</p>
                    <p className='text-xs text-[#cdb88f]'>Shopkeepers pay extra for these. Deliver from anywhere in the square.</p>
                </div>
                <button onClick={onClose} className='p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
            </div>
            <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-2 text-sm'>
                {jobs.length === 0 && <p className='text-[#cdb88f]'>No requests right now. New ones are posted every few hours, so check back soon!</p>}
                {jobs.map(j => {
                    const npc = VILLAGE_NPCS.find(n => n.id === j.shopId)
                    const have = wallet.balances[j.good] ?? 0
                    const left = Math.max(0, j.expiresAt - state.t)
                    const total = Math.max(1, j.expiresAt - (j.postedAt ?? j.expiresAt - 48))
                    const style = SIZE_STYLE[j.size ?? 'small']
                    const sellers = state.shops.filter(s => s.sells.some(q => q.good === j.good)).map(s => s.name)
                    const ready = have >= j.qty
                    return (
                        <div key={j.id} className={`rounded-lg border p-2.5 flex flex-col gap-1.5 ${ready ? 'border-[#e0b93a] bg-[#3a2f1c]' : 'border-[#5a4a36] bg-[#2a2119]'}`}>
                            <div className='flex items-center gap-2'>
                                <span className={`text-[11px] rounded px-1.5 py-0.5 ${style.cls}`}>{style.label}</span>
                                <span className='ml-auto font-bold tabular-nums text-[#e0b93a]'>{j.reward} 🪙</span>
                            </div>
                            <p><b>{npc?.icon} {npc?.name}</b> needs <b>{j.qty} {icon(j.good)} {goods[j.good]?.name ?? j.good}</b> <span className='text-[#cdb88f]'>{j.note}</span></p>
                            <div className='h-1.5 rounded bg-[#1f1913] overflow-hidden' title={`${left} game hours left`}>
                                <div className={`h-full ${left / total < 0.3 ? 'bg-red-500' : 'bg-[#c9a227]'}`} style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='text-xs text-[#cdb88f] flex-1'>
                                    ⏳ {left >= 24 ? `${Math.floor(left / 24)}d ${left % 24}h` : `${left}h`} left · you have {have}/{j.qty}
                                    {!ready && <> · {whereToGet(j.good, sellers)}</>}
                                </span>
                                <button className={btnGold} disabled={!!busy || !ready} onClick={() => deliver(j)}>Deliver</button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
