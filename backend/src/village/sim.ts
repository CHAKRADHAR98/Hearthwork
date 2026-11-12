// Headless economy check: `npm run sim` simulates N days and prints prices, cash and events.
import { Village } from './village'
import { Wallets } from './wallets'
import { GOOD_IDS } from './goods'
import { SHOPS } from './shops'

const days = Number(process.argv[2] ?? 7)
let seed = 42
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const w = new Wallets()
const v = new Village('00000000-sim', w, rng)
const flood = process.argv.includes('--flood')
if (flood) w.registerPlayer('p1', 'alice')

const row = () => `D${String(v.day).padStart(2)} ` + GOOD_IDS.map(g => `${g}:${String(v.priceHistory[g]?.at(-1)?.price ?? '-').padStart(3)}`).join(' ') +
    ' | ' + SHOPS.map(d => `${d.id.slice(0, 4)}:${v.shops[d.id].open ? v.shops[d.id].coins : 'X'}`).join(' ')
console.log(row())
for (let h = 0; h < days * 24; h++) {
    if (flood && v.hour === 10) {
        // a player floods the market with iron every morning
        w.credit('p1', 'iron', 15)
        try { v.sell('p1', 'smith', 'iron', 15) } catch (e: any) { console.log('   sell failed:', e.message) }
    }
    v.tick()
    if (v.hour === 18) console.log(row())
}
for (const e of v.events.filter(e => e.kind !== 'trade' && e.kind !== 'info')) console.log(`  [D${Math.floor(e.t / 24) + 1} ${e.t % 24}h] ${e.text}`)
console.log('deltas to sync:', w.pendingDeltas().length)
