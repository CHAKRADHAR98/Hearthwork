import React from 'react'
import NotFound from '@/app/not-found'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/auth/server'
import PlayClient from '../PlayClient'

export default async function Play({ params, searchParams }: { params: { id: string }, searchParams: { shareId: string } }) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
        return redirect('/signin')
    }

    const user = await verifyToken(token)
    if (!user) {
        return redirect('/signin')
    }

    // Fetch realm data from backend API
    const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const response = await fetch(`${API_URL}/realms/${params.id}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store'
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to load realm' }))
        return <NotFound specialMessage={errorData.message}/>
    }

    const { realm } = await response.json()

    // Update visited realms if shared
    if (searchParams.shareId && realm.owner_id !== user.id) {
        await fetch(`${API_URL}/realms/visit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ shareId: searchParams.shareId }),
        }).catch(() => {})
    }

    return (
        <PlayClient
            mapData={realm.map_data}
            username={user.username}
            access_token={token}
            realmId={params.id}
            uid={user.id}
            shareId={searchParams.shareId || ''}
            initialSkin={user.skin || '009'}
            name={realm.name}
            marketEnabled={realm.market_enabled ?? false}
            marketPubkey={realm.market_pubkey ?? null}
        />
    )
}