import NotFound from '@/app/not-found'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/auth/server'
import Editor from '../Editor'

export default async function RealmEditor({ params }: { params: { id: string } }) {
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
            <Editor realmData={realm.map_data}/>
        </div>
    )
}