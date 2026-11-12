import { DotsThreeVertical, Link as LinkIcon, SignIn } from '@phosphor-icons/react'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useModal } from '@/app/hooks/useModal'
import Link from 'next/link'
import { toast } from 'react-toastify'

type DesktopRealmItemProps = {
    name: string,
    id: string,
    shareId: string,
    shared?: boolean,
    playerCount?: number
}

const DesktopRealmItem:React.FC<DesktopRealmItemProps> = ({ name, id, shareId, shared, playerCount }) => {
    
    const [showMenu, setShowMenu] = useState<boolean>(false)  
    const router = useRouter()
    const menuRef = useRef<HTMLDivElement>(null)
    const dotsRef = useRef<HTMLDivElement>(null)
    const { setRealmToDelete, setModal } = useModal()

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node) && dotsRef.current && !dotsRef.current.contains(event.target as Node)) {
                setShowMenu(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    function handleDotsClick() {
        setShowMenu(!showMenu)
    }

    function handleDelete() {
        setRealmToDelete({ name, id })
        setModal('Delete Realm')
    }

    function getLink() {
        if (shared) {
            return `/play/${id}?shareId=${shareId}`
        } else {
            return `/play/${id}`
        }
    }

    function copyShareLink() {
        navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_BASE_URL}/play/${id}?shareId=${shareId}`)
        toast.success('Link copied!')
    }

    return (
        <div className='relative select-none group'>
            <Link href={getLink()}>
                <div className='w-full aspect-video relative border border-panel-border overflow-hidden transition-all duration-300 group-hover:border-cyber-cyan/50 group-hover:shadow-[0_0_20px_rgba(0,245,255,0.12)]'>
                    {/* Dark base */}
                    <div className='absolute inset-0 bg-dark-panel' />

                    {/* Thumbnail image */}
                    <img
                        src='/thumbnail.png'
                        className='absolute z-10 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300'
                        style={{imageRendering: 'pixelated'}}
                    />

                    {/* Hover overlay */}
                    <div className='absolute inset-0 grid place-items-center z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/50'>
                        <div className='flex items-center gap-2 border border-cyber-cyan/60 px-4 py-2 bg-dark-panel/80'>
                            <SignIn className='w-4 h-4 text-cyber-cyan' />
                            <span className='text-cyber-cyan text-xs font-orbitron tracking-widest uppercase'>Enter</span>
                        </div>
                    </div>

                    {/* Player count */}
                    {playerCount != null && (
                        <div className='pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 bg-dark-panel/90 border border-panel-border px-2 py-1 z-30'>
                            <div className='w-2 h-2 rounded-full bg-neon-green shadow-[0_0_6px_rgba(20,241,149,0.8)]' />
                            <p className='text-xs text-gray-300 font-orbitron'>{playerCount}</p>
                        </div>
                    )}

                    {/* Corner accent */}
                    <div className='absolute top-0 right-0 w-4 h-4 border-t border-r border-cyber-cyan/20 group-hover:border-cyber-cyan/60 transition-colors duration-300 z-30' />
                </div>
            </Link>

            <div className='mt-2 flex flex-row justify-between items-center'>
                <p className='text-sm font-orbitron text-gray-400 tracking-wider group-hover:text-cyber-cyan transition-colors duration-200'>{name}</p>
                {!shared && (
                    <div className='flex flex-row'>
                        <LinkIcon className='h-7 w-7 cursor-pointer text-gray-600 hover:text-cyber-cyan p-1 transition-colors duration-200' onClick={copyShareLink}/>
                        <div ref={dotsRef}>
                            <DotsThreeVertical weight='bold' className='h-7 w-7 cursor-pointer text-gray-600 hover:text-cyber-cyan p-1 transition-colors duration-200' onClick={handleDotsClick}/>
                        </div>
                    </div>
                )}
            </div>

            {showMenu && (
                <div className='absolute w-40 right-0 bg-dark-panel border border-panel-border flex flex-col z-10' ref={menuRef}>
                    <button className='py-2.5 px-4 text-left text-xs text-gray-400 hover:text-cyber-cyan hover:bg-cyber-cyan/5 transition-colors duration-150 font-orbitron tracking-wider uppercase border-b border-panel-border' onClick={() => router.push(`/editor/${id}`)}>
                        Edit Map
                    </button>
                    <button className='py-2.5 px-4 text-left text-xs text-gray-400 hover:text-cyber-cyan hover:bg-cyber-cyan/5 transition-colors duration-150 font-orbitron tracking-wider uppercase border-b border-panel-border' onClick={() => router.push(`/manage/${id}`)}>
                        Manage
                    </button>
                    <button className='py-2.5 px-4 text-left text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-colors duration-150 font-orbitron tracking-wider uppercase' onClick={handleDelete}>
                        Delete
                    </button>
                </div>
            )}
        </div>
    )
}

export default DesktopRealmItem