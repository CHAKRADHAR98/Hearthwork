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

    async function createRealm() {
        const token = getToken()
        const user  = getUser()
        if (!token || !user) return toast.error('Not authenticated')

        setLoading(true)
        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
        try {
            const body = {
                name:     realmName,
                map_data: useDefaultMap ? defaultMap : null,
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
            revalidate('/app')
            setModal('None')
            toast.success('Your office is ready!')
            router.push(`/editor/${data.realm.id}`)
        } catch {
            toast.error('Failed to create realm')
        }
        setLoading(false)
    }

    const canCreate = realmName.length > 0 && !loading

    return (
        <Modal open={modal === 'Create Realm'} closeOnOutsideClick>
            <div className='flex flex-col items-center p-4 w-[420px] gap-4'>
                <h1 className='font-pixel text-3xl'>Create an office</h1>
                <p className='text-sm text-hearth-sand -mt-2 text-center'>Comes with a Market Square, five shopkeepers, prediction markets and a team pool.</p>

                <BasicInput
                    label='Office name'
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

                <BasicButton
                    disabled={!canCreate}
                    onClick={createRealm}
                    className='text-lg w-[340px]'
                >
                    {loading ? 'Creating...' : 'Create office'}
                </BasicButton>
            </div>
        </Modal>
    )
}

export default CreateRealmModal
