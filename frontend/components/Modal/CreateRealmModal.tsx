'use client'
import React, { useState } from 'react'
import Modal from './Modal'
import { useModal } from '@/app/hooks/useModal'
import BasicButton from '../BasicButton'
import BasicInput from '../BasicInput'
import { getToken, getUser } from '@/utils/auth'
import { toast } from 'react-toastify'
import { useRouter } from 'next/navigation'
import revalidate from '@/utils/revalidate'
import { removeExtraSpaces } from '@/utils/removeExtraSpaces'
import defaultMap from '@/utils/defaultmap.json'

const CreateRealmModal: React.FC = () => {
    const { modal, setModal } = useModal()
    const router = useRouter()

    const [realmName,        setRealmName]        = useState<string>('')
    const [useDefaultMap,    setUseDefaultMap]    = useState<boolean>(true)
    const [loading,          setLoading]          = useState<boolean>(false)
    const [enableMarket,     setEnableMarket]     = useState<boolean>(false)
    const [walletPubkey,     setWalletPubkey]     = useState<string>('')
    const [connectingWallet, setConnectingWallet] = useState<boolean>(false)

    async function connectWallet() {
        const solana = (window as any).solana
        if (!solana) {
            toast.error('No Solana wallet found. Please install Phantom or Solflare.')
            return
        }
        setConnectingWallet(true)
        try {
            await solana.connect()
            setWalletPubkey(solana.publicKey.toString())
            toast.success('Wallet connected!')
        } catch {
            toast.error('Wallet connection cancelled.')
        }
        setConnectingWallet(false)
    }

    function handleEnableMarketToggle(e: React.ChangeEvent<HTMLInputElement>) {
        setEnableMarket(e.target.checked)
        if (!e.target.checked) setWalletPubkey('')
    }

    async function createRealm() {
        const token = getToken()
        const user  = getUser()
        if (!token || !user) return toast.error('Not authenticated')

        if (enableMarket && !walletPubkey) {
            return toast.error('Please connect your Solana wallet.')
        }

        setLoading(true)
        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
        try {
            const body: Record<string, any> = {
                name:     realmName,
                map_data: useDefaultMap ? defaultMap : null,
            }
            if (enableMarket) {
                body.market_enabled      = true
                body.market_admin_pubkey = walletPubkey
            }

            const response = await fetch(`${API_URL}/realms`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            })

            if (!response.ok) {
                const err = await response.json()
                toast.error(err.message || 'Failed to create realm')
                setLoading(false)
                return
            }

            const data = await response.json()
            setRealmName('')
            setWalletPubkey('')
            setEnableMarket(false)
            revalidate('/app')
            setModal('None')
            toast.success('Your space has been created!')
            router.push(`/editor/${data.realm.id}`)
        } catch {
            toast.error('Failed to create realm')
        }
        setLoading(false)
    }

    const canCreate = realmName.length > 0 && !loading && (!enableMarket || walletPubkey)

    return (
        <Modal open={modal === 'Create Realm'} closeOnOutsideClick>
            <div className='flex flex-col items-center p-4 w-[420px] gap-4'>
                <h1 className='text-2xl'>Create a Space</h1>

                <BasicInput
                    label='Space Name'
                    className='w-[340px]'
                    value={realmName}
                    onChange={e => setRealmName(removeExtraSpaces(e.target.value))}
                    maxLength={32}
                />

                <div className='flex items-center gap-2 w-[340px]'>
                    <input
                        type='checkbox' id='useDefaultMap'
                        checked={useDefaultMap}
                        onChange={e => setUseDefaultMap(e.target.checked)}
                    />
                    <label htmlFor='useDefaultMap'>Use starter map</label>
                </div>

                {/* Prediction Market section */}
                <div className='flex flex-col gap-3 w-[340px] border border-cyber-purple/40 p-4 rounded bg-dark-panel/60'>
                    <div className='flex items-center gap-2'>
                        <input
                            type='checkbox' id='enableMarket'
                            checked={enableMarket}
                            onChange={handleEnableMarketToggle}
                        />
                        <label htmlFor='enableMarket' className='text-sm font-orbitron tracking-wide text-cyber-purple'>
                            Enable Prediction Market
                        </label>
                    </div>

                    {enableMarket && (
                        <div className='flex flex-col gap-3'>
                            <p className='text-xs text-gray-400'>
                                Connect your Solana wallet. It will be the admin of this space&apos;s prediction market.
                                You can deploy the market from the market page after creation.
                            </p>
                            {walletPubkey ? (
                                <div className='flex flex-col gap-1'>
                                    <p className='text-xs text-gray-400'>Admin wallet:</p>
                                    <p className='text-xs font-mono text-neon-green break-all'>{walletPubkey}</p>
                                    <button
                                        onClick={() => setWalletPubkey('')}
                                        className='text-xs text-gray-500 underline text-left'
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <BasicButton onClick={connectWallet} disabled={connectingWallet} className='text-sm'>
                                    {connectingWallet ? 'Connecting...' : 'Connect Wallet'}
                                </BasicButton>
                            )}
                        </div>
                    )}
                </div>

                <BasicButton
                    disabled={!canCreate}
                    onClick={createRealm}
                    className='text-lg w-[340px]'
                >
                    {loading ? 'Creating...' : 'Create Space'}
                </BasicButton>
            </div>
        </Modal>
    )
}

export default CreateRealmModal
