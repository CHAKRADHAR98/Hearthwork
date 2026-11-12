import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ManageChild from '../ManageChild'
import NotFound from '../../not-found'
import { verifyToken } from '@/utils/auth/server'

export default async function Manage({ params }: { params: { id: string } }) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
        return redirect('/signin')
    }

    const user = await verifyToken(token)
    if (!user) {
        return redirect('/signin')
    }

    // Fetch realm data from backend
    const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const response = await fetch(`${API_URL}/realms/${params.id}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store'
    })

    if (!response.ok) {
        return <NotFound />
    }

    const { realm } = await response.json()

    return (
        <div>
            <ManageChild
                realmId={realm.id}
                startingShareId={realm.share_id}
                startingOnlyOwner={realm.only_owner}
                startingName={realm.name}
                marketEnabled={realm.market_enabled ?? false}
                marketAdminPubkey={realm.market_admin_pubkey ?? null}
                marketPubkey={realm.market_pubkey ?? null}
            />
        </div>
    )
}