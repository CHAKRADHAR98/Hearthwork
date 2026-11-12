'use client'
// "Sign in with Google" via Google Identity Services. Hidden when the server has no GOOGLE_CLIENT_ID.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { loginWithGoogle } from '@/utils/auth'

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export default function GoogleSignIn() {
    const ref = useRef<HTMLDivElement>(null)
    const [clientId, setClientId] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetch(`${API_URL}/auth/config`).then(r => r.json()).then(c => setClientId(c.googleClientId)).catch(() => {})
    }, [])

    useEffect(() => {
        if (!clientId || !ref.current) return
        const render = () => {
            const google = (window as any).google
            if (!google?.accounts?.id || !ref.current) return
            google.accounts.id.initialize({
                client_id: clientId,
                callback: async ({ credential }: { credential: string }) => {
                    try {
                        await loginWithGoogle(credential)
                        toast.success('Welcome to Hearthwork! Your NEAR wallet is ready.')
                        router.push('/app')
                        router.refresh()
                    } catch (e: any) {
                        toast.error(e.message)
                    }
                },
            })
            google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 320 })
        }
        if ((window as any).google?.accounts?.id) return render()
        const s = document.createElement('script')
        s.src = 'https://accounts.google.com/gsi/client'
        s.async = true
        s.onload = render
        document.head.appendChild(s)
    }, [clientId, router])

    if (!clientId) return null
    return (
        <div className='flex flex-col items-center gap-2'>
            <div ref={ref} />
            <p className='text-xs text-hearth-sand text-center'>No wallet or seed phrase needed: we create a NEAR account for you.</p>
            <div className='flex items-center gap-3 w-full my-3 text-hearth-sand text-sm'><span className='flex-1 h-px bg-hearth-line' />or<span className='flex-1 h-px bg-hearth-line' /></div>
        </div>
    )
}
