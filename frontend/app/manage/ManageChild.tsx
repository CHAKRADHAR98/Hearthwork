'use client'
import React, { useState } from 'react'
import Dropdown from '@/components/Dropdown'
import BasicButton from '@/components/BasicButton'
import { getToken } from '@/utils/auth'
import { toast } from 'react-toastify'
import revalidate from '@/utils/revalidate'
import { useModal } from '../hooks/useModal'
import { Copy } from '@phosphor-icons/react'
import { v4 as uuidv4 } from 'uuid'
import BasicInput from '@/components/BasicInput'
import { removeExtraSpaces } from '@/utils/removeExtraSpaces'

type ManageChildProps = {
    realmId: string
    startingShareId: string
    startingOnlyOwner: boolean
    startingName: string
    marketEnabled: boolean
    marketAdminPubkey: string | null
    marketPubkey: string | null
}

const ManageChild:React.FC<ManageChildProps> = ({ realmId, startingShareId, startingOnlyOwner, startingName, marketEnabled, marketAdminPubkey, marketPubkey: initialMarketPubkey }) => {

    const [selectedTab, setSelectedTab] = useState(0)
    const [shareId, setShareId] = useState(startingShareId)
    const [onlyOwner, setOnlyOwner] = useState(startingOnlyOwner)
    const [name, setName] = useState(startingName)
    const [marketPubkey, setMarketPubkey] = useState(initialMarketPubkey ?? '')
    const [savingMarket, setSavingMarket] = useState(false)
    const { setModal, setLoadingText } = useModal()

    async function save() {
        if (name.trim() === '') {
            toast.error('Name cannot be empty!')
            return
        }

        const token = getToken()
        if (!token) {
            toast.error('Not authenticated')
            return
        }

        setModal('Loading')
        setLoadingText('Saving...')

        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

        try {
            const response = await fetch(`${API_URL}/realms/${realmId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    only_owner: onlyOwner,
                    name: name,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                toast.error(error.message || 'Failed to save')
            } else {
                toast.success('Saved!')
            }
        } catch (error) {
            toast.error('Failed to save')
        }

        revalidate('/manage/[id]')
        setModal('None')
    }

    function copyLink() {
        const link = process.env.NEXT_PUBLIC_BASE_URL + '/play/' + realmId + '?shareId=' + shareId
        navigator.clipboard.writeText(link)
        toast.success('Link copied!')
    }

    async function generateNewLink() {
        const token = getToken()
        if (!token) {
            toast.error('Not authenticated')
            return
        }

        setModal('Loading')
        setLoadingText('Generating new link...')

        const newShareId = uuidv4()
        
        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

        try {
            const response = await fetch(`${API_URL}/realms/${realmId}/share`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    share_id: newShareId,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                toast.error(error.message || 'Failed to generate new link')
            } else {
                setShareId(newShareId)
                const link = process.env.NEXT_PUBLIC_BASE_URL + '/play/' + realmId + '?shareId=' + newShareId
                navigator.clipboard.writeText(link)
                toast.success('New link copied!')
            }
        } catch (error) {
            toast.error('Failed to generate new link')
        }

        revalidate('/manage/[id]')
        setModal('None')
    }

    async function saveMarketPubkey() {
        if (!marketPubkey.trim()) {
            toast.error('Please enter the on-chain market account address.')
            return
        }

        const token = getToken()
        if (!token) {
            toast.error('Not authenticated')
            return
        }

        setSavingMarket(true)

        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

        try {
            const response = await fetch(`${API_URL}/realms/${realmId}/market`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ market_pubkey: marketPubkey.trim() }),
            })

            if (!response.ok) {
                const error = await response.json()
                toast.error(error.message || 'Failed to save market address')
            } else {
                revalidate('/manage/[id]')
                toast.success('Market address saved! Players can now access your prediction market.')
            }
        } catch (error) {
            toast.error('Failed to save market address')
        }

        setSavingMarket(false)
    }

    function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
        const value = removeExtraSpaces(e.target.value)
        setName(value)
    }

    return (
        <div className='flex flex-col items-center pt-24'>
            <div className='flex flex-row gap-8 relative'>
                <div className='flex flex-col h-[500px] w-[200px] border-white border-r-2 pr-4 gap-2'>
                    <h1 className={`${selectedTab === 0 ? 'font-bold underline' : ''} cursor-pointer`} onClick={() => setSelectedTab(0)}>General</h1>
                    <h1 className={`${selectedTab === 1 ? 'font-bold underline' : ''} cursor-pointer`} onClick={() => setSelectedTab(1)}>Sharing Options</h1>
                    <h1 className={`${selectedTab === 2 ? 'font-bold underline' : ''} cursor-pointer`} onClick={() => setSelectedTab(2)}>Prediction Market</h1>
                </div>
                <div className='flex flex-col w-[300px]'>
                    {selectedTab === 0 && (
                        <div className='flex flex-col gap-2'>
                            Name
                            <BasicInput value={name} onChange={onNameChange} maxLength={32}/>
                        </div>
                    )}
                    {selectedTab === 1 && (
                        <div className='flex flex-col gap-2'>
                            <BasicButton className='flex flex-row items-center gap-2 text-sm max-w-max' onClick={copyLink}>
                                Copy Link <Copy />
                            </BasicButton>
                            <BasicButton className='flex flex-row items-center gap-2 text-sm max-w-max' onClick={generateNewLink}>
                                Generate New Link <Copy />
                            </BasicButton>
                        </div>
                    )}
                    {selectedTab === 2 && (
                        <div className='flex flex-col gap-4'>
                            {!marketEnabled ? (
                                <p className='text-sm text-gray-400'>
                                    Prediction market was not enabled for this realm. Create a new realm and check &quot;Enable Prediction Market&quot; to set one up.
                                </p>
                            ) : (
                                <>
                                    <div className='flex flex-col gap-1'>
                                        <p className='text-xs text-gray-400 uppercase tracking-widest'>Status</p>
                                        {initialMarketPubkey
                                            ? <p className='text-sm text-green-400'>✓ Market deployed</p>
                                            : <p className='text-sm text-yellow-400'>⚠ Market not yet deployed on-chain</p>
                                        }
                                    </div>

                                    <div className='flex flex-col gap-1'>
                                        <p className='text-xs text-gray-400 uppercase tracking-widest'>Admin Wallet</p>
                                        <p className='text-xs font-mono break-all'>{marketAdminPubkey ?? '—'}</p>
                                    </div>

                                    {initialMarketPubkey && (
                                        <div className='flex flex-col gap-1'>
                                            <p className='text-xs text-gray-400 uppercase tracking-widest'>Market Account</p>
                                            <p className='text-xs font-mono break-all'>{initialMarketPubkey}</p>
                                        </div>
                                    )}

                                    {!initialMarketPubkey && (
                                        <div className='flex flex-col gap-2'>
                                            <p className='text-xs text-gray-400'>
                                                After running <code className='bg-gray-800 px-1'>anchor run create_market</code> with your wallet, paste the resulting market account address below.
                                            </p>
                                            <BasicInput
                                                value={marketPubkey}
                                                onChange={(e) => setMarketPubkey(e.target.value)}
                                                label='Market Account Address'
                                            />
                                            <BasicButton
                                                onClick={saveMarketPubkey}
                                                disabled={savingMarket || !marketPubkey.trim()}
                                                className='text-sm max-w-max'
                                            >
                                                {savingMarket ? 'Saving...' : 'Save Market Address'}
                                            </BasicButton>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
                {selectedTab !== 2 && (
                    <BasicButton className='absolute bottom-[-50px] right-0' onClick={save}>
                        Save
                    </BasicButton>
                )}
            </div>
        </div>
    )
}

export default ManageChild