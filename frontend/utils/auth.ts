// Custom authentication utilities using JWT with cookies

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export interface AuthUser {
    id: string
    username: string
    skin?: string
}

export interface AuthResponse {
    token: string
    user: AuthUser
}

function setCookie(name: string, value: string, days: number = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`
}

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    if (match) return decodeURIComponent(match[2])
    return null
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}

export async function register(username: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Registration failed')
    }

    const data = await response.json()
    setCookie('token', data.token)
    setCookie('user', JSON.stringify(data.user))
    return data
}

export async function login(username: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Login failed')
    }

    const data = await response.json()
    setCookie('token', data.token)
    setCookie('user', JSON.stringify(data.user))
    return data
}

export function logout(): void {
    deleteCookie('token')
    deleteCookie('user')
}

export function getToken(): string | null {
    if (typeof window === 'undefined') return null
    return getCookie('token')
}

export function getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null
    const userStr = getCookie('user')
    if (!userStr) return null
    try {
        return JSON.parse(userStr)
    } catch {
        return null
    }
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })

        if (!response.ok) return null

        const data = await response.json()
        return data.user
    } catch {
        return null
    }
}

export function isAuthenticated(): boolean {
    return !!getToken()
}
