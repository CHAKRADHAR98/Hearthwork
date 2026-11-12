// Small shared pieces for the village UI.
import React, { useState } from 'react'
import { GOOD_ICONS } from '@/utils/village/data'

export const panel = 'bg-[#1f1913]/95 border-2 border-[#b08a3e] rounded-xl text-[#f6ead2] shadow-[0_8px_40px_rgba(0,0,0,0.55)]'
export const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
export const btnGold = `${btn} bg-[#c9a227] text-[#1f1913] hover:bg-[#e0b93a]`
export const btnGhost = `${btn} bg-[#3a2f24] text-[#f6ead2] hover:bg-[#4a3d2f]`
export const input = 'bg-[#2c241b] border border-[#5a4a36] rounded-lg px-2 py-1 text-sm text-[#f6ead2] outline-none focus:border-[#c9a227]'

export const icon = (g: string) => GOOD_ICONS[g] ?? '📦'

/** Hover/tap tooltip explaining why a price is what it is (reasons come from pricing.ts on the server). */
export function Why({ reasons, label = 'why?' }: { reasons: string[]; label?: string }) {
    const [open, setOpen] = useState(false)
    return (
        <span className='relative inline-block' onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button type='button' onClick={() => setOpen(o => !o)} className='text-[10px] uppercase tracking-wide text-[#c9a227] underline decoration-dotted'>
                {label}
            </button>
            {open && (
                <span className='absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-lg bg-black/90 border border-[#b08a3e] p-2 text-xs text-left text-[#f6ead2] shadow-xl'>
                    <span className='block font-bold mb-1 text-[#e0b93a]'>Shopkeeper&apos;s reasoning</span>
                    {reasons.map((r, i) => <span key={i} className='block leading-snug'>• {r}</span>)}
                </span>
            )}
        </span>
    )
}

export function Qty({ value, onChange, max = 99 }: { value: number; onChange: (n: number) => void; max?: number }) {
    return (
        <span className='inline-flex items-center rounded-lg overflow-hidden border border-[#5a4a36]'>
            <button type='button' className='px-2 bg-[#2c241b] hover:bg-[#3a2f24]' onClick={() => onChange(Math.max(1, value - 1))}>−</button>
            <span className='w-7 text-center text-sm tabular-nums'>{value}</span>
            <button type='button' className='px-2 bg-[#2c241b] hover:bg-[#3a2f24]' onClick={() => onChange(Math.min(Math.max(1, max), value + 1))}>+</button>
        </span>
    )
}

export const moodFace = (m: number) => (m > 0.3 ? '😊' : m < -0.3 ? '😠' : '😐')

export function nearAccountUrl(account: string) {
    return `https://testnet.nearblocks.io/address/${account}`
}
