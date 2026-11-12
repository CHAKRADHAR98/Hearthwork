import { Router, Request, Response, NextFunction } from 'express'
import { GetPlayersInRoom, GetPlayerCounts } from './route-types'
import { z } from 'zod'
import { sessionManager } from '../session'
import { verifyToken, TokenPayload } from '../auth/jwt'
import pool from '../db'

interface AuthenticatedRequest extends Request {
    user?: TokenPayload
}

export default function routes(): Router {
    const router = Router()

    // Auth middleware
    const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.split(' ')[1]
        if (!token) {
            return res.status(401).json({ message: 'No token provided' })
        }
        const payload = verifyToken(token)
        if (!payload) {
            return res.status(401).json({ message: 'Invalid token' })
        }
        req.user = payload
        next()
    }

    router.get('/getPlayersInRoom', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        const params = req.query as unknown as z.infer<typeof GetPlayersInRoom>
        if (!GetPlayersInRoom.safeParse(params).success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        const payload = verifyToken(access_token)

        if (!payload) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const session = sessionManager.getPlayerSession(payload.userId)
        if (!session) {
            return res.status(400).json({ message: 'User not in a realm.' })
        }

        const players = session.getPlayersInRoom(params.roomIndex)
        return res.json({ players })
    })

    router.get('/getPlayerCounts', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        let params = req.query as unknown as z.infer<typeof GetPlayerCounts>
        const parseResults = GetPlayerCounts.safeParse(params)
        if (!parseResults.success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        params = parseResults.data

        if (params.realmIds.length > 100) {
            return res.status(400).json({ message: 'Too many server IDs' })
        }

        const payload = verifyToken(access_token)

        if (!payload) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const playerCounts: number[] = []
        for (const realmId of params.realmIds) {
            const session = sessionManager.getSession(realmId)
            if (session) {
                const playerCount = session.getPlayerCount()

                playerCounts.push(playerCount)
            } else {
                playerCounts.push(0)
            }
        }

        return res.json({ playerCounts })
    })

    // Get all realms with prediction markets enabled
    router.get('/realms/markets', async (_req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, name, share_id, market_pubkey
                 FROM realms
                 WHERE market_enabled = true
                 ORDER BY name ASC`
            )
            return res.json({ realms: result.rows })
        } catch (error) {
            console.error('Error fetching markets:', error)
            return res.status(500).json({ message: 'Failed to fetch markets' })
        }
    })

    // Get owned realms
    router.get('/realms/owned', async (req, res) => {
        const userId = req.query.userId as string
        if (!userId) {
            return res.status(400).json({ message: 'User ID required' })
        }

        try {
            const result = await pool.query(
                'SELECT id, name, share_id FROM realms WHERE owner_id = $1',
                [userId]
            )
            return res.json({ realms: result.rows })
        } catch (error) {
            console.error('Error fetching owned realms:', error)
            return res.status(500).json({ message: 'Failed to fetch realms' })
        }
    })

    // Get visited realms
    router.get('/realms/visited', async (req, res) => {
        const userId = req.query.userId as string
        if (!userId) {
            return res.status(400).json({ message: 'User ID required' })
        }

        try {
            const result = await pool.query(
                `SELECT r.id, r.name, r.share_id 
                 FROM realms r
                 JOIN visited_realms vr ON r.share_id = vr.share_id
                 WHERE vr.user_id = $1`,
                [userId]
            )
            return res.json({ realms: result.rows })
        } catch (error) {
            console.error('Error fetching visited realms:', error)
            return res.status(500).json({ message: 'Failed to fetch visited realms' })
        }
    })

    // Get realm data for play
    router.get('/realms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const realmId = req.params.id
        const userId = req.user?.userId

        try {
            const result = await pool.query(
                'SELECT id, name, map_data, owner_id, share_id, only_owner, market_enabled, market_admin_pubkey, market_pubkey FROM realms WHERE id = $1',
                [realmId]
            )

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Realm not found' })
            }

            const realm = result.rows[0]

            // Check access permissions
            if (realm.owner_id !== userId && realm.only_owner) {
                return res.status(403).json({ message: 'Only owner' })
            }

            return res.json({ realm })
        } catch (error) {
            console.error('Error fetching realm:', error)
            return res.status(500).json({ message: 'Failed to fetch realm' })
        }
    })

    // Add visited realm
    router.post('/realms/visit', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const { shareId } = req.body

        if (!shareId) {
            return res.status(400).json({ message: 'Share ID required' })
        }

        try {
            // Check if already visited
            const existing = await pool.query(
                'SELECT id FROM visited_realms WHERE user_id = $1 AND share_id = $2',
                [userId, shareId]
            )

            if (existing.rows.length > 0) {
                return res.json({ message: 'Already visited' })
            }

            await pool.query(
                'INSERT INTO visited_realms (user_id, share_id) VALUES ($1, $2)',
                [userId, shareId]
            )

            return res.json({ message: 'Added to visited realms' })
        } catch (error) {
            console.error('Error adding visited realm:', error)
            return res.status(500).json({ message: 'Failed to add visited realm' })
        }
    })

    // Update user skin
    router.post('/users/skin', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const { skin } = req.body

        if (!skin || typeof skin !== 'string') {
            return res.status(400).json({ message: 'Skin value required' })
        }

        try {
            await pool.query(
                'UPDATE users SET skin = $1 WHERE id = $2',
                [skin, userId]
            )
            return res.json({ message: 'Skin updated successfully' })
        } catch (error) {
            console.error('Error updating skin:', error)
            return res.status(500).json({ message: 'Failed to update skin' })
        }
    })

    // Create new realm
    router.post('/realms', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const { name, map_data, market_enabled, market_admin_pubkey, market_pubkey } = req.body

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ message: 'Realm name required' })
        }

        // Validate market fields when market is being enabled
        const enableMarket = market_enabled === true
        if (enableMarket) {
            if (!market_admin_pubkey || typeof market_admin_pubkey !== 'string') {
                return res.status(400).json({ message: 'market_admin_pubkey is required when market_enabled is true' })
            }
            // Basic base58 length check for Solana public keys (32–44 chars)
            if (market_admin_pubkey.length < 32 || market_admin_pubkey.length > 44) {
                return res.status(400).json({ message: 'Invalid Solana public key' })
            }
            if (market_pubkey && (market_pubkey.length < 32 || market_pubkey.length > 44)) {
                return res.status(400).json({ message: 'Invalid market_pubkey' })
            }
        }

        try {
            const shareId = crypto.randomUUID()
            const result = await pool.query(
                'INSERT INTO realms (owner_id, name, share_id, map_data, market_enabled, market_admin_pubkey, market_pubkey) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                [userId, name, shareId, map_data || null, enableMarket,
                    enableMarket ? market_admin_pubkey : null,
                    enableMarket && market_pubkey ? market_pubkey : null]
            )
            return res.status(201).json({ realm: result.rows[0] })
        } catch (error) {
            console.error('Error creating realm:', error)
            return res.status(500).json({ message: 'Failed to create realm' })
        }
    })

    // Delete realm
    router.delete('/realms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const realmId = req.params.id

        try {
            // Verify ownership before deleting
            const checkResult = await pool.query(
                'SELECT owner_id FROM realms WHERE id = $1',
                [realmId]
            )

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ message: 'Realm not found' })
            }

            if (checkResult.rows[0].owner_id !== userId) {
                return res.status(403).json({ message: 'Not authorized to delete this realm' })
            }

            await pool.query('DELETE FROM realms WHERE id = $1', [realmId])
            return res.json({ message: 'Realm deleted successfully' })
        } catch (error) {
            console.error('Error deleting realm:', error)
            return res.status(500).json({ message: 'Failed to delete realm' })
        }
    })

    // Update realm
    router.put('/realms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const realmId = req.params.id
        const { name, only_owner, map_data } = req.body

        try {
            // Verify ownership
            const checkResult = await pool.query(
                'SELECT owner_id FROM realms WHERE id = $1',
                [realmId]
            )

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ message: 'Realm not found' })
            }

            if (checkResult.rows[0].owner_id !== userId) {
                return res.status(403).json({ message: 'Not authorized to update this realm' })
            }

            // Build update query dynamically
            const updates: string[] = []
            const values: any[] = []
            let paramCount = 1

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`)
                values.push(name)
            }
            if (only_owner !== undefined) {
                updates.push(`only_owner = $${paramCount++}`)
                values.push(only_owner)
            }
            if (map_data !== undefined) {
                updates.push(`map_data = $${paramCount++}`)
                values.push(JSON.stringify(map_data))
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: 'No fields to update' })
            }

            values.push(realmId)

            await pool.query(
                `UPDATE realms SET ${updates.join(', ')} WHERE id = $${paramCount}`,
                values
            )

            return res.json({ message: 'Realm updated successfully' })
        } catch (error) {
            console.error('Error updating realm:', error)
            return res.status(500).json({ message: 'Failed to update realm' })
        }
    })

    // List all deployed markets for a realm
    router.get('/realms/:id/markets', async (req, res) => {
        const realmId = req.params.id
        try {
            const result = await pool.query(
                `SELECT rm.market_pubkey, rm.market_name, rm.deployed_at
                 FROM realm_markets rm
                 JOIN realms r ON r.id = rm.realm_id
                 WHERE rm.realm_id = $1
                 ORDER BY rm.deployed_at ASC`,
                [realmId]
            )
            return res.json({ markets: result.rows })
        } catch (error) {
            console.error('Error fetching realm markets:', error)
            return res.status(500).json({ message: 'Failed to fetch markets' })
        }
    })

    // Add a newly deployed market to a realm
    router.post('/realms/:id/markets', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId  = req.user?.userId
        const realmId = req.params.id
        const { market_pubkey, market_name } = req.body

        if (!market_pubkey || typeof market_pubkey !== 'string')
            return res.status(400).json({ message: 'market_pubkey required' })
        if (!market_name || typeof market_name !== 'string')
            return res.status(400).json({ message: 'market_name required' })
        if (market_pubkey.length < 32 || market_pubkey.length > 44)
            return res.status(400).json({ message: 'Invalid Solana public key' })

        try {
            const checkResult = await pool.query(
                'SELECT owner_id, market_enabled FROM realms WHERE id = $1',
                [realmId]
            )
            if (checkResult.rows.length === 0)
                return res.status(404).json({ message: 'Realm not found' })
            if (checkResult.rows[0].owner_id !== userId)
                return res.status(403).json({ message: 'Not authorized' })
            if (!checkResult.rows[0].market_enabled)
                return res.status(400).json({ message: 'Market is not enabled for this realm' })

            await pool.query(
                'INSERT INTO realm_markets (realm_id, market_pubkey, market_name) VALUES ($1, $2, $3)',
                [realmId, market_pubkey, market_name.slice(0, 50)]
            )
            return res.json({ message: 'Market added successfully', market_pubkey })
        } catch (error: any) {
            if (error.code === '23505')
                return res.status(409).json({ message: 'This market pubkey is already registered' })
            console.error('Error adding realm market:', error)
            return res.status(500).json({ message: 'Failed to add market' })
        }
    })

    // Store the on-chain market account pubkey for a realm (called after create_market tx succeeds)
    router.put('/realms/:id/market', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const realmId = req.params.id
        const { market_pubkey } = req.body

        if (!market_pubkey || typeof market_pubkey !== 'string') {
            return res.status(400).json({ message: 'market_pubkey required' })
        }

        if (market_pubkey.length < 32 || market_pubkey.length > 44) {
            return res.status(400).json({ message: 'Invalid Solana public key' })
        }

        try {
            const checkResult = await pool.query(
                'SELECT owner_id, market_enabled FROM realms WHERE id = $1',
                [realmId]
            )

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ message: 'Realm not found' })
            }

            if (checkResult.rows[0].owner_id !== userId) {
                return res.status(403).json({ message: 'Not authorized to update this realm' })
            }

            if (!checkResult.rows[0].market_enabled) {
                return res.status(400).json({ message: 'Market is not enabled for this realm' })
            }

            await pool.query(
                'UPDATE realms SET market_pubkey = $1 WHERE id = $2',
                [market_pubkey, realmId]
            )

            return res.json({ message: 'Market pubkey saved successfully' })
        } catch (error) {
            console.error('Error saving market pubkey:', error)
            return res.status(500).json({ message: 'Failed to save market pubkey' })
        }
    })

    // Update realm share_id
    router.put('/realms/:id/share', authenticate, async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.userId
        const realmId = req.params.id
        const { share_id } = req.body

        if (!share_id) {
            return res.status(400).json({ message: 'share_id required' })
        }

        try {
            // Verify ownership
            const checkResult = await pool.query(
                'SELECT owner_id FROM realms WHERE id = $1',
                [realmId]
            )

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ message: 'Realm not found' })
            }

            if (checkResult.rows[0].owner_id !== userId) {
                return res.status(403).json({ message: 'Not authorized to update this realm' })
            }

            await pool.query(
                'UPDATE realms SET share_id = $1 WHERE id = $2',
                [share_id, realmId]
            )

            return res.json({ message: 'Share ID updated successfully' })
        } catch (error) {
            console.error('Error updating share_id:', error)
            return res.status(500).json({ message: 'Failed to update share ID' })
        }
    })

    return router
}