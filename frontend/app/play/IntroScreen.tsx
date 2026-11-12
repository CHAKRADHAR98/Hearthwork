'use client'
import React from 'react'
import BasicButton from '@/components/BasicButton'
import AnimatedCharacter from './SkinMenu/AnimatedCharacter'
import { useVideoChat } from '../hooks/useVideoChat'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'

type IntroScreenProps = {
    realmName: string
    skin: string
    username: string
    setShowIntroScreen: (show: boolean) => void
}

const IntroScreen:React.FC<IntroScreenProps> = ({ realmName, skin, username, setShowIntroScreen }) => {

    const src = '/sprites/characters/Character_' + skin + '.png'

    return (
        <main className='dark-gradient w-full h-screen flex flex-col items-center pt-28'>
            <h1 className='font-pixel text-4xl text-center px-4'>Welcome to <span className='text-hearth-honey'>{realmName}</span></h1>
            <p className='mt-2 text-hearth-sand text-center px-4'>Check your camera, then step inside. The Market Square is just north of the entrance.</p>
            <section className='flex flex-col md:flex-row mt-16 md:mt-24 items-center gap-10 md:gap-24'>
                <div className='flex flex-col items-center gap-4'>
                    <div className='aspect-video w-[337px] h-[227px] bg-black rounded-xl border-2 border-hearth-line overflow-hidden'>
                        <LocalVideo/>
                    </div>
                    <MicAndCameraButtons/>
                </div>
                <div className='flex flex-col items-center gap-4'>
                    <div className='flex flex-row items-center'>
                        <AnimatedCharacter src={src} noAnimation/>
                        <p className='relative top-4'>{username}</p>
                    </div>
                    <BasicButton className='py-0 px-32 w-[250px]' onClick={() => setShowIntroScreen(false)}>
                        Join
                    </BasicButton>
                </div>
            </section>
        </main>
    )
}

export default IntroScreen

function LocalVideo() {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    return (
        <div className='w-full h-full bg-[#111111] grid place-items-center relative'>
            <div id='local-video' className='w-full h-full'>

            </div>
            <div className='absolute select-none text-sm text-white items-center flex flex-col gap-1'>
                {isMicMuted && isCameraMuted && <p>You are muted</p>}
                {isCameraMuted && <p>Your camera is off</p>}
            </div>
            {isMicMuted && !isCameraMuted && <p className='absolute bottom-2 right-3 select-none text-sm text-white bg-black bg-opacity-50 p-1 px-2 rounded-full'>
                You are muted
            </p>}
        </div>
    )
}