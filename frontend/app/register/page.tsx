'use client'
import { useState } from 'react'
import { register } from '@/utils/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-toastify'
import GoogleSignIn from '@/components/Auth/GoogleSignIn'
import AuthShell, { fieldInput, fieldLabel, primaryButton } from '@/components/Auth/AuthShell'

export default function Register() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const mismatch = confirmPassword.length > 0 && password !== confirmPassword
    const router = useRouter()

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        if (password !== confirmPassword) return
        setLoading(true)
        try {
            await register(username, password)
            toast.success('Welcome to Hearthwork! Your NEAR wallet is on its way.')
            router.push('/app')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Could not create your account')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthShell
            title='Move into the village'
            subtitle='Get an office for your team and 40 coins to start trading. We create your NEAR wallet for you.'
            footer={<>Already have an account? <Link href='/signin' className='font-semibold text-hearth-honey underline-offset-4 hover:underline'>Sign in</Link></>}
        >
            <GoogleSignIn />
            <form onSubmit={handleRegister} className='flex flex-col gap-4'>
                <div>
                    <label htmlFor='username' className={fieldLabel}>Username</label>
                    <input id='username' name='username' autoComplete='username' className={fieldInput} value={username}
                        onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={32} placeholder='3–32 characters' />
                </div>
                <div>
                    <label htmlFor='password' className={fieldLabel}>Password</label>
                    <input id='password' name='password' type='password' autoComplete='new-password' className={fieldInput} value={password}
                        onChange={e => setPassword(e.target.value)} required minLength={6} placeholder='At least 6 characters' />
                </div>
                <div>
                    <label htmlFor='confirm' className={fieldLabel}>Confirm password</label>
                    <input id='confirm' name='confirm' type='password' autoComplete='new-password' className={fieldInput} value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)} required aria-invalid={mismatch} aria-describedby='confirm-error' />
                    {mismatch && <p id='confirm-error' className='mt-1 text-sm text-hearth-berry'>Passwords don&apos;t match.</p>}
                </div>
                <button type='submit' disabled={loading || mismatch} className={`${primaryButton} mt-2`}>{loading ? 'Creating…' : 'Create account'}</button>
            </form>
        </AuthShell>
    )
}
