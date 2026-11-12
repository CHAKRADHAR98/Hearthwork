import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export interface AuthUser {
    id: string
    username: string
    skin?: string
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            cache: 'no-store'
        })

        if (!response.ok) return null

        const data = await response.json()
        return data.user
    } catch {
        return null
    }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return null
    return verifyToken(token)
}
