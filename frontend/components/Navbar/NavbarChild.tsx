'use client'
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PlusCircleIcon } from '@heroicons/react/24/outline'
import { useModal } from '@/app/hooks/useModal'
import BasicButton from '../BasicButton'

type NavbarChildProps = {
    name: string,
    avatar_url?: string
}

export const NavbarChild:React.FC<NavbarChildProps> = ({ name, avatar_url }) => {

    const { setModal } = useModal()

    return (
        <div className='h-16'>
            <div className='w-full fixed bg-dark-panel border-b border-cyber-cyan/20 flex flex-row items-center p-2 pl-6 justify-between z-10'>
                {/* Brand + Nav */}
                <div className='flex items-center gap-4'>
                    <Link href='/app'>
                        <Image
                            src='/hearthwork-logo.png'
                            alt='Hearthwork'
                            width={40}
                            height={40}
                            className='object-contain'
                        />
                    </Link>
                    <div className='hidden sm:flex flex-row items-center gap-3 ml-4'>
                        <BasicButton onClick={() => setModal('Create Realm')} className='flex flex-row items-center gap-2 py-2 text-xs'>
                            New office
                            <PlusCircleIcon className='h-4'/>
                        </BasicButton>
                    </div>
                </div>
                {/* User area */}
                <div
                    className='flex flex-row items-center gap-3 cursor-pointer select-none px-3 py-1 border border-transparent hover:border-cyber-cyan/30 hover:bg-cyber-cyan/5 transition-all duration-200 rounded-sm'
                    onClick={() => setModal('Account Dropdown')}
                >
                    <p className='text-gray-400 text-sm font-orbitron tracking-wider'>{name}</p>
                    <div className='relative'>
                        <Image
                            alt='avatar'
                            src={avatar_url || '/default-avatar.png'}
                            width={36}
                            height={36}
                            className='aspect-square rounded-full border border-cyber-cyan/40'
                        />
                        <div className='absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-neon-green rounded-full border-2 border-dark-panel' />
                    </div>
                </div>
            </div>
        </div>
    )
}