import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import crypto from 'crypto'
import pool from '../db'
import { generateToken } from './jwt'

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
