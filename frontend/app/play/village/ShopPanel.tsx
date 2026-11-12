'use client'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call } from '@/utils/village/client'
import signal from '@/utils/signal'
import { VILLAGE_NPCS } from '@/utils/village/data'
import AnimatedCharacter from '../SkinMenu/AnimatedCharacter'
import { useVillage } from './useVillage'
import { btnGhost, btnGold, icon, input, moodFace, nearAccountUrl, panel, Qty, Why } from './ui'

type ChatLine = { from: 'you' | 'shop'; text: string; offer?: { unit: number; total: number; dealId: string; accepted: boolean; side: 'buy' | 'sell'; good: string; qty: number } }

const chats: Record<string, ChatLine[]> = {} // survives closing the panel

export default function ShopPanel({ shopId, onClose }: { shopId: string; onClose: () => void }) {
    const { state, wallet, goods, ai, catalog } = useVillage()
    const shop = state?.shops.find(s => s.id === shopId)
    const npc = VILLAGE_NPCS.find(n => n.id === shopId)!
    const [qty, setQty] = useState<Record<string, number>>({})
    const [busy, setBusy] = useState(false)
    const [haggleSide, setHaggleSide] = useState<'buy' | 'sell'>('buy')
    const [haggleGood, setHaggleGood] = useState('')
    const [haggleQty, setHaggleQty] = useState(3)
    const [msg, setMsg] = useState('')
    const [lines, setLines] = useState<ChatLine[]>(chats[shopId] ?? [])
    const [invest, setInvest] = useState(20)
    const chatEnd = useRef<HTMLDivElement>(null)

    useEffect(() => { chats[shopId] = lines; chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines, shopId])
    useEffect(() => {
        if (!shop) return
        if (!haggleGood || !(haggleSide === 'buy' ? shop.sells : shop.buys).some(q => q.good === haggleGood)) {
            setHaggleGood((haggleSide === 'buy' ? shop.sells : shop.buys)[0]?.good ?? '')
        }
    }, [shop, haggleSide, haggleGood])

    if (!shop || !wallet) return null
    const bal = (g: string) => wallet.balances[g] ?? 0
    const q = (g: string) => qty[g] ?? 1
    const name = (g: string) => goods[g]?.name ?? g
    const jobs = state!.jobs.filter(j => j.shopId === shopId)
    const pact = state!.pacts.find(p => p.against === wallet.uid && p.members.includes(shopId))
    const myShares = shop.investors[wallet.uid] ?? 0
    const totalShares = Object.values(shop.investors).reduce((a, b) => a + b, 0)

    async function run<T>(fn: () => Promise<T>, ok?: (r: T) => string) {
        setBusy(true)
        try {
            const r = await fn()
            if (ok) toast.success(ok(r))
            return r
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setBusy(false)
        }
    }

    const buy = (g: string, n: number, dealId?: string) =>
        run(() => call('village:buy', { shopId, good: g, qty: n, dealId }), (r: any) => `Bought ${n} ${icon(g)} for ${r.trade.total} 🪙`)
    const sell = (g: string, n: number, dealId?: string) =>
        run(() => call('village:sell', { shopId, good: g, qty: n, dealId }), (r: any) => {
            signal.emit('villageFloat', { text: `+${r.trade.total + (r.trade.bonus ?? 0)} coins`, color: 0xe0b93a })
            return `Sold ${n} ${icon(g)} for ${r.trade.total} 🪙${r.trade.bonus ? ` (+${r.trade.bonus} 🌉 bridge bonus)` : ''}`
        })
    const buyItem = (id: string, label: string) =>
        run(() => call('village:buyItem', { item: id }), () => `Bought ${label}!`)
    const sellRare = (id: string, label: string) =>
        run(() => call('village:sellRare', { rare: id }), (r: any) => {
            signal.emit('villageFloat', { text: `+${r.value} coins`, color: 0xe0b93a })
            return `Sold ${label} for ${r.value} 🪙`
        })
    const tools = shopId === 'smith' ? catalog.tools : []
    const hats = shopId === 'tailor' ? catalog.hats.filter(h => h.price) : []
    const rares = catalog.rares.filter(r => r.buyer === shopId)

    async function sendHaggle(e: React.FormEvent) {
        e.preventDefault()
        if (!msg.trim() || !haggleGood) return
        const text = msg.trim()
        setMsg('')
        setLines(l => [...l, { from: 'you', text }])
        const r: any = await run(() => call('village:haggle', { shopId, side: haggleSide, good: haggleGood, qty: haggleQty, message: text }))
        if (r) setLines(l => [...l, { from: 'shop', text: r.reply, offer: { unit: r.offer, total: r.total, dealId: r.dealId, accepted: r.accepted, side: haggleSide, good: haggleGood, qty: haggleQty } }])
    }

    return (
        <div className={`${panel} absolute right-2 top-2 bottom-16 w-[min(420px,calc(100vw-1rem))] z-40 flex flex-col overflow-hidden`}>
            {/* header */}
            <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                <div className='w-12 h-12 rounded-lg bg-[#3a2f24] grid place-items-center overflow-hidden'>
                    <AnimatedCharacter src={`/sprites/characters/Character_${npc.skin}.png`} noAnimation className='w-10 h-10' />
                </div>
                <div className='flex-1 min-w-0'>
                    <p className='font-bold text-lg leading-tight'>{npc.icon} {shop.name} <span className='text-sm font-normal text-[#cdb88f]'>the {shop.title}</span></p>
                    <p className='text-xs text-[#cdb88f] flex flex-wrap gap-x-3'>
                        <span>{shop.open ? '🟢 Open' : '🔴 Bankrupt'}</span>
                        <span>🪙 {shop.coins - shop.reserved} cash</span>
                        <span>{moodFace(shop.mood)} mood</span>
                        <a className='underline hover:text-[#e0b93a]' href={nearAccountUrl(shop.account)} target='_blank' rel='noreferrer'>wallet ↗</a>
                    </p>
                </div>
                <button onClick={onClose} className='p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
            </div>

            <div className='flex-1 overflow-y-auto p-3 flex flex-col gap-4 text-sm'>
                {pact && (
                    <div className='rounded-lg border border-red-400/60 bg-red-900/30 p-2 text-xs'>
                        🤫 Word is {pact.members.map(m => VILLAGE_NPCS.find(n => n.id === m)?.name).join(' & ')} agreed to lowball you on {icon(pact.good)} {name(pact.good)} today. Sell elsewhere, wait it out, or haggle hard.
                    </div>
                )}

                {!shop.open ? (
                    <div className='rounded-lg border border-[#b08a3e] bg-[#2a2119] p-3 flex flex-col gap-2'>
                        <p className='font-bold'>💸 {shop.name} went bankrupt.</p>
                        <p className='text-[#cdb88f]'>The shop reopens once it has 60 coins. Investors earn a share of its profits every day.</p>
                    </div>
                ) : (
                    <>
                        <section>
                            <h3 className='font-bold mb-1'>For sale</h3>
                            {shop.sells.map(s => (
                                <div key={s.good} className='flex items-center gap-2 py-1'>
                                    <span className='w-28'>{icon(s.good)} {name(s.good)}</span>
                                    <span className='w-16 tabular-nums'>{s.price} 🪙</span>
                                    <Why reasons={s.reasons} />
                                    <span className='text-xs text-[#cdb88f] w-14'>{s.available} left</span>
                                    <Qty value={q(s.good)} max={s.available} onChange={n => setQty({ ...qty, [s.good]: n })} />
                                    <button className={`${btnGold} ml-auto`} disabled={busy || s.available < 1} onClick={() => buy(s.good, q(s.good))}>Buy</button>
                                </div>
                            ))}
                        </section>
                        <section>
                            <h3 className='font-bold mb-1'>Buying from you</h3>
                            {shop.buys.map(s => (
                                <div key={s.good} className='flex items-center gap-2 py-1'>
                                    <span className='w-28'>{icon(s.good)} {name(s.good)}</span>
                                    <span className='w-16 tabular-nums'>{s.price} 🪙</span>
                                    <Why reasons={s.reasons} />
                                    <span className='text-xs text-[#cdb88f] w-14'>you: {bal(s.good)}</span>
                                    <Qty value={Math.min(q(s.good), Math.max(1, bal(s.good)))} max={bal(s.good)} onChange={n => setQty({ ...qty, [s.good]: n })} />
                                    <button className={`${btnGold} ml-auto`} disabled={busy || bal(s.good) < 1 || s.available < 1} onClick={() => sell(s.good, Math.min(q(s.good), bal(s.good)))}>Sell</button>
                                </div>
                            ))}
                        </section>

                        {tools.length > 0 && (
                            <section className='rounded-lg border border-[#b08a3e] bg-[#2a2119] p-2'>
                                <h3 className='font-bold'>🛠️ Tools <span className='text-xs font-normal text-[#cdb88f]'>gather double at one spot · {shop.stock.tools ?? 0} 🔨 in stock to make them</span></h3>
                                {tools.map(t => (
                                    <div key={t.id} className='flex items-center gap-2 py-1'>
                                        <span className='flex-1'>{t.icon} {t.name} <span className='text-xs text-[#cdb88f]'>· {t.uses} uses{bal(t.id) ? ` · you have ${bal(t.id)}` : ''}</span></span>
                                        <span className='tabular-nums'>{t.price} 🪙</span>
                                        <button className={btnGold} disabled={busy || bal('coin') < t.price || (shop.stock.tools ?? 0) < 1} onClick={() => buyItem(t.id, `${t.icon} ${t.name}`)}>Buy</button>
                                    </div>
                                ))}
                            </section>
                        )}
                        {hats.length > 0 && (
                            <section className='rounded-lg border border-[#b08a3e] bg-[#2a2119] p-2'>
                                <h3 className='font-bold'>🎩 Hats <span className='text-xs font-normal text-[#cdb88f]'>worn in the office too · {shop.stock.cloth ?? 0} 🧵 in stock to sew them</span></h3>
                                <div className='grid grid-cols-4 gap-2 mt-1'>
                                    {hats.map(h => {
                                        const owned = bal(h.id) > 0
                                        return (
                                            <button key={h.id} disabled={busy || owned || bal('coin') < (h.price ?? 0) || (shop.stock.cloth ?? 0) < 1}
                                                onClick={() => buyItem(h.id, `${h.icon} ${h.name}`)}
                                                className='rounded-lg border border-[#5a4a36] p-1.5 text-center hover:border-[#e0b93a] disabled:opacity-50 disabled:cursor-not-allowed'>
                                                <div className='text-2xl'>{h.icon}</div>
                                                <div className='text-[10px] leading-tight'>{h.name}</div>
                                                <div className='text-[11px] font-bold'>{owned ? 'owned' : `${h.price} 🪙`}</div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </section>
                        )}
                        {rares.length > 0 && (
                            <section>
                                <h3 className='font-bold mb-1'>✨ Rare finds {shop.name} can sell to a collector</h3>
                                {rares.map(r => (
                                    <div key={r.id} className='flex items-center gap-2 py-1'>
                                        <span className='flex-1'>{r.icon} {r.name} <span className='text-xs text-[#cdb88f]'>· you have {bal(r.id)}</span></span>
                                        <span className='tabular-nums'>{r.value} 🪙</span>
                                        <button className={btnGold} disabled={busy || bal(r.id) < 1} onClick={() => sellRare(r.id, `${r.icon} ${r.name}`)}>Sell</button>
                                    </div>
                                ))}
                            </section>
                        )}

                        <section className='rounded-lg border border-[#5a4a36] p-2 flex flex-col gap-2'>
                            <h3 className='font-bold'>💬 Haggle <span className='text-xs font-normal text-[#cdb88f]'>{ai ? '· AI shopkeeper on NEAR AI' : '· rule-based shopkeeper'}</span></h3>
                            <div className='flex flex-wrap items-center gap-2'>
                                <select className={input} value={haggleSide} onChange={e => setHaggleSide(e.target.value as any)}>
                                    <option value='buy'>I want to buy</option>
                                    <option value='sell'>I want to sell</option>
                                </select>
                                <Qty value={haggleQty} onChange={setHaggleQty} />
                                <select className={input} value={haggleGood} onChange={e => setHaggleGood(e.target.value)}>
                                    {(haggleSide === 'buy' ? shop.sells : shop.buys).map(s => <option key={s.good} value={s.good}>{icon(s.good)} {name(s.good)}</option>)}
                                </select>
                            </div>
                            <div className='max-h-48 overflow-y-auto flex flex-col gap-1.5'>
                                {lines.length === 0 && <p className='text-xs text-[#cdb88f]'>Make an offer, e.g. “I’ll pay 8 each” or “20 for all of them”. Flattery and gossip may help.</p>}
                                {lines.map((l, i) => (
                                    <div key={i} className={l.from === 'you' ? 'self-end text-right' : 'self-start'}>
                                        <span className={`inline-block rounded-lg px-2 py-1 ${l.from === 'you' ? 'bg-[#4a3d2f]' : 'bg-[#2c241b] border border-[#5a4a36]'}`}>{l.text}</span>
                                        {l.offer && i === lines.length - 1 && (
                                            <div className='mt-1 flex items-center gap-2 text-xs'>
                                                <span>{l.offer.accepted ? '🤝 Deal:' : 'Offer:'} {l.offer.qty} {icon(l.offer.good)} at {l.offer.unit} each = <b>{l.offer.total} 🪙</b></span>
                                                <button className={btnGold} disabled={busy} onClick={async () => {
                                                    const r = l.offer!.side === 'buy' ? await buy(l.offer!.good, l.offer!.qty, l.offer!.dealId) : await sell(l.offer!.good, l.offer!.qty, l.offer!.dealId)
                                                    if (r) setLines(ls => ls.map((x, j) => (j === i ? { ...x, offer: undefined } : x)))
                                                }}>Accept</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={chatEnd} />
                            </div>
                            <form onSubmit={sendHaggle} className='flex gap-2'>
                                <input className={`${input} flex-1`} value={msg} onChange={e => setMsg(e.target.value)} placeholder={`Say something to ${shop.name}…`} maxLength={300} onKeyDown={e => e.stopPropagation()} />
                                <button className={btnGold} disabled={busy || !msg.trim()}>Send</button>
                            </form>
                        </section>
                    </>
                )}

                {jobs.length > 0 && (
                    <section>
                        <h3 className='font-bold mb-1'>📜 {shop.name}&apos;s requests</h3>
                        {jobs.map(j => (
                            <div key={j.id} className='flex items-center gap-2 py-1'>
                                <span className='flex-1'>{j.size === 'urgent' ? '⏰ ' : ''}Deliver {j.qty} {icon(j.good)} {name(j.good)} → <b>{j.reward} 🪙</b> <span className='text-xs text-[#cdb88f]'>{j.note ? `${j.note} · ` : ''}you have {bal(j.good)}</span></span>
                                <button className={btnGold} disabled={busy || bal(j.good) < j.qty} onClick={() => run(() => call('village:deliverJob', { jobId: j.id }), () => `Job done! +${j.reward} 🪙`)}>Deliver</button>
                            </div>
                        ))}
                    </section>
                )}

                <section className='rounded-lg border border-[#5a4a36] p-2'>
                    <h3 className='font-bold mb-1'>💰 Invest in {shop.name}&apos;s shop</h3>
                    <p className='text-xs text-[#cdb88f] mb-2'>Investors share 40% of the shop&apos;s daily profit. {totalShares > 0 && <>You own {myShares} of {totalShares} shares ({Math.round((myShares / totalShares) * 100)}%).</>}</p>
                    <div className='flex items-center gap-2'>
                        <input type='number' min={1} className={`${input} w-24`} value={invest} onChange={e => setInvest(Math.max(1, Number(e.target.value) || 1))} onKeyDown={e => e.stopPropagation()} />
                        <span>🪙 (you have {bal('coin')})</span>
                        <button className={`${btnGhost} ml-auto`} disabled={busy || bal('coin') < invest} onClick={() => run(() => call('village:invest', { shopId, amount: invest }), (r: any) => (r.open ? `Invested ${invest} 🪙` : `Invested ${invest} 🪙, the shop needs a bit more to reopen`))}>Invest</button>
                    </div>
                </section>
            </div>
        </div>
    )
}
