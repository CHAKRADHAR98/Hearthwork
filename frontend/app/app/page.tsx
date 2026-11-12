import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Navbar } from '@/components/Navbar/Navbar'
import RealmsMenu from './RealmsMenu/RealmsMenu'
import { verifyToken } from '@/utils/auth/server'

export default async function App() {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
        return redirect('/signin')
    }

    const user = await verifyToken(token)
    if (!user) {
        return redirect('/signin')
    }

    // Fetch realms from PostgreSQL
    const { getOwnedRealms, getVisitedRealms } = await import('@/utils/db/realms')
    const ownedRealms = await getOwnedRealms(user.id)
    const visitedRealms = await getVisitedRealms(user.id)

    const realms = [
        ...ownedRealms,
        ...visitedRealms.map(r => ({ ...r, shared: true }))
    ]

    return (
        <div className='min-h-screen cyber-bg'>
            <Navbar />
            <div className='pt-8 px-4 sm:px-8'>
                <h1 className='font-pixel text-3xl text-hearth-parchment'>Your offices</h1>
                <p className='text-hearth-sand mt-1'>Each office has its own Market Square, prediction markets and team pool.</p>
            </div>
            <RealmsMenu realms={realms} errorMessage=''/>
        </div>
    )
}