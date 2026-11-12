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
                <div className='flex items-center gap-3'>
                    <span className='text-cyber-cyan font-orbitron text-xs tracking-[0.4em] opacity-60'>&gt;</span>
                    <h1 className='font-orbitron font-bold text-2xl tracking-wider text-white'>YOUR SPACES</h1>
                </div>
                <div className='w-48 h-px bg-gradient-to-r from-cyber-cyan/50 to-transparent mt-2' />
            </div>
            <RealmsMenu realms={realms} errorMessage=''/>
        </div>
    )
}