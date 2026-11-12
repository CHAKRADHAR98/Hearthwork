'use client'
// Scroll-in reveal powered by Anime.js: children marked data-reveal fade and rise in, staggered.
import React, { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'

export default function Reveal({ children, className, as: Tag = 'div', id }: { children: React.ReactNode; className?: string; as?: any; id?: string }) {
    const ref = useRef<HTMLElement>(null)
    useEffect(() => {
        const root = ref.current
        if (!root) return
        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !items.length) return
        items.forEach(el => { el.style.opacity = '0' })
        const io = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return
            io.disconnect()
            animate(items, { opacity: [0, 1], translateY: [28, 0], duration: 700, delay: stagger(90), ease: 'outCubic' })
        }, { threshold: 0.15 })
        io.observe(root)
        return () => io.disconnect()
    }, [])
    return <Tag ref={ref} className={className} id={id}>{children}</Tag>
}
