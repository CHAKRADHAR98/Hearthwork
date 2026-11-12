// Prediction market + team pool on NEAR testnet, end to end. Usage: npx tsx scripts/finance-smoke.ts
import { io } from 'socket.io-client'
import fs from 'fs'
import path from 'path'
const API = process.env.API ?? 'http://localhost:3001'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function main() {
    const name = 'fin' + Math.floor(Math.random() * 1e5)
    const reg: any = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: 'secret123' }) })).json()
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/utils/defaultmap.json'), 'utf8'))
    const realm: any = (await (await fetch(`${API}/realms`, { method: 'POST', headers: { authorization: `Bearer ${reg.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Fin office', map_data: map }) })).json()).realm
    const s = io(API, { extraHeaders: { authorization: `Bearer ${reg.token}` }, query: { uid: reg.user.id } })
    const call = (ev: string, data: any = {}) => new Promise<any>(r => s.emit(ev, data, r))
    await new Promise<void>(r => s.on('connect', () => r()))
    s.emit('joinRealm', { realmId: realm.id, shareId: realm.share_id })
    await new Promise<void>(r => s.on('joinedRealm', () => r()))
    await call('village:join')
    // wait for the wallet account + welcome grant to land
    for (let i = 0; i < 30; i++) { const l = await call('markets:list'); if (Number(l.walletBalance) > 0.01) { console.log('wallet', l.account, l.walletBalance, 'NEAR'); break } await sleep(1000) }
    const c = await call('markets:create', { question: 'Will we ship v2 by Friday?', hours: 0.05, liquidity: 20 }); console.log('create', c)
    console.log('quote', await call('markets:quote', { marketId: c.marketId, isYes: true, shares: 5 }))
    console.log('buy YES', await call('markets:buy', { marketId: c.marketId, isYes: true, shares: 5 }))
    console.log('sell 1 YES', await call('markets:sell', { marketId: c.marketId, isYes: true, shares: 1 }))
    const l = await call('markets:list'); const m = l.markets[0]
    console.log('market', m.name, 'prices', m.prices, 'position', m.position?.yes_shares, 'balance', l.bettorBalance)
    console.log('pool deposit', await call('pool:deposit', { amount: 0.01 }))
    console.log('pool', JSON.stringify((await call('pool:get')).pool))
    console.log('pool withdraw', await call('pool:withdraw', { amount: 0.005 }))
    console.log('waiting for market deadline...'); await sleep(185000)
    console.log('resolve', await call('markets:resolve', { marketId: c.marketId, outcome: 'Yes' }))
    console.log('claim', await call('markets:claim', { marketId: c.marketId }))
    console.log('withdraw', await call('markets:withdraw'))
    console.log('final', (await call('markets:list')).walletBalance, 'NEAR in wallet')
    s.close()
}
main().catch(e => { console.error(e); process.exit(1) })
