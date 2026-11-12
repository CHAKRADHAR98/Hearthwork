import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/auth/server'
import { Navbar } from '@/components/Navbar/Navbar'
import NotFound from '@/app/not-found'
import Link from 'next/link'
import RealmMarketsClient from './RealmMarketsClient'

export default async function RealmMarketListPage({ params }: { params: { realmId: string } }) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) return redirect('/signin')
    const user = await verifyToken(token)
    if (!user) return redirect('/signin')

    const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

    // Fetch realm info and its markets in parallel
    const [realmResp, marketsResp] = await Promise.all([
        fetch(`${API_URL}/realms/${params.realmId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        }),
        fetch(`${API_URL}/realms/${params.realmId}/markets`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        }),
    ])

    if (!realmResp.ok) {
        const err = await realmResp.json().catch(() => ({ message: 'Realm not found' }))
        return <NotFound specialMessage={err.message} />
    }

    const { realm } = await realmResp.json()

    if (!realm.market_enabled) {
        return <NotFound specialMessage='This space does not have a prediction market.' />
    }

    const marketsData = marketsResp.ok ? await marketsResp.json() : { markets: [] }
    const markets: { market_pubkey: string; market_name: string; deployed_at: string }[] = marketsData.markets ?? []

    const isAdmin = user.id === realm.owner_id

    return (
        <div className='min-h-screen cyber-bg'>
            <Navbar />
            <div className='px-4 sm:px-8 py-8 max-w-4xl mx-auto flex flex-col gap-8'>

                {/* Header */}
                <div>
                    <p className='font-orbitron text-xs text-cyber-purple tracking-[0.4em] opacity-70 mb-1'>&gt; {realm.name}</p>
                    <h1 className='font-orbitron font-bold text-2xl text-white tracking-wider'>PREDICTION MARKETS</h1>
                    <div className='w-64 h-px bg-gradient-to-r from-cyber-purple/50 to-transparent mt-2' />
                </div>

                {/* Market list */}
                {markets.length > 0 ? (
                    <div className='flex flex-col gap-3'>
                        <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Active Markets</p>
                        {markets.map((m) => (
                            <Link
                                key={m.market_pubkey}
                                href={`/market/${params.realmId}/${m.market_pubkey}`}
                                className='border border-cyber-purple/30 bg-dark-panel/60 p-5 flex items-center justify-between group hover:border-cyber-purple/70 transition-all duration-200'
                                style={{ boxShadow: '0 0 20px rgba(153,69,255,0.05)' }}
                            >
                                <div className='flex flex-col gap-1'>
                                    <p className='font-orbitron font-bold text-white text-sm tracking-wide group-hover:text-cyber-purple transition-colors'>
                                        {m.market_name}
                                    </p>
                                    <p className='font-mono text-xs text-gray-600'>
                                        {m.market_pubkey.slice(0, 12)}...{m.market_pubkey.slice(-8)}
                                    </p>
                                </div>
                                <span className='font-orbitron text-xs text-cyber-cyan tracking-widest opacity-60 group-hover:opacity-100 transition-opacity'>
                                    ENTER →
                                </span>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className='border border-gray-700/30 bg-dark-panel/30 p-8 text-center'>
                        <p className='text-gray-500 font-orbitron text-xs tracking-widest'>NO MARKETS DEPLOYED YET</p>
                        {!isAdmin && (
                            <p className='text-gray-600 text-sm mt-2'>Check back later — the space admin has not deployed a market yet.</p>
                        )}
                    </div>
                )}

                {/* Deploy new market (admin only) */}
                {isAdmin && (
                    <RealmMarketsClient
                        realmId={realm.id}
                        realmName={realm.name}
                        marketAdminPubkey={realm.market_admin_pubkey ?? null}
                        token={token}
                    />
                )}
            </div>
        </div>
    )
}
