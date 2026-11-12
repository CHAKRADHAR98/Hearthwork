'use client'
import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { RealmData } from '@/utils/pixi/types'

// These components pull in Agora which accesses `window` at module load time.
// `ssr: false` skips server-rendering for the entire import tree of each one.
const PixiApp = dynamic(() => import('./PixiApp'), { ssr: false })
const PlayNavbar = dynamic(() => import('./PlayNavbar'), { ssr: false })
const VideoBar = dynamic(() => import('@/components/VideoChat/VideoBar'), { ssr: false })
const AgoraVideoChatProvider = dynamic(
    () => import('../hooks/useVideoChat').then(m => ({ default: m.AgoraVideoChatProvider })),
    { ssr: false }
)
const IntroScreen = dynamic(() => import('./IntroScreen'), { ssr: false })
import { useModal } from '../hooks/useModal'
import signal from '@/utils/signal'
import SolPoolPanel from './SolPoolPanel'

type PlayClientProps = {
    mapData: RealmData
    username: string
    access_token: string
    realmId: string
    uid: string
    shareId: string
    initialSkin: string
    name: string
    marketEnabled: boolean
    marketPubkey: string | null
}

const PlayClient:React.FC<PlayClientProps> = ({ mapData, username, access_token, realmId, uid, shareId, initialSkin, name, marketEnabled }) => {

    const { setErrorModal, setDisconnectedMessage } = useModal()

    const [showIntroScreen, setShowIntroScreen] = useState(true)
    const [showMarketPrompt, setShowMarketPrompt] = useState(false)
    const [showSolPool, setShowSolPool] = useState(false)

    const [skin, setSkin] = useState(initialSkin)

    useEffect(() => {
        const onShowKickedModal = (message: string) => {
            setErrorModal('Disconnected')
            setDisconnectedMessage(message)
        }

        const onShowDisconnectModal = () => {
            setErrorModal('Disconnected')
            setDisconnectedMessage('You have been disconnected from the server.')
        }

        const onSwitchSkin = (skin: string) => {
            setSkin(skin)
        }

        const onEnterMarketArea = () => {
            setShowMarketPrompt(true)
        }

        const onEnterSolPool = () => {
            setShowSolPool(true)
        }

        signal.on('showKickedModal', onShowKickedModal)
        signal.on('showDisconnectModal', onShowDisconnectModal)
        signal.on('switchSkin', onSwitchSkin)
        signal.on('enterMarketArea', onEnterMarketArea)
        signal.on('enterSolPool', onEnterSolPool)

        return () => {
            signal.off('showKickedModal', onShowKickedModal)
            signal.off('showDisconnectModal', onShowDisconnectModal)
            signal.off('switchSkin', onSwitchSkin)
            signal.off('enterMarketArea', onEnterMarketArea)
            signal.off('enterSolPool', onEnterSolPool)
        }
    }, [marketEnabled])

    return (
        <AgoraVideoChatProvider uid={uid}>
            {!showIntroScreen && <div className='relative w-full h-screen flex flex-col-reverse sm:flex-col'>
                <VideoBar />
                <PixiApp
                    mapData={mapData}
                    className='w-full grow sm:h-full sm:flex-grow-0'
                    username={username}
                    access_token={access_token}
                    realmId={realmId}
                    uid={uid}
                    shareId={shareId}
                    initialSkin={skin}
                />
                <PlayNavbar username={username} skin={skin}/>

                {/* Sol Pool Panel */}
                {showSolPool && (
                    <SolPoolPanel realmId={realmId} onClose={() => setShowSolPool(false)} />
                )}

                {/* Market Portal Prompt */}
                {showMarketPrompt && (
                    <div className='absolute inset-0 flex items-center justify-center z-50 pointer-events-none'>
                        <div
                            className='pointer-events-auto bg-dark-panel border border-cyber-purple flex flex-col gap-4 p-8 relative'
                            style={{ boxShadow: '0 0 40px rgba(153,69,255,0.35), inset 0 0 40px rgba(153,69,255,0.05)' }}
                        >
                            {/* Corner brackets */}
                            <div className='absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyber-purple' />
                            <div className='absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyber-purple' />
                            <div className='absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyber-purple' />
                            <div className='absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyber-purple' />

                            <div className='flex flex-col gap-1'>
                                <p className='font-orbitron text-xs text-cyber-purple tracking-[0.4em] uppercase opacity-80'>&gt; Portal Detected</p>
                                <h2 className='font-orbitron font-bold text-white text-xl tracking-wider'>PREDICTION MARKET</h2>
                                <div className='w-full h-px bg-gradient-to-r from-cyber-purple/60 to-transparent mt-1' />
                            </div>

                            <p className='text-gray-400 text-sm max-w-xs'>
                                You have entered a prediction market portal. Do you want to open it?
                            </p>

                            <div className='flex gap-3 mt-2'>
                                <button
                                    onClick={() => { window.open(`/market/${realmId}`, '_blank'); setShowMarketPrompt(false) }}
                                    className='font-orbitron font-bold text-xs tracking-widest uppercase border border-neon-green text-neon-green px-8 py-3 transition-all duration-200 hover:bg-neon-green/10 hover:shadow-[0_0_20px_rgba(20,241,149,0.3)]'
                                >
                                    [Y] ENTER
                                </button>
                                <button
                                    onClick={() => setShowMarketPrompt(false)}
                                    className='font-orbitron font-bold text-xs tracking-widest uppercase border border-gray-700 text-gray-500 px-8 py-3 transition-all duration-200 hover:bg-white/5'
                                >
                                    [N] CANCEL
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>}
            {showIntroScreen && <IntroScreen realmName={name} skin={skin} username={username} setShowIntroScreen={setShowIntroScreen}/>}    
        </AgoraVideoChatProvider>
    )
}
export default PlayClient