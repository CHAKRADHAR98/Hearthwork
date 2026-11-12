'use client'
import React, { useEffect, useState } from 'react'
import TileGridItem from './TileGridItem'
import { SheetName, sprites } from '@/utils/pixi/spritesheet/spritesheet'
import { TileWithPalette } from './Editor'
import { Layer } from '@/utils/pixi/types'
import { editorLandmarks, LANDMARK_PROJECT } from '@/utils/pixi/spritesheet/landmarks'

/** Village objects that became team-project rewards: placed only through the landmarks palette. */
const REWARD_ONLY: Record<string, string[]> = { village: ['big_fountain', 'well_filled'] }

type TileMenuGridProps = {
    selectedPalette: SheetName
    selectedTile: TileWithPalette
    setSelectedTile: (tile: TileWithPalette) => void
    layer: Layer
}

const TileMenuGrid:React.FC<TileMenuGridProps> = ({ selectedPalette, selectedTile, setSelectedTile, layer }) => {

    const [loading, setLoading] = useState<boolean>(true)
    
    useEffect(() => {
        const load = async () => {
            setLoading(true)
            await sprites.load(selectedPalette)
            setLoading(false)
        }
        load()
    }, [selectedPalette])

    const getTiles = () => {
        const tiles = []
        if (selectedPalette === 'landmarks') {
            for (const spriteData of sprites.spriteSheetDataSet.landmarks.spritesList) {
                const unlocked = editorLandmarks.unlocked.includes(LANDMARK_PROJECT[spriteData.name])
                tiles.push(
                    <div key={spriteData.name} className='relative' title={unlocked ? 'Built by your team: place it anywhere' : 'Locked: build it with your team in the Market Square'}>
                        <div className={unlocked ? '' : 'opacity-30 grayscale pointer-events-none'}>
                            <TileGridItem
                                sheetName='landmarks'
                                spriteName={spriteData.name}
                                selected={selectedTile.name === spriteData.name && selectedTile.palette === 'landmarks'}
                                onClick={() => setSelectedTile({ name: spriteData.name, palette: 'landmarks' })}
                            />
                        </div>
                        <p className='text-[10px] text-center capitalize text-white/80'>{unlocked ? `🏆 ${spriteData.name}` : `🔒 ${spriteData.name}`}</p>
                    </div>
                )
            }
            return tiles
        }
        for (const spriteData of sprites.spriteSheetDataSet[selectedPalette].spritesList) {
            const spriteLayer = spriteData.layer || 'floor'
            if (REWARD_ONLY[selectedPalette]?.includes(spriteData.name)) continue
            if (spriteLayer === layer) {
                tiles.push(
                    <TileGridItem 
                        sheetName={selectedPalette} 
                        spriteName={spriteData.name} 
                        selected={selectedTile.name === spriteData.name && selectedTile.palette === selectedPalette} 
                        onClick={() => setSelectedTile({ name: spriteData.name, palette: selectedPalette })} 
                        key={spriteData.name + tiles.length}
                    />
                )
            }
        }

        return tiles
    }

    const tilesToDisplay = getTiles()

    return (
        <div className='w-full h-[400px] overflow-y-scroll border-b-2 border-primary pb-2 transparent-scrollbar'>
            {selectedPalette === 'landmarks' && <p className='text-xs text-white/80 pt-2'>Team builds: finish a project together in the Market Square to unlock it for this office.</p>}
            {tilesToDisplay.length === 0 && <div className='text-center text-white'>No tiles in this category.</div>}
            {!loading && (
                <div className='grid grid-cols-3 w-full gap-2 pt-2'>
                    {tilesToDisplay}
                </div>
            )}
        </div>
        
    )
}

export default TileMenuGrid