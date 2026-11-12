'use client'
import AnimatedCharacter from './play/SkinMenu/AnimatedCharacter'
import Link from 'next/link'

export default function Index() {
  return (
    <div className='relative w-full h-screen cyber-bg scanlines overflow-hidden flex flex-col items-center justify-center p-4'>

      {/* Moving scan line */}
      <div className='absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-40 animate-scan pointer-events-none' style={{zIndex: 2}} />

      {/* Top-left corner bracket */}
      <div className='absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-cyber-cyan opacity-60' />
      {/* Top-right corner bracket */}
      <div className='absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-cyber-cyan opacity-60' />
      {/* Bottom-left corner bracket */}
      <div className='absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-cyber-cyan opacity-60' />
      {/* Bottom-right corner bracket */}
      <div className='absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-cyber-cyan opacity-60' />

      {/* Status bar top */}
      <div className='absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10'>
        <div className='w-2 h-2 rounded-full bg-neon-green animate-pulse' />
        <span className='text-neon-green text-xs tracking-[0.3em] font-orbitron uppercase'>System Online</span>
      </div>

      {/* Main content */}
      <div className='relative z-10 flex flex-col items-center text-center max-w-2xl gap-8'>

        {/* Title */}
        <div className='flex flex-col items-center gap-2'>
          <p className='text-cyber-cyan text-xs tracking-[0.5em] font-orbitron uppercase mb-2 opacity-70'>
            &gt; Initializing...
          </p>
          <h1 className='font-orbitron font-black text-6xl sm:text-7xl tracking-wider text-white text-glow-cyan select-none'>
            SLOT<span className='text-cyber-cyan'>_</span>0
          </h1>
          <div className='w-full h-px bg-gradient-to-r from-transparent via-cyber-cyan to-transparent mt-2 opacity-50' />
        </div>

        {/* Subtitle */}
        <p className='text-gray-400 text-sm sm:text-base leading-relaxed max-w-md'>
          <span className='text-cyber-cyan font-orbitron text-xs'>&gt;&nbsp;</span>
          Build with your community, set on-chain goals, and let the market bet on your success.
        </p>

        {/* Character + CTA row */}
        <div className='flex flex-col sm:flex-row items-center gap-8'>
          {/* Framed character */}
          <div className='relative p-1 border border-cyber-cyan/30 rounded-sm cyber-glow'>
            <div className='absolute -top-px -left-px w-3 h-3 border-t border-l border-cyber-cyan' />
            <div className='absolute -bottom-px -right-px w-3 h-3 border-b border-r border-cyber-cyan' />
            <AnimatedCharacter src='/sprites/characters/Character_009.png' className='w-20 h-20' />
          </div>

          {/* CTA */}
          <div className='flex flex-col items-center gap-3'>
            <Link href='/app'>
              <button className='relative font-orbitron font-bold text-sm tracking-[0.2em] uppercase px-10 py-4 border border-cyber-cyan text-cyber-cyan bg-transparent transition-all duration-300 hover:bg-cyber-cyan/10 hover:shadow-[0_0_30px_rgba(0,245,255,0.5)] active:scale-95 rounded-sm'>
                ENTER SYSTEM
              </button>
            </Link>
            <div className='flex items-center gap-2'>
              <Link href='/signin' className='text-xs text-gray-500 hover:text-cyber-cyan transition-colors duration-200 tracking-widest uppercase font-orbitron'>
                Sign In
              </Link>
              <span className='text-gray-700'>|</span>
              <Link href='/register' className='text-xs text-gray-500 hover:text-cyber-cyan transition-colors duration-200 tracking-widest uppercase font-orbitron'>
                Register
              </Link>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom status bar */}
      <div className='absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 z-10'>
        <span className='text-gray-700 text-xs tracking-widest font-orbitron uppercase'>Solana</span>
        <div className='w-1 h-1 rounded-full bg-gray-700' />
        <span className='text-gray-700 text-xs tracking-widest font-orbitron uppercase'>Multiplayer</span>
        <div className='w-1 h-1 rounded-full bg-gray-700' />
        <span className='text-gray-700 text-xs tracking-widest font-orbitron uppercase'>Prediction Market</span>
      </div>

    </div>
  )
}
