// Database setup and game-state storage.
//
// * `migrate()` runs schema.sql on every start (all statements are idempotent), so a brand-new database
//   (e.g. a fresh Neon project) sets itself up.
// * The village keeps its state in memory and saves it here as small JSON documents in `game_state`:
//   `wallets` (every player's and shopkeeper's balances) and `village:<officeId>` (each office's economy).
//   Hosting with a throwaway disk (Render free, Vercel...) therefore loses nothing on restart.

import fs from 'fs'
import path from 'path'
import pool from './db'

const SCHEMA = path.join(__dirname, '..', 'schema.sql') // same path from src/ (tsx) and dist/ (node)
const LEGACY_DATA = path.join(__dirname, '..', 'data')

export async function migrate() {
    await pool.query(fs.readFileSync(SCHEMA, 'utf8'))
}

/** Every saved document, keyed by name. */
export async function loadState(): Promise<Map<string, any>> {
    const { rows } = await pool.query('SELECT key, data FROM game_state')
    const out = new Map<string, any>(rows.map(r => [r.key, r.data]))
    if (!out.has('wallets') && importLegacyFiles(out)) await saveState([...out.entries()])
    return out
}

/** Upsert several documents in one transaction. */
export async function saveState(docs: [string, unknown][]) {
    if (!docs.length) return
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        for (const [key, data] of docs) {
            await client.query(
                `INSERT INTO game_state (key, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
                [key, JSON.stringify(data)],
            )
        }
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
    } finally {
        client.release()
    }
}

/** One-time import of the old file saves (backend/data/) when the database has none yet. */
function importLegacyFiles(out: Map<string, any>): boolean {
    try {
        out.set('wallets', JSON.parse(fs.readFileSync(path.join(LEGACY_DATA, 'wallets.json'), 'utf8')))
        for (const f of fs.readdirSync(path.join(LEGACY_DATA, 'villages'))) {
            if (f.endsWith('.json')) out.set(`village:${f.slice(0, -5)}`, JSON.parse(fs.readFileSync(path.join(LEGACY_DATA, 'villages', f), 'utf8')))
        }
        console.log(`[storage] imported ${out.size} saved documents from backend/data/`)
        return true
    } catch {
        return false // no legacy files: fresh start
    }
}
