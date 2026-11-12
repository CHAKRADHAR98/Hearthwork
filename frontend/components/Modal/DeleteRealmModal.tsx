'use client'
import React, { useState, useEffect } from 'react'
import Modal from './Modal'
import { useModal } from '@/app/hooks/useModal'
import { getToken } from '@/utils/auth'
import { toast } from 'react-toastify'
import revalidate from '@/utils/revalidate'
import BasicInput from '../BasicInput'
import { removeExtraSpaces } from '@/utils/removeExtraSpaces'

type DeleteRealmModalProps = {
    
}

const DeleteRealmModal:React.FC<DeleteRealmModalProps> = () => {
    
    const { modal, realmToDelete } = useModal()
    const [loading, setLoading] = useState<boolean>(false)
    const [input, setInput] = useState<string>('')

    const onClickDelete = async () => {
        const token = getToken()
        if (!token) {
            toast.error('Not authenticated')
            return
        }

        setLoading(true)

        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

        try {
            const response = await fetch(`${API_URL}/realms/${realmToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            if (!response.ok) {
                const error = await response.json()
                toast.error(error.message || 'Failed to delete realm')
                setLoading(false)
                return
            }

            revalidate('/app')
            window.location.reload()
        } catch (error) {
            toast.error('Failed to delete realm')
            setLoading(false)
        }
    }

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const value = removeExtraSpaces(e.target.value)
        setInput(value)
    }

    function getDisabled() {
        return input.trim() !== realmToDelete.name.trim()
    }

    useEffect(() => {
        setInput('')
    }, [modal])

    return (
        <Modal open={modal === 'Delete Realm'} closeOnOutsideClick>
            <div className='p-2 flex flex-col items-center gap-2'>
                <h1 className='text-center'>Are you sure you want to delete <span className='text-red-500 select-none'>{realmToDelete.name}</span>? It will be gone forever!</h1>
                <h2 className='text-center'>Type <span className='text-red-500 select-none'>{realmToDelete.name}</span> to confirm.</h2>
                <BasicInput className='h-8 p-2 bg-light-secondary border-none text-white' onChange={onChange} value={input}/>
                <button className={`${loading ? 'pointer-events-none' : ''} ${getDisabled() ? 'opacity-70 pointer-events-none' : ''} 'px-2 py-1 rounded-md outline-none p-2 bg-red-500 hover:bg-red-600 animate-colors text-white cursor-pointer`} disabled={getDisabled()} onClick={onClickDelete}>Delete</button>
            </div>
        </Modal>
    )
}

export default DeleteRealmModal