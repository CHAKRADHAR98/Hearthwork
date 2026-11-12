'use client'
import { useState } from 'react'
import { login } from '@/utils/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-toastify'
import GoogleSignIn from '@/components/Auth/GoogleSignIn'
import AuthShell, { fieldInput, fieldLabel, primaryButton } from '@/components/Auth/AuthShell'

export default function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await login(username, password)
            toast.success('Welcome back!')
            router.push('/app')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Sign-in failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthShell
            title='Welcome back'
            subtitle='The shopkeepers have been busy while you were away.'
            footer={<>New here? <Link href='/register' className='font-semibold text-hearth-honey underline-offset-4 hover:underline'>Create an account</Link></>}
        >
            <GoogleSignIn />
            <form onSubmit={handleLogin} className='flex flex-col gap-4'>
                <div>
                    <label htmlFor='username' className={fieldLabel}>Username</label>
                    <input id='username' name='username' autoComplete='username' className={fieldInput} value={username}
                        onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={32} placeholder='e.g. mira' />
                </div>
                <div>
                    <label htmlFor='password' className={fieldLabel}>Password</label>
                    <input id='password' name='password' type='password' autoComplete='current-password' className={fieldInput} value={password}
                        onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
                <button type='submit' disabled={loading} className={`${primaryButton} mt-2`}>{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>
        </AuthShell>
    )
}
