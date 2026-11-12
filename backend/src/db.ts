import 'dotenv/config'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL || ''
// Hosted Postgres (Neon, Render, ...) needs TLS; a local Docker database does not.
const needsTls = process.env.NODE_ENV === 'production' || /sslmode=require|neon\.tech/.test(url)

const pool = new Pool({
    connectionString: url,
    ssl: needsTls ? { rejectUnauthorized: false } : false,
    max: 5, // free database tiers allow few connections
})

export default pool
