// Shared look for sign-in and register: a dusk sky over the village, a parchment-edged card.
import Link from 'next/link'
import React from 'react'
import VillageSkyline from '@/components/Village/VillageSkyline'

export const fieldLabel = 'block text-sm font-semibold text-hearth-sand mb-1.5'
export const fieldInput =
    'w-full rounded-xl bg-hearth-ink border-2 border-hearth-line px-3.5 py-2.5 text-hearth-parchment placeholder:text-hearth-sand/50 outline-none transition-colors focus-visible:border-hearth-honey focus-visible:ring-2 focus-visible:ring-hearth-honey/30'
export const primaryButton =
    'w-full rounded-xl bg-hearth-honey text-hearth-ink font-pixel text-lg py-2.5 shadow-[0_4px_0_#7a5a16] transition-[transform,box-shadow,background-color] hover:bg-[#ecc95a] active:translate-y-[2px] active:shadow-[0_2px_0_#7a5a16] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-parchment'

export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
    return (
        <main className='relative min-h-screen overflow-hidden bg-gradient-to-b from-hearth-night via-hearth-dusk to-[#3b3550] flex flex-col items-center justify-center px-4 py-16'>
            <VillageSkyline className='absolute bottom-0 left-0 w-full h-48 sm:h-64' />
            <Link href='/' className='relative z-10 mb-6 flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'>
                <img src='/hearthwork-logo.svg' alt='' className='w-10 h-10' />
                <span className='font-pixel text-2xl text-hearth-parchment'>Hearthwork</span>
            </Link>
            <section className='relative z-10 w-full max-w-md rounded-2xl border-2 border-hearth-line bg-hearth-ink p-6 sm:p-8 shadow-[0_12px_50px_rgba(0,0,0,0.5)]'>
                <h1 className='font-pixel text-3xl text-hearth-parchment'>{title}</h1>
                <p className='mt-1 mb-6 text-hearth-sand'>{subtitle}</p>
                {children}
                <div className='mt-6 text-center text-sm text-hearth-sand'>{footer}</div>
            </section>
        </main>
    )
}
