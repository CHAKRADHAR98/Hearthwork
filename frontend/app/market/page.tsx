import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/auth/server'
import { Navbar } from '@/components/Navbar/Navbar'
import Link from 'next/link'
import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline'

export default async function MarketListPage() {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) return redirect('/signin')
    const user = await verifyToken(token)
    if (!user) return redirect('/signin')

    const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    let realms: { id: string; name: string; share_id: string; market_pubkey: string | null }[] = []

    try {
        const resp = await fetch(`${API_URL}/realms/markets`, { cache: 'no-store' })
        if (resp.ok) {
            const data = await resp.json()
            realms = data.realms ?? []
        }
    } catch {}

    return (
        <div className='min-h-screen cyber-bg'>
            <Navbar />
            <div className='pt-8 px-4 sm:px-8 max-w-4xl mx-auto'>
                <div className='flex items-center gap-3 mb-1'>
                    <span className='text-cyber-purple font-orbitron text-xs tracking-[0.4em] opacity-60'>&gt;</span>
                    <h1 className='font-orbitron font-bold text-2xl tracking-wider text-white'>PREDICTION MARKETS</h1>
                </div>
                <div className='w-64 h-px bg-gradient-to-r from-cyber-purple/50 to-transparent mb-8' />

                {realms.length === 0 ? (
                    <div className='border border-cyber-purple/20 bg-dark-panel/40 p-8 text-center'>
                        <p className='text-gray-500 font-orbitron text-sm tracking-widest'>NO MARKETS FOUND</p>
                        <p className='text-gray-600 text-xs mt-2'>Create a space with prediction market enabled to get started.</p>
                    </div>
                ) : (
                    <div className='flex flex-col gap-4'>
                        {realms.map(realm => (
                            <Link key={realm.id} href={`/market/${realm.id}`}>
                                <div className='border border-cyber-purple/30 bg-dark-panel/60 p-5 hover:border-cyber-purple/70 hover:bg-cyber-purple/5 transition-all duration-200 cursor-pointer group'
                                    style={{ boxShadow: '0 0 0 transparent' }}
                                >
                                    <div className='flex items-center justify-between'>
                                        <div className='flex flex-col gap-1'>
                                            <p className='font-orbitron font-bold text-white tracking-wider group-hover:text-cyber-purple transition-colors'>
                                                {realm.name}
                                            </p>
                                            <div className='flex items-center gap-2 mt-1'>
                                                {realm.market_pubkey ? (
                                                    <span className='text-xs font-orbitron text-neon-green tracking-widest'>● ACTIVE</span>
                                                ) : (
                                                    <span className='text-xs font-orbitron text-yellow-500/70 tracking-widest'>● PENDING SETUP</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className='flex items-center gap-2 text-cyber-purple/60 group-hover:text-cyber-purple transition-colors'>
                                            <ArrowTrendingUpIcon className='h-5 w-5' />
                                            <span className='font-orbitron text-xs tracking-widest'>ENTER →</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
