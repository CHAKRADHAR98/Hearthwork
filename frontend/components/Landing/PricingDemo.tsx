'use client'
// Try the economy: drag Tor's iron stock and watch his asking and buying prices react.
// Same formulas as backend/src/village/pricing.ts (sellPrice / buyPrice), simplified to one shop.
import React, { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import Sprite from '@/components/Village/Sprite'

const BASE = 7
const TARGET = 14
const R = { STOCK_ELASTICITY: 0.6, HOARD_THRESHOLD: 0.25, HOARD_MARKUP: 1.35, BUY_SPREAD: 0.65, MIN: 0.35, MAX: 4 }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function quote(stock: number, pact: boolean) {
    const ratio = stock / TARGET
    const scarcity = Math.pow(clamp(ratio, 0.15, 3), -R.STOCK_ELASTICITY)
    const reasons = [`Base price ${BASE}`, `Stock ${stock}/${TARGET} → ${scarcity >= 1 ? '+' : ''}${Math.round((scarcity - 1) * 100)}%`]
    let sell = BASE * scarcity
    if (ratio < R.HOARD_THRESHOLD) {
        sell *= R.HOARD_MARKUP
        reasons.push('Hoarding: stock is low → +35%')
    }
    const desire = Math.pow(clamp(ratio, 0.1, 3), -R.STOCK_ELASTICITY)
    let buy = Math.min(BASE * R.BUY_SPREAD * desire, sell * 0.75)
    if (pact) {
        buy *= 0.75
        reasons.push('Price pact against you → −25%')
    }
    const band = (p: number) => Math.max(1, Math.round(clamp(p, BASE * R.MIN, BASE * R.MAX)))
    return { sell: band(sell), buy: band(buy), reasons }
}

function AnimatedNumber({ value }: { value: number }) {
    const ref = useRef<HTMLSpanElement>(null)
    const last = useRef(value)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = String(value); last.current = value; return }
        const o = { v: last.current }
        const a = animate(o, { v: value, duration: 450, ease: 'outCubic', onUpdate: () => { el.textContent = String(Math.round(o.v)) } })
        if (value !== last.current) animate(el, { scale: [1.25, 1], duration: 400, ease: 'outBack' })
        last.current = value
        return () => { a.pause() }
    }, [value])
    return <span ref={ref} className='inline-block tabular-nums'>{value}</span>
}

export default function PricingDemo() {
    const [stock, setStock] = useState(9)
    const [pact, setPact] = useState(false)
    const q = quote(stock, pact)

    function flood() {
        const o = { s: stock }
        animate(o, { s: Math.min(42, stock + 20), duration: 900, ease: 'outQuad', onUpdate: () => setStock(Math.round(o.s)) })
        setPact(true)
    }

    return (
        <div className='rounded-2xl border-2 border-hearth-line bg-hearth-ink p-5 sm:p-6 shadow-[0_8px_0_#0d0a07]'>
            <div className='flex items-center gap-3'>
                <div className='rounded-xl bg-hearth-soot p-1'><Sprite skin='020' scale={1.3} /></div>
                <div>
                    <p className='font-pixel text-xl text-hearth-parchment'>Tor&apos;s forge · 🪨 iron ore</p>
                    <p className='text-sm text-hearth-sand'>Wants about {TARGET} in stock.</p>
                </div>
            </div>

            <label htmlFor='stock' className='mt-5 flex justify-between text-sm font-semibold text-hearth-sand'>
                <span>Iron in Tor&apos;s stock</span><span className='tabular-nums text-hearth-parchment'>{stock}</span>
            </label>
            <input id='stock' type='range' min={0} max={42} value={stock} onChange={e => setStock(Number(e.target.value))}
                className='mt-2 w-full accent-[#e0b93a] h-10 cursor-pointer' />

            <div className='mt-3 grid grid-cols-2 gap-3'>
                <div className='rounded-xl bg-hearth-bark p-3'>
                    <p className='text-xs uppercase tracking-wide text-hearth-sand'>Tor sells at</p>
                    <p className='font-pixel text-4xl text-hearth-parchment'><AnimatedNumber value={q.sell} /> <span className='text-2xl align-middle'>🪙</span></p>
                </div>
                <div className='rounded-xl bg-hearth-bark p-3'>
                    <p className='text-xs uppercase tracking-wide text-hearth-sand'>Tor buys from you at</p>
                    <p className='font-pixel text-4xl text-hearth-parchment'><AnimatedNumber value={q.buy} /> <span className='text-2xl align-middle'>🪙</span></p>
                </div>
            </div>

            <ul className='mt-4 space-y-1 text-sm text-hearth-sand' aria-live='polite'>
                {q.reasons.map(r => <li key={r}>• {r}</li>)}
            </ul>

            <div className='mt-5 flex flex-wrap gap-2'>
                <button onClick={flood} className='rounded-xl bg-hearth-honey px-4 py-2.5 font-semibold text-hearth-ink shadow-[0_4px_0_#7a5a16] active:translate-y-[2px] active:shadow-[0_2px_0_#7a5a16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-parchment'>
                    Flood the market with iron
                </button>
                <button onClick={() => { setStock(9); setPact(false) }} className='rounded-xl bg-hearth-soot px-4 py-2.5 font-semibold text-hearth-parchment hover:bg-hearth-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'>
                    Reset
                </button>
            </div>
            {pact && <p className='mt-3 text-sm text-[#ff9b85]'>🤫 You sold too much iron today. Tor, Bram and Mira agreed to lowball you.</p>}
        </div>
    )
}
