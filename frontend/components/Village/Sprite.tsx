// One frame of a game character sprite sheet (4×4 grid of 48px frames: rows down, left, right, up).
import React from 'react'

export type Facing = 'down' | 'left' | 'right' | 'up'
const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 }

export default function Sprite({ skin, facing = 'down', frame = 1, scale = 2, style, className }: {
    skin: string; facing?: Facing; frame?: number; scale?: number; style?: React.CSSProperties; className?: string
}) {
    const size = 48 * scale
    return (
        <div
            aria-hidden
            className={className}
            style={{
                width: size,
                height: size,
                backgroundImage: `url(/sprites/characters/Character_${skin}.png)`,
                backgroundSize: `${192 * scale}px ${192 * scale}px`,
                backgroundPosition: `${-(frame % 4) * size}px ${-ROW[facing] * size}px`,
                imageRendering: 'pixelated',
                ...style,
            }}
        />
    )
}
