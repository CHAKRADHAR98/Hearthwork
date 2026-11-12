import './env' // must stay first: loads .env and trims every setting

import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { sockets } from './sockets/sockets'
import routes from './routes/routes'
import { authRoutes } from './auth/routes'
import { sessionManager } from './session'
import pool from './db'
import { villageManager } from './village/manager'
import { migrate } from './storage'

const app = express()
const server = http.createServer(app)

// FRONTEND_URL may list several origins, comma-separated (e.g. the Vercel URL and http://localhost:3000)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean)

app.use(cors({
    origin: allowedOrigins
}))

app.use(express.json({ limit: '50mb' }))

// Initialize Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins
  }
})

// Health check
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }))

// Auth routes
app.use('/auth', authRoutes())

// Other routes
app.use(routes())

sockets(io)

async function onRealmUpdate(realmId: string) {
    const client = await pool.connect()
    try {
        const result = await client.query('SELECT map_data, share_id, only_owner FROM realms WHERE id = $1', [realmId])
        if (result.rows.length > 0) {
            const realm = result.rows[0]
            sessionManager.terminateSession(realmId, "This realm has been changed by the owner.")
        }
    } finally {
        client.release()
    }
}

async function onRealmDelete(realmId: string) {
    sessionManager.terminateSession(realmId, "This realm is no longer available.")
}

const PORT = process.env.PORT || 3001
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
        // hosts send SIGTERM before a restart or redeploy: save the game first
        await villageManager.save()
        process.exit(0)
    })
}

async function start() {
    await migrate()
    await villageManager.init(io)
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}.`)
    })
}

start().catch(e => {
    console.error('Failed to start:', e)
    process.exit(1)
})

export { io }