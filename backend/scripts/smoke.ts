// End-to-end smoke test: registers a player, opens an office, plays in the village. Usage: npx tsx scripts/smoke.ts
import { io } from 'socket.io-client'
import fs from 'fs'
import path from 'path'

const API = process.env.API ?? 'http://localhost:3001'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
    const name = 'tester' + Math.floor(Math.random() * 1e5)
    const reg: any = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: 'secret123' }) })).json()
    const auth = { authorization: `Bearer ${reg.token}`, 'content-type': 'application/json' }
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/utils/defaultmap.json'), 'utf8'))
    const realm: any = await (await fetch(`${API}/realms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Smoke office', map_data: map }) })).json()
    const realmRow = realm.realm ?? realm
    console.log('realm', realmRow.id)
    const s = io(API, { extraHeaders: { authorization: `Bearer ${reg.token}` }, query: { uid: reg.user.id } })
    const call = (ev: string, data: any = {}) => new Promise<any>(r => s.emit(ev, data, r))
    s.on('village:chainTx', (t: any) => console.log('  ⛓️ ', t.ok ? 'ok ' : 'FAIL', t.method, '-', t.summary.slice(0, 90), t.url ?? ''))
    s.on('village:say', (m: any) => console.log(`  💬 ${m.shopId}: ${m.text}`))
    await new Promise<void>(r => s.on('connect', () => r()))
    s.emit('joinRealm', { realmId: realmRow.id, shareId: realmRow.share_id })
    await new Promise<void>(r => s.on('joinedRealm', () => r()))
    const j = await call('village:join')
    console.log('joined village. day', j.state.day, 'wallet', j.wallet.accountId, j.wallet.balances, 'ai', j.ai, 'chain', j.chain.enabled)
    console.log('gather mine:', (await call('village:gather', { spot: 'mine' })).text)
    console.log('gather mine again:', (await call('village:gather', { spot: 'mine' })).error)
    const iron = (await call('village:wallet')).wallet.balances.iron
    console.log('sell iron to smith:', JSON.stringify(await call('village:sell', { shopId: 'smith', good: 'iron', qty: iron })))
    const h1 = await call('village:haggle', { shopId: 'baker', side: 'buy', good: 'bread', qty: 2, message: "Hi Mira! I'll give you 5 each for 2 loaves" })
    console.log('haggle:', h1.reply, '| offer', h1.offer, 'accepted', h1.accepted, 'src', h1.source)
    console.log('accept deal:', JSON.stringify(await call('village:buy', { shopId: 'baker', good: 'bread', qty: 2, dealId: h1.dealId })))
    const st = j.state
    console.log('jobs:', st.jobs.map((x: any) => `${x.shopId}:${x.qty} ${x.good} for ${x.reward}`))
    console.log('invest in tailor:', JSON.stringify(await call('village:invest', { shopId: 'tailor', amount: 5 })))
    console.log('fast forward:', JSON.stringify(await call('village:fastForward', { days: 1 })))
    await sleep(Number(process.env.WAIT ?? 25000))
    const w = await call('village:wallet')
    console.log('final wallet', w.wallet.balances)
    s.close()
}
main().catch(e => { console.error(e); process.exit(1) })
