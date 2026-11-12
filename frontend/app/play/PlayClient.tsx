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
const VillageHUD = dynamic(() => import('./village/VillageHUD'), { ssr: false })
const MarketsPanel = dynamic(() => import('./finance/MarketsPanel'), { ssr: false })
const PoolPanel = dynamic(() => import('./finance/PoolPanel'), { ssr: false })
import { useModal } from '../hooks/useModal'
import signal from '@/utils/signal'

type PlayClientProps = {
    mapData: RealmData
    username: string
    access_token: string
    realmId: string
    uid: string
    shareId: string
    initialSkin: string
    name: string
}

const PlayClient:React.FC<PlayClientProps> = ({ mapData, username, access_token, realmId, uid, shareId, initialSkin, name }) => {

    const { setErrorModal, setDisconnectedMessage } = useModal()

    const [showIntroScreen, setShowIntroScreen] = useState(true)
    const [showMarkets, setShowMarkets] = useState(false)
    const [showPool, setShowPool] = useState(false)

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
            setShowMarkets(true)
        }

        const onEnterPool = () => {
            setShowPool(true)
        }

        signal.on('showKickedModal', onShowKickedModal)
        signal.on('showDisconnectModal', onShowDisconnectModal)
        signal.on('switchSkin', onSwitchSkin)
        signal.on('enterMarketArea', onEnterMarketArea)
        signal.on('enterPool', onEnterPool)
        signal.on('openMarkets', onEnterMarketArea)
        signal.on('openPool', onEnterPool)

        return () => {
            signal.off('showKickedModal', onShowKickedModal)
            signal.off('showDisconnectModal', onShowDisconnectModal)
            signal.off('switchSkin', onSwitchSkin)
            signal.off('enterMarketArea', onEnterMarketArea)
            signal.off('enterPool', onEnterPool)
            signal.off('openMarkets', onEnterMarketArea)
            signal.off('openPool', onEnterPool)
        }
    }, [])

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
                <VillageHUD />

                {showMarkets && <MarketsPanel onClose={() => setShowMarkets(false)} />}
                {showPool && <PoolPanel onClose={() => setShowPool(false)} />}
            </div>}
            {showIntroScreen && <IntroScreen realmName={name} skin={skin} username={username} setShowIntroScreen={setShowIntroScreen}/>}    
        </AgoraVideoChatProvider>
    )
}
export default PlayClient