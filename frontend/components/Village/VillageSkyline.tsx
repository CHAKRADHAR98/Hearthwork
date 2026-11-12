// A pixel-art row of cottages with lit windows and chimney smoke, drawn in SVG. Decorative only.
import React from 'react'

const HOUSES = [
    { x: 0, w: 70, h: 60, roof: '#c96f5b' }, { x: 80, w: 90, h: 80, roof: '#c9a227' }, { x: 185, w: 60, h: 55, roof: '#7fb069' },
    { x: 260, w: 110, h: 95, roof: '#c96f5b' }, { x: 385, w: 70, h: 65, roof: '#c9a227' }, { x: 470, w: 95, h: 85, roof: '#8a5a3b' },
    { x: 580, w: 65, h: 58, roof: '#7fb069' }, { x: 660, w: 120, h: 100, roof: '#c9a227' }, { x: 795, w: 75, h: 62, roof: '#c96f5b' },
    { x: 885, w: 95, h: 82, roof: '#8a5a3b' }, { x: 995, w: 70, h: 60, roof: '#7fb069' }, { x: 1080, w: 120, h: 92, roof: '#c9a227' },
]

export default function VillageSkyline({ className = '' }: { className?: string }) {
    return (
        <svg className={className} viewBox='0 0 1200 220' preserveAspectRatio='xMidYMax slice' shapeRendering='crispEdges' aria-hidden>
            <defs>
                <linearGradient id='hw-hill' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#2b3a2a' />
                    <stop offset='1' stopColor='#1a1510' />
                </linearGradient>
            </defs>
            <path d='M0 150 Q 200 110 400 140 T 800 130 T 1200 140 V220 H0 Z' fill='#243225' opacity='.8' />
            {HOUSES.map((h, i) => {
                const base = 200
                const top = base - h.h
                const roofH = Math.round(h.h * 0.45)
                return (
                    <g key={i}>
                        <rect x={h.x + h.w * 0.65} y={top - roofH - 6} width={10} height={roofH} fill='#5a3d2b' />
                        <circle className='hw-smoke' cx={h.x + h.w * 0.65 + 5} cy={top - roofH - 14} r={5} fill='#cdb88f' opacity='.35' style={{ animationDelay: `${i * 0.7}s` }} />
                        <polygon points={`${h.x - 6},${top} ${h.x + h.w / 2},${top - roofH} ${h.x + h.w + 6},${top}`} fill={h.roof} />
                        <rect x={h.x} y={top} width={h.w} height={h.h} fill='#3a2f24' />
                        <rect x={h.x + h.w * 0.2} y={top + h.h * 0.25} width={12} height={12} fill='#ffd166' className='hw-window' style={{ animationDelay: `${i * 1.3}s` }} />
                        <rect x={h.x + h.w * 0.62} y={top + h.h * 0.25} width={12} height={12} fill='#ffd166' opacity='.85' />
                        <rect x={h.x + h.w / 2 - 8} y={base - 26} width={16} height={26} fill='#1f1913' />
                    </g>
                )
            })}
            <rect x='0' y='200' width='1200' height='20' fill='url(#hw-hill)' />
            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                    .hw-smoke { animation: hw-smoke 4s ease-out infinite; transform-box: fill-box; }
                    .hw-window { animation: hw-flicker 5s steps(2) infinite; }
                }
                @keyframes hw-smoke { 0% { transform: translate(0,0) scale(.6); opacity: .45 } 100% { transform: translate(8px,-40px) scale(1.6); opacity: 0 } }
                @keyframes hw-flicker { 0%,90% { opacity: 1 } 95% { opacity: .55 } }
            `}</style>
        </svg>
    )
}
