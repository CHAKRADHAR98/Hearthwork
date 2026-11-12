import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/auth/server'
import { Navbar } from '@/components/Navbar/Navbar'
import NotFound from '@/app/not-found'
import Link from 'next/link'
import MarketClient from './MarketClient'

export default async function IndividualMarketPage({
    params,
}: {
    params: { realmId: string; marketPubkey: string }
}) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value

    if (!token) return redirect('/signin')
    const user = await verifyToken(token)
    if (!user) return redirect('/signin')

    const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

    const realmResp = await fetch(`${API_URL}/realms/${params.realmId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store',
    })

    if (!realmResp.ok) {
        const err = await realmResp.json().catch(() => ({ message: 'Realm not found' }))
        return <NotFound specialMessage={err.message} />
    }

    const { realm } = await realmResp.json()

    if (!realm.market_enabled) {
        return <NotFound specialMessage='This space does not have a prediction market.' />
    }

    // Verify the marketPubkey belongs to this realm
    const marketsResp = await fetch(`${API_URL}/realms/${params.realmId}/markets`, {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store',
    })
    const marketsData = marketsResp.ok ? await marketsResp.json() : { markets: [] }
    const markets: { market_pubkey: string; market_name: string }[] = marketsData.markets ?? []
    const thisMarket = markets.find(m => m.market_pubkey === params.marketPubkey)

    if (!thisMarket) {
        return <NotFound specialMessage='Market not found for this space.' />
    }

    return (
        <div className='min-h-screen cyber-bg'>
            <Navbar />
            <div className='px-4 sm:px-8 pt-4'>
                <Link
                    href={`/market/${params.realmId}`}
                    className='font-orbitron text-xs text-gray-600 tracking-widest hover:text-cyber-purple transition-colors'
                >
                    ← All Markets
                </Link>
            </div>
            <MarketClient
                realmId={realm.id}
                realmName={realm.name}
                marketName={thisMarket.market_name}
                marketPubkey={params.marketPubkey}
                marketAdminPubkey={realm.market_admin_pubkey ?? null}
                userId={user.id}
                token={token}
            />
        </div>
    )
}
