'use client'
import React, { useEffect, useState } from 'react'
import signal from '@/utils/signal'

export interface Celebration { icon: string; title: string; text: string; big?: boolean }

/** A short, cheerful pop-up in the middle of the screen: rare finds, finished team builds. */
export default function Celebrate() {
    const [c, setC] = useState<Celebration | null>(null)
    const [key, setKey] = useState(0)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const on = (next: Celebration) => {
            setC(next)
            setKey(k => k + 1)
            clearTimeout(timer)
            timer = setTimeout(() => setC(null), next.big ? 6500 : 3200)
        }
        signal.on('celebrate', on)
        return () => { signal.off('celebrate', on); clearTimeout(timer) }
    }, [])

    if (!c) return null
    return (
        <div key={key} className='pointer-events-none absolute inset-0 z-50 grid place-items-center'>
            <div className='hw-pop pointer-events-auto relative rounded-2xl border-4 border-[#e0b93a] bg-[#1f1913]/95 px-8 py-5 text-center text-[#f6ead2] shadow-[0_0_80px_rgba(224,185,58,0.45)] max-w-[min(440px,calc(100vw-2rem))]' onClick={() => setC(null)}>
                <div className={`${c.big ? 'text-7xl' : 'text-6xl'} hw-bob`}>{c.icon}</div>
                <p className='mt-2 text-xl font-bold text-[#e0b93a]' style={{ fontFamily: 'var(--font-pixel, inherit)' }}>{c.title}</p>
                <p className='mt-1 text-sm'>{c.text}</p>
            </div>
            <style jsx>{`
                .hw-pop { animation: hwPop 420ms cubic-bezier(.2, 1.4, .4, 1) both; }
                .hw-bob { animation: hwBob 1.2s ease-in-out infinite; }
                @keyframes hwPop { from { transform: scale(.4) translateY(30px); opacity: 0 } to { transform: none; opacity: 1 } }
                @keyframes hwBob { 0%, 100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-8px) rotate(4deg) } }
                @media (prefers-reduced-motion: reduce) { .hw-pop, .hw-bob { animation: none } }
            `}</style>
        </div>
    )
}
