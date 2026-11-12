'use client'
// The landing hero plays the HeroScene composition live in the browser with Remotion's <Player>.
import React, { useEffect, useState } from 'react'
import { Player } from '@remotion/player'
import { HERO_FPS, HERO_FRAMES, HERO_H, HERO_W, HeroScene } from './HeroScene'

export default function HeroPlayer() {
    const [reduced, setReduced] = useState(false)
    useEffect(() => {
        const m = window.matchMedia('(prefers-reduced-motion: reduce)')
        setReduced(m.matches)
        const on = () => setReduced(m.matches)
        m.addEventListener('change', on)
        return () => m.removeEventListener('change', on)
    }, [])

    return (
        <div className='relative rounded-2xl overflow-hidden border-4 border-hearth-ink shadow-[0_10px_0_#0d0a07,0_30px_80px_rgba(0,0,0,0.5)] bg-hearth-dusk'>
            <Player
                component={HeroScene}
                durationInFrames={HERO_FRAMES}
                fps={HERO_FPS}
                compositionWidth={HERO_W}
                compositionHeight={HERO_H}
                style={{ width: '100%', aspectRatio: `${HERO_W} / ${HERO_H}` }}
                // with reduced motion we show a still of the most telling moment instead of the loop
                autoPlay={!reduced}
                initialFrame={reduced ? 280 : 0}
                loop
                controls={false}
                clickToPlay={false}
                acknowledgeRemotionLicense
                // the scene is silent: no shared audio tags, so browsers allow autoplay without a click
                numberOfSharedAudioTags={0}
                initiallyMuted
            />
            <p className='sr-only'>
                Animated scene: a player sells iron to Tor the blacksmith, the iron price drops from 7 to 3 coins, the shopkeepers whisper a price pact,
                Ivo the tailor goes bankrupt and is reopened by an investor, and each action appears as a NEAR transaction.
            </p>
        </div>
    )
}
