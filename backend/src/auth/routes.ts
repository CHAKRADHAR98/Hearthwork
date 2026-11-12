import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import crypto from 'crypto'
import pool from '../db'
import { OAuth2Client } from 'google-auth-library'
import { generateToken } from './jwt'
import { villageManager } from '../village/manager'

const googleClient = new OAuth2Client()

// Google sign-in: users may have no password. Runs once at startup, safe to repeat.
pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
`).catch(e => console.error('[auth] migration failed', e.message))

async function uniqueUsername(base: string) {
    const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'villager'
    for (let i = 0; i < 20; i++) {
        const name = i === 0 ? clean : `${clean}${Math.floor(Math.random() * 1000)}`
        const r = await pool.query('SELECT 1 FROM users WHERE username = $1', [name])
        if (r.rows.length === 0) return name
    }
    return `${clean}${crypto.randomUUID().slice(0, 6)}`
}

const RegisterSchema = z.object({
    username: z.string().min(3).max(32),
    password: z.string().min(6).max(100),
})

const LoginSchema = z.object({
    username: z.string(),
    password: z.string(),
})

export function authRoutes(): Router {
    const router = Router()

    router.post('/register', async (req, res) => {
        const result = RegisterSchema.safeParse(req.body)
        if (!result.success) {
            return res.status(400).json({ message: 'Invalid input data' })
        }

        const { username, password } = result.data

        try {
            const existingUser = await pool.query(
                'SELECT id FROM users WHERE username = $1',
                [username]
            )

            if (existingUser.rows.length > 0) {
                return res.status(409).json({ message: 'Username already exists' })
            }

            const hashedPassword = await bcrypt.hash(password, 10)
            const userId = crypto.randomUUID()

            await pool.query(
                'INSERT INTO users (id, username, password_hash, skin) VALUES ($1, $2, $3, $4)',
                [userId, username, hashedPassword, '009']
            )

            const token = generateToken({ userId, username })

            return res.status(201).json({
                message: 'User created successfully',
                token,
                user: { id: userId, username }
            })
        } catch (error) {
            console.error('Registration error:', error)
            return res.status(500).json({ message: 'Internal server error' })
        }
    })

    router.post('/login', async (req, res) => {
        const result = LoginSchema.safeParse(req.body)
        if (!result.success) {
            return res.status(400).json({ message: 'Invalid input data' })
        }

        const { username, password } = result.data

        try {
            const userResult = await pool.query(
                'SELECT id, username, password_hash FROM users WHERE username = $1',
                [username]
            )

            if (userResult.rows.length === 0) {
                return res.status(401).json({ message: 'Invalid username or password' })
            }

            const user = userResult.rows[0]
            if (!user.password_hash) {
                return res.status(401).json({ message: 'This account uses Google sign-in' })
            }
            const passwordMatch = await bcrypt.compare(password, user.password_hash)

            if (!passwordMatch) {
                return res.status(401).json({ message: 'Invalid username or password' })
            }

            const token = generateToken({ userId: user.id, username: user.username })

            return res.json({
                token,
                user: { id: user.id, username: user.username }
            })
        } catch (error) {
            console.error('Login error:', error)
            return res.status(500).json({ message: 'Internal server error' })
        }
    })

    /** Public config the sign-in page needs. */
    router.get('/config', (_req, res) => {
        res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null })
    })

    /** Sign in with Google: verify the ID token, find or create the user. A NEAR wallet is created for them on first play. */
    router.post('/google', async (req, res) => {
        const credential = typeof req.body?.credential === 'string' ? req.body.credential : null
        const audience = process.env.GOOGLE_CLIENT_ID
        if (!credential || !audience) return res.status(400).json({ message: 'Google sign-in is not configured.' })
        try {
            const ticket = await googleClient.verifyIdToken({ idToken: credential, audience })
            const p = ticket.getPayload()
            if (!p?.sub) return res.status(401).json({ message: 'Invalid Google token' })
            let user = (await pool.query('SELECT id, username FROM users WHERE google_sub = $1', [p.sub])).rows[0]
            if (!user) {
                const username = await uniqueUsername(p.given_name || p.name || (p.email ?? '').split('@')[0])
                user = (await pool.query(
                    'INSERT INTO users (id, username, password_hash, skin, google_sub, email) VALUES ($1, $2, NULL, $3, $4, $5) RETURNING id, username',
                    [crypto.randomUUID(), username, '009', p.sub, p.email ?? null],
                )).rows[0]
            }
            // Create the player's NEAR wallet right away so it's ready when they enter an office.
            villageManager.ensurePlayer(user.id, user.username)
            const token = generateToken({ userId: user.id, username: user.username })
            return res.json({ token, user: { id: user.id, username: user.username } })
        } catch (e: any) {
            console.error('Google sign-in error:', e?.message)
            return res.status(401).json({ message: 'Google sign-in failed' })
        }
    })

    router.get('/verify', async (req, res) => {
        const authHeader = req.headers.authorization
        if (!authHeader) {
            return res.status(401).json({ message: 'No token provided' })
        }

        const token = authHeader.split(' ')[1]
        if (!token) {
            return res.status(401).json({ message: 'Invalid token format' })
        }

        const { verifyToken } = await import('./jwt')
        const payload = verifyToken(token)

        if (!payload) {
            return res.status(401).json({ message: 'Invalid token' })
        }

        try {
            const userResult = await pool.query(
                'SELECT id, username, skin FROM users WHERE id = $1',
                [payload.userId]
            )

            if (userResult.rows.length === 0) {
                return res.status(401).json({ message: 'User not found' })
            }

            const user = userResult.rows[0]
            return res.json({ user })
        } catch (error) {
            console.error('Verify error:', error)
            return res.status(500).json({ message: 'Internal server error' })
        }
    })

    return router
}
