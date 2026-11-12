'use server'

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Realm {
    id: string
    name: string
    share_id: string
}

export async function getOwnedRealms(userId: string): Promise<Realm[]> {
    try {
        const response = await fetch(`${API_URL}/realms/owned?userId=${userId}`, {
            cache: 'no-store'
        })
        if (!response.ok) return []
        const data = await response.json()
        return data.realms || []
    } catch {
        return []
    }
}

export async function getVisitedRealms(userId: string): Promise<Realm[]> {
    try {
        const response = await fetch(`${API_URL}/realms/visited?userId=${userId}`, {
            cache: 'no-store'
        })
        if (!response.ok) return []
        const data = await response.json()
        return data.realms || []
    } catch {
        return []
    }
}
