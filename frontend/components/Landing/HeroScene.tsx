// Remotion composition for the landing hero: one loop of village life, driven entirely by the frame number.
// A player floods the smith with iron, the price crashes, the shopkeepers form a price pact,
// the tailor goes bankrupt and an investor reopens the shop, while every move lands on NEAR.
import React from 'react'
import { AbsoluteFill, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion'
import Sprite from '@/components/Village/Sprite'

export const HERO_FPS = 30
export const HERO_FRAMES = 420
export const HERO_W = 1280
export const HERO_H = 720

const GROUND = 560
const STALLS = [
    { id: 'farmer', name: 'Bram', skin: '005', x: 150, awning: '#c9a227', good: '🌾', price: 4 },
    { id: 'baker', name: 'Mira', skin: '012', x: 395, awning: '#e07a5f', good: '🍞', price: 11 },
    { id: 'smith', name: 'Tor', skin: '020', x: 640, awning: '#6c757d', good: '🪨', price: 7 },
    { id: 'fishmonger', name: 'Nell', skin: '030', x: 885, awning: '#3a86ff', good: '🐟', price: 6 },
    { id: 'tailor', name: 'Ivo', skin: '040', x: 1130, awning: '#9b5de5', good: '🧵', price: 13 },
]
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Bubble({ x, y, text, show, tone = 'light' }: { x: number; y: number; text: string; show: number; tone?: 'light' | 'dark' }) {
    if (show <= 0.01) return null
    return (
        <div style={{
            position: 'absolute', left: x, top: y, transform: `translate(-50%, -100%) scale(${0.85 + 0.15 * show})`, opacity: show,
            background: tone === 'light' ? '#f6ead2' : '#1f1913', color: tone === 'light' ? '#1f1913' : '#f6ead2',
            border: '3px solid #1f1913', borderRadius: 14, padding: '10px 14px', fontSize: 22, fontWeight: 700, maxWidth: 330,
            whiteSpace: 'normal', lineHeight: 1.2, boxShadow: '0 6px 0 rgba(0,0,0,.35)', fontFamily: 'var(--font-body), sans-serif',
        }}>{text}</div>
    )
}

function Arc({ from, to, progress, icon }: { from: [number, number]; to: [number, number]; progress: number; icon: string }) {
    if (progress <= 0 || progress >= 1) return null
    const x = interpolate(progress, [0, 1], [from[0], to[0]])
    const y = interpolate(progress, [0, 1], [from[1], to[1]]) - Math.sin(progress * Math.PI) * 120
    return <div style={{ position: 'absolute', left: x, top: y, fontSize: 34, transform: 'translate(-50%,-50%)' }}>{icon}</div>
}

export const HeroScene: React.FC = () => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()

    // sky: dawn → day → dusk across the loop
    const sky = interpolateColors(frame, [0, 140, 300, HERO_FRAMES], ['#2c3e5c', '#7ec8e3', '#e9a26b', '#2c3e5c'])
    const hour = Math.floor(interpolate(frame, [0, HERO_FRAMES], [6, 22]))

    // player walks in from the left to Tor's stall
    const walk = interpolate(frame, [20, 95], [-80, 560], { ...clamp, easing: Easing.inOut(Easing.quad) })
    const walking = frame > 20 && frame < 95
    const playerFrame = walking ? Math.floor(frame / 5) % 4 : 1

    // iron price crash after the sale
    const iron = Math.round(interpolate(frame, [125, 165], [7, 3], clamp))
    const ironDrop = interpolate(frame, [125, 140], [0, 1], clamp)

    // tailor: cash drains, bankrupt, rescued
    const tailorCash = Math.round(interpolate(frame, [180, 265], [90, 0], clamp))
    const bankrupt = frame >= 265 && frame < 345
    const rescued = frame >= 345
    const stamp = spring({ frame: frame - 265, fps, config: { damping: 9, stiffness: 160 } })
    const party = spring({ frame: frame - 345, fps, config: { damping: 12 } })

    const pact = interpolate(frame, [200, 220, 300, 320], [0, 1, 1, 0], clamp)
    // gentle dip at the loop seam only; frame 0 is fully visible so a paused player still shows the village
    const fadeLoop = interpolate(frame, [HERO_FRAMES - 20, HERO_FRAMES - 4], [1, 0.6], clamp)

    const chain = [
        { at: 120, text: 'trade · 5 🪨 → smith · 15 🪙 back', tx: 'items.hearthwork.testnet' },
        { at: 190, text: 'apply_deltas · 14 balance changes', tx: 'items.hearthwork.testnet' },
        { at: 335, text: 'invest · 60 🪙 → tailor wallet', tx: 'meta-tx, gas paid by Hearthwork' },
    ].filter(c => frame >= c.at)

    return (
        <AbsoluteFill style={{ background: sky, overflow: 'hidden', opacity: fadeLoop, fontFamily: 'var(--font-body), sans-serif' }}>
            {/* sun / moon */}
            <div style={{ position: 'absolute', left: interpolate(frame, [0, HERO_FRAMES], [120, 1160]), top: 140 - Math.sin((frame / HERO_FRAMES) * Math.PI) * 90, width: 70, height: 70, borderRadius: 70, background: '#ffd166', boxShadow: '0 0 60px #ffd166aa' }} />
            {/* hills */}
            <div style={{ position: 'absolute', left: -100, right: -100, top: GROUND - 120, height: 260, borderRadius: '50% 50% 0 0', background: '#4f7a44' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: GROUND, bottom: 0, background: 'linear-gradient(#c9a77a, #a8865a)' }} />

            {/* HUD: clock + iron chart */}
            <div style={{ position: 'absolute', left: 28, top: 24, background: '#1f1913ee', color: '#f6ead2', border: '3px solid #b08a3e', borderRadius: 14, padding: '10px 16px', fontSize: 24, fontWeight: 800 }}>
                🏘️ Day 3 · {String(hour).padStart(2, '0')}:00
            </div>
            <div style={{ position: 'absolute', right: 28, top: 24, width: 300, background: '#1f1913ee', color: '#f6ead2', border: '3px solid #b08a3e', borderRadius: 14, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
                    <span>🪨 Iron ore</span>
                    <span style={{ color: ironDrop > 0.5 ? '#ff9b85' : '#f6ead2' }}>{iron} 🪙 {ironDrop > 0.5 ? '▼' : ''}</span>
                </div>
                <svg viewBox='0 0 280 60' style={{ width: '100%', height: 60, marginTop: 6 }}>
                    <polyline fill='none' stroke='#e0b93a' strokeWidth={4} strokeLinejoin='round'
                        points={Array.from({ length: 28 }, (_, i) => {
                            const f = (i / 27) * Math.min(frame, 330)
                            const p = interpolate(f, [0, 125, 165, 330], [7, 7.4, 3, 4.2], clamp) + Math.sin(i * 1.7) * 0.25
                            return `${i * 10},${60 - (p - 2) * 9}`
                        }).join(' ')} />
                </svg>
            </div>

            {/* stalls + shopkeepers */}
            {STALLS.map((s, i) => {
                const closed = s.id === 'tailor' && bankrupt
                const bob = Math.sin((frame + i * 9) / 9) * 3
                const price = s.id === 'smith' ? iron : s.price
                return (
                    <div key={s.id} style={{ position: 'absolute', left: s.x - 95, top: GROUND - 210, width: 190, height: 210, opacity: closed ? 0.55 : 1 }}>
                        <div style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 34, background: `repeating-linear-gradient(90deg, ${s.awning} 0 24px, #f6ead2 24px 48px)`, border: '3px solid #1f1913', borderRadius: '10px 10px 0 0' }} />
                        <div style={{ position: 'absolute', left: 10, right: 10, top: 64, bottom: 0, background: '#8a5a3b', border: '3px solid #1f1913' }} />
                        <Sprite skin={s.skin} scale={2.2} frame={1} style={{ position: 'absolute', left: 95 - 53, top: 58 + bob }} />
                        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 0, height: 56, background: '#c9a227', border: '3px solid #1f1913', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 26, fontWeight: 800, color: '#1f1913' }}>
                            <span>{s.good}</span><span>{closed ? 'CLOSED' : `${price} 🪙`}</span>
                        </div>
                        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center', color: '#fff', fontSize: 20, fontWeight: 800, textShadow: '0 2px 0 #1f1913' }}>{s.name}</div>
                        {s.id === 'tailor' && !rescued && (
                            <div style={{ position: 'absolute', left: 20, right: 20, top: -18, height: 10, background: '#1f1913', borderRadius: 6 }}>
                                <div style={{ width: `${(tailorCash / 90) * 100}%`, height: '100%', background: tailorCash < 25 ? '#c96f5b' : '#7fb069', borderRadius: 6 }} />
                            </div>
                        )}
                        {closed && (
                            <div style={{ position: 'absolute', left: '50%', top: 110, transform: `translate(-50%,-50%) rotate(-12deg) scale(${stamp})`, border: '5px solid #c0392b', color: '#c0392b', background: '#f6ead2', padding: '4px 12px', fontSize: 30, fontWeight: 900, borderRadius: 8 }}>BANKRUPT</div>
                        )}
                    </div>
                )
            })}

            {/* the player */}
            <Sprite skin='009' facing={walking ? 'right' : 'up'} frame={playerFrame} scale={2.2}
                style={{ position: 'absolute', left: walk, top: GROUND - 70 }} />
            <div style={{ position: 'absolute', left: walk + 53, top: GROUND - 88, transform: 'translateX(-50%)', color: '#fff', fontSize: 18, fontWeight: 800, textShadow: '0 2px 0 #1f1913' }}>you</div>

            {/* iron goes to Tor, coins come back */}
            {[0, 1, 2, 3, 4].map(k => (
                <Arc key={`i${k}`} icon='🪨' from={[600, GROUND - 60]} to={[640, GROUND - 150]} progress={interpolate(frame, [96 + k * 5, 116 + k * 5], [0, 1], clamp)} />
            ))}
            {[0, 1, 2].map(k => (
                <Arc key={`c${k}`} icon='🪙' from={[640, GROUND - 150]} to={[600, GROUND - 60]} progress={interpolate(frame, [112 + k * 5, 132 + k * 5], [0, 1], clamp)} />
            ))}

            <Bubble x={640} y={GROUND - 225} show={interpolate(frame, [130, 140, 195, 205], [0, 1, 1, 0], clamp)} text='Iron? AGAIN? 3 coins. Take it or leave it.' />

            {/* price pact: whispers between Tor, Bram and Mira */}
            {pact > 0 && (
                <svg style={{ position: 'absolute', inset: 0 }} viewBox={`0 0 ${HERO_W} ${HERO_H}`}>
                    <path d={`M640 ${GROUND - 200} Q 520 ${GROUND - 320} 395 ${GROUND - 200} Q 270 ${GROUND - 320} 150 ${GROUND - 200}`} fill='none' stroke='#f6ead2' strokeWidth={4} strokeDasharray='10 10' opacity={pact} strokeDashoffset={-frame * 2} />
                </svg>
            )}
            <Bubble x={395} y={GROUND - 290} show={pact} tone='dark' text='🤫 Lowball them on iron for a day.' />

            {/* rescue: coins rain into Ivo's shop */}
            {[0, 1, 2, 3, 4, 5].map(k => (
                <Arc key={`r${k}`} icon='🪙' from={[1000 + k * 12, 120]} to={[1130, GROUND - 120]} progress={interpolate(frame, [300 + k * 6, 330 + k * 6], [0, 1], clamp)} />
            ))}
            {rescued && (
                <div style={{ position: 'absolute', left: 1130, top: GROUND - 250, transform: `translate(-50%,-50%) scale(${party})`, background: '#7fb069', color: '#14210f', border: '3px solid #1f1913', borderRadius: 12, padding: '6px 14px', fontSize: 24, fontWeight: 900 }}>🎉 REOPENED</div>
            )}

            {/* on-chain feed */}
            <div style={{ position: 'absolute', left: 28, bottom: 24, width: 820, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chain.map(c => {
                    const a = interpolate(frame - c.at, [0, 10], [0, 1], clamp)
                    return (
                        <div key={c.at} style={{ opacity: a, transform: `translateY(${(1 - a) * 12}px)`, background: '#1f1913ee', color: '#f6ead2', border: '2px solid #5a4a36', borderRadius: 10, padding: '8px 12px', fontSize: 19, display: 'flex', gap: 10, whiteSpace: 'nowrap' }}>
                            <span>⛓️ ✅</span><b>{c.text}</b><span style={{ color: '#cdb88f', marginLeft: 'auto', fontSize: 15 }}>{c.tx}</span>
                        </div>
                    )
                })}
            </div>
        </AbsoluteFill>
    )
}
