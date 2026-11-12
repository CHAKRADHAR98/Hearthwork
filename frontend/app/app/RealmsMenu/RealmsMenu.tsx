'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import BasicButton from '@/components/BasicButton'
import DesktopRealmItem from './DesktopRealmItem'
import { useRouter } from 'next/navigation'
import { request } from '@/utils/backend/requests'
import { getToken } from '@/utils/auth'
import revalidate from '@/utils/revalidate'

type Realm = {
    id: string,
    name: string,
    share_id: string
    shared?: boolean
}

type RealmsMenuProps = {
    realms: Realm[]
    errorMessage: string
}

const RealmsMenu:React.FC<RealmsMenuProps> = ({ realms, errorMessage }) => {

    const [selectedRealm, setSelectedRealm] = useState<Realm | null>(null)
    const [playerCounts, setPlayerCounts] = useState<number[]>([])
    const router = useRouter()

    useEffect(() => {
        if (errorMessage) {
            toast.error(errorMessage)
        }
    }, [errorMessage])

    useEffect(() => {
        getPlayerCounts()
        revalidate('/play/[id]')
    }, [])

    function getLink() {
        if (selectedRealm?.share_id) {
            return `/play/${selectedRealm.id}?shareId=${selectedRealm.share_id}`
        } else {
            return `/play/${selectedRealm?.id}`
        }
    }

    async function getPlayerCounts() {
        const token = getToken()
        if (!token) return
        const { data: playerCountData, error: playerCountsError } = await request('/getPlayerCounts', { realmIds: realms.map((realm) => realm.id)}, token)
        if (playerCountData) {
            setPlayerCounts(playerCountData.playerCounts)
        }
    }

    return (
        <>
            {/* Mobile View */}
            <div className='flex flex-col items-center p-4 gap-2 sm:hidden'>
                {realms.length === 0 && (
                    <p className='text-center text-gray-600 font-orbitron text-xs tracking-wider uppercase mt-8'>
                        No spaces found. Create one on desktop to get started.
                    </p>
                )}
                {realms.map((realm, index) => {
                    function selectRealm() {
                        setSelectedRealm(realm)
                    }
                    return (
                        <button
                            key={realm.id}
                            className={`w-full h-12 border flex flex-row items-center justify-between px-4 transition-all duration-200 font-orbitron text-sm tracking-wider ${
                                selectedRealm?.id === realm.id
                                    ? 'border-cyber-cyan text-cyber-cyan bg-cyber-cyan/5'
                                    : 'border-panel-border text-gray-400 hover:border-cyber-cyan/40 hover:text-gray-300'
                            }`}
                            onClick={selectRealm}
                        >
                            <span className='uppercase'>{realm.name}</span>
                            {playerCounts[index] !== undefined && (
                                <div className='flex items-center gap-1.5'>
                                    <div className='w-2 h-2 rounded-full bg-neon-green shadow-[0_0_4px_rgba(20,241,149,0.8)]' />
                                    <span className='text-xs text-neon-green'>{playerCounts[index]}</span>
                                </div>
                            )}
                        </button>
                    )
                })}
                <div className='fixed bottom-0 w-full bg-dark-panel border-t border-panel-border grid place-items-center p-3'>
                    <BasicButton className='w-[90%]' disabled={selectedRealm === null} onClick={() => router.push(getLink())}>
                        Enter Space
                    </BasicButton>
                </div>
            </div>

            {/* Desktop View */}
            <div className='flex-col items-center w-full p-8 hidden sm:flex'>
                {realms.length === 0 && (
                    <div className='flex flex-col items-center gap-3 mt-16'>
                        <p className='text-gray-600 font-orbitron text-xs tracking-[0.3em] uppercase'>No spaces detected</p>
                        <p className='text-gray-700 text-sm'>Create a space to get started.</p>
                    </div>
                )}
                <div className='hidden sm:grid grid-cols-2 md:grid-cols-3 gap-6 w-full'>
                    {realms.map((realm, index) => (
                        <DesktopRealmItem key={realm.id} name={realm.name} id={realm.id} shareId={realm.share_id} shared={realm.shared} playerCount={playerCounts[index]}/>
                    ))}
                </div>
            </div>
        </>
    )
}

export default RealmsMenu