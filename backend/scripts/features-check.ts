// Offline check of the Market Square features (no server, no chain): `npm run check:features`
//   requests board · rare finds + lucky streak · tools · hats · team project · landmarks on the map
import assert from 'assert'
import { Village } from '../src/village/village'
import { Wallets } from '../src/village/wallets'
import { PROJECTS, RARES, TOOL_FOR_SPOT } from '../src/village/extras'
import { defaultMarketRoom, isLandmark, LANDMARKS, placeLandmarks, stripLockedLandmarks, withMarketSquare } from '../src/village/marketRoom'

let seed = 7
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const w = new Wallets()
const v = new Village('11111111-check', w, rng)
w.registerPlayer('ana', 'ana')
w.registerPlayer('ravi', 'ravi')
w.credit('ana', 'coin', 2000)
w.credit('ravi', 'coin', 2000)
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

console.log('Requests board')
for (let h = 0; h < 48; h++) v.tick()
assert(v.jobs.length > 0, 'shopkeepers post requests')
assert(v.jobs.every(j => j.size && j.funded && j.note), 'every request has a size, a payer and a reason')
ok(`${v.jobs.length} open requests: ${v.jobs.map(j => `${j.size}/${j.funded}`).join(', ')}`)
const job = v.jobs[0]
w.credit('ana', job.good, job.qty)
const before = w.balance('ana', 'coin')
const done = v.deliverJob('ana', job.id)
assert.equal(w.balance('ana', 'coin'), before + job.reward, 'delivery pays the reward')
assert(done.thanks.length > 0, 'shopkeeper says thanks')
ok(`delivered ${job.qty} ${job.good} for ${job.reward} coins ("${done.thanks}")`)

console.log('Rare finds and the lucky streak')
let finds = 0, gathers = 0, longest = 0, dry = 0
for (let i = 0; i < 400; i++) {
    const r = v.gather('ravi', 'mine', 1e12 + i * 60_000)
    gathers++
    if (r.rare) { finds++; longest = Math.max(longest, dry); dry = 0 } else dry++
}
assert(finds > 10, 'rare finds happen')
assert(longest <= 18, 'the lucky streak guarantees a find within ~17 dry gathers')
ok(`${finds} rare finds in ${gathers} gathers, longest dry spell ${longest}`)
assert((w.profiles.ravi.found ?? []).length >= 1, 'found items go in the collection book')

console.log('Tools')
const pick = TOOL_FOR_SPOT.mine
v.shops.smith.stock.tools = 5
w.credit(v.shopAccount('smith'), 'tools', 5)
v.buyItem('ana', pick.id)
assert.equal(w.balance('ana', pick.id), 1)
const g = v.gather('ana', 'mine', 2e12)
assert(g.tool && g.qty >= 2, 'a pickaxe doubles the haul')
for (let i = 1; i < pick.uses; i++) v.gather('ana', 'mine', 2e12 + i * 60_000)
assert.equal(w.balance('ana', pick.id), 0, 'the pickaxe breaks after its uses')
ok(`pickaxe doubled the haul and broke after ${pick.uses} uses`)

console.log('Hats')
v.shops.tailor.stock.cloth = 3
w.credit(v.shopAccount('tailor'), 'cloth', 3)
v.buyItem('ana', 'hat_top')
assert.equal(w.profiles.ana.hat, 'hat_top', 'a new hat is worn straight away')
assert.throws(() => v.buyItem('ana', 'hat_crown'), /can't be bought/)
assert.throws(() => v.wearHat('ana', 'hat_cap'), /don't own/)
v.wearHat('ana', null)
assert.equal(w.profiles.ana.hat, undefined)
ok('bought a top hat, took it off; the crown cannot be bought')

console.log('Selling a rare find')
const rare = RARES.find(r => w.balance('ravi', r.id) > 0)!
const c0 = w.balance('ravi', 'coin')
v.sellRare('ravi', rare.id)
assert.equal(w.balance('ravi', 'coin'), c0 + rare.value)
ok(`${rare.name} sold for ${rare.value}`)

console.log('Team project')
const bridge = PROJECTS[0]
for (const [token, n] of Object.entries(bridge.needs)) {
    w.credit('ana', token, n!)
    if (token !== 'coin') { const half = Math.floor(n! / 2); w.credit('ravi', token, half); v.donate('ravi', token, half) }
}
let completed = null
for (const [token, n] of Object.entries(bridge.needs)) {
    const left = n! - (v.project.given[token] ?? 0)
    if (left > 0) completed = v.donate('ana', token, left + 5).completed ?? completed // over-donating only takes what is needed
}
assert.equal(completed?.id, 'bridge', 'the last donation finishes the bridge')
assert.equal(v.built[0].id, 'bridge')
assert.deepEqual(v.built[0].helpers.slice(0, 2).sort(), ['ana', 'ravi'])
assert.equal(v.currentProject()?.id, 'fountain', 'the next project unlocks')
ok(`bridge built on day ${v.built[0].day} by ${v.built[0].helpers.join(', ')}; next: ${v.currentProject()?.name}`)
w.credit('ravi', 'iron', 4)
const sale = v.sell('ravi', 'smith', 'iron', 4)
assert(sale.bonus >= 0)
ok(`bridge bonus on a sale: +${sale.bonus}`)

console.log('Landmarks on the map')
const map = { spawnpoint: { roomIndex: 0, x: 1, y: 1 }, rooms: [{ name: 'Office', tilemap: { '1, 1': { floor: 'ground-x' } } }] } as any
const played = withMarketSquare(map, ['bridge', 'fountain', 'well'])
const marketRoom = played.rooms.find((r: any) => r.market)!
const placed = Object.entries(marketRoom.tilemap).filter(([, t]: any) => isLandmark(t.object))
assert.equal(placed.length, 3, 'all three landmarks are placed in the Market Square')
ok(`placed at ${placed.map(([k, t]: any) => `${t.object.split('-')[1]}@(${k})`).join(' ')}`)
const other = withMarketSquare(map, [])
assert(!Object.values(other.rooms.find((r: any) => r.market)!.tilemap).some((t: any) => isLandmark(t.object)), 'another office without builds gets none')
ok('an office that built nothing gets no landmarks')
const again = placeLandmarks(played as any, ['bridge'])
assert.equal(again.length, 0, 'a landmark is never placed twice')
const sneaky = stripLockedLandmarks(JSON.parse(JSON.stringify(played)), ['bridge'])
const left = Object.values(sneaky.rooms.find((r: any) => r.market)!.tilemap).filter((t: any) => isLandmark(t.object)).map((t: any) => t.object)
assert.deepEqual(left, [LANDMARKS.bridge.sprite], 'saving a map keeps only landmarks the office built')
ok('locked landmarks are removed when a map is saved')
assert(defaultMarketRoom())

console.log('\nAll Market Square feature checks passed.')
