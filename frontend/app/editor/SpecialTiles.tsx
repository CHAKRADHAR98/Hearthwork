import React from 'react'
import SpecialTileItem from './SpecialTileItem'
import { SpecialTile } from '@/utils/pixi/types'
import { Placeholder, FlyingSaucer, Tree, Desk, ChartLineUp, CurrencyDollar, Storefront, MapPin, SignOut } from '@phosphor-icons/react'
import signal from '@/utils/signal'
import { LAYOUT } from '@/utils/village/layout'

type SpecialTilesProps = {
    specialTile: SpecialTile
    selectSpecialTile: (specialTile: SpecialTile) => void
}

const SpecialTiles:React.FC<SpecialTilesProps> = ({ specialTile, selectSpecialTile }) => {

    return (
        <div className='w-full flex flex-col items-center'>
            <SpecialTileItem 
                iconColor='yellow' 
                title='Private Area' 
                description='Specify an area where players can talk privately.' 
                selected={specialTile === 'Private Area'} 
                onClick={() => selectSpecialTile('Private Area')}>
                <Desk className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem 
                iconColor='red' 
                title='Impassable' 
                description='Specify tiles that cannot be walked on.' 
                selected={specialTile === 'Impassable'} 
                onClick={() => selectSpecialTile('Impassable')}>
                <Placeholder className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem 
                iconColor='blue' 
                title='Teleport' 
                description='Set up a one-way teleporter between tiles.' 
                selected={specialTile === 'Teleport'} 
                onClick={() => selectSpecialTile('Teleport')}>
                <FlyingSaucer className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem
                iconColor='green'
                title='Spawn Point'
                description='Specify where players spawn into your Realm.'
                selected={specialTile === 'Spawn'}
                onClick={() => selectSpecialTile('Spawn')}>
                <Tree className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem
                iconColor='yellow'
                title='Market Square'
                description='Entrance to the village game. Place it in your office.'
                selected={specialTile === 'Village'}
                onClick={() => selectSpecialTile('Village')}>
                <Storefront className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem
                iconColor='red'
                title='Market spot'
                description='Where a shopkeeper or gathering spot goes (Market Square room).'
                selected={specialTile === 'Market Spot'}
                onClick={() => selectSpecialTile('Market Spot')}>
                <MapPin className='w-12 h-12'/>
            </SpecialTileItem>
            <label className='w-[400px] px-8 pb-3 flex flex-col gap-1 text-xs text-hearth-sand'>
                Spot to place
                <select
                    className='rounded-lg border border-hearth-line bg-hearth-ink px-2 py-1.5 text-sm text-hearth-parchment'
                    defaultValue='farmer'
                    onChange={e => { signal.emit('selectMarketSpot', e.target.value); selectSpecialTile('Market Spot') }}
                >
                    {LAYOUT.map(l => <option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
                </select>
            </label>
            <SpecialTileItem
                iconColor='green'
                title='Market exit'
                description='Leads back to the office (Market Square room).'
                selected={specialTile === 'Market Exit'}
                onClick={() => selectSpecialTile('Market Exit')}>
                <SignOut className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem
                iconColor='purple'
                title='Predictions'
                description='Players who step here open the office prediction markets (on NEAR).'
                selected={specialTile === 'Market'}
                onClick={() => selectSpecialTile('Market')}>
                <ChartLineUp className='w-12 h-12'/>
            </SpecialTileItem>
            <SpecialTileItem
                iconColor='green'
                title='Team Pool'
                description="Players who step here open the office's shared NEAR pool."
                selected={specialTile === 'Pool'}
                onClick={() => selectSpecialTile('Pool')}>
                <CurrencyDollar className='w-12 h-12'/>
            </SpecialTileItem>
        </div>
    )
}

export default SpecialTiles