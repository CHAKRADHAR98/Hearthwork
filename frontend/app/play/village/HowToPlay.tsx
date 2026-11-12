'use client'
import React, { useEffect, useState } from 'react'
import { panel } from './ui'

const KEY = 'hw-howto-hidden'

/** Four steps, shown until the player hides them. */
export default function HowToPlay() {
    const [open, setOpen] = useState(false)
    useEffect(() => {
        try { setOpen(localStorage.getItem(KEY) !== '1') } catch { setOpen(true) }
    }, [])
    const hide = () => {
        setOpen(false)
        try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
    }
    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className={`${panel} absolute left-2 bottom-20 z-20 px-2.5 py-1 text-xs hover:border-[#e0b93a]`}>❓ How to play</button>
        )
    }
    return (
        <div className={`${panel} absolute left-2 bottom-20 z-20 p-3 text-sm w-[min(300px,calc(100vw-1rem))]`}>
            <div className='flex items-center justify-between mb-1'>
                <b className='text-[#e0b93a]'>How to play</b>
                <button onClick={hide} className='text-xs text-[#cdb88f] hover:text-[#f6ead2]'>hide ✕</button>
            </div>
            <ol className='flex flex-col gap-1.5 text-[13px] leading-snug'>
                <li>1. <b>Gather</b>: stand on a coloured circle and press <kbd className='bg-[#c9a227] text-[#1f1913] rounded px-1'>E</kbd>. Sometimes you find something ✨ rare!</li>
                <li>2. <b>Earn</b>: sell to shopkeepers, or fill a <b>📜 request</b> (<kbd className='bg-[#3a2f24] rounded px-1'>R</kbd>) for extra pay.</li>
                <li>3. <b>Upgrade</b>: buy a tool from Tor to gather double, or a hat from Ivo to show off.</li>
                <li>4. <b>Build together</b>: give goods to the 🏗️ team build (<kbd className='bg-[#3a2f24] rounded px-1'>T</kbd>). It appears on your office&apos;s map!</li>
            </ol>
        </div>
    )
}
