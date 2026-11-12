'use client'
import { useState } from 'react'
import { register } from '@/utils/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BasicInput from '@/components/BasicInput'
import { toast } from 'react-toastify'

export default function Register() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()

        if (password !== confirmPassword) {
            toast.error('Passwords do not match')
            return
        }

        setLoading(true)

        try {
            await register(username, password)
            toast.success('Account created successfully!')
            router.push('/app')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Registration failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='relative w-full min-h-screen cyber-bg scanlines flex flex-col items-center justify-center px-4'>

            {/* Corner brackets */}
            <div className='absolute top-6 left-6 w-6 h-6 border-t-2 border-l-2 border-cyber-cyan opacity-40' />
            <div className='absolute top-6 right-6 w-6 h-6 border-t-2 border-r-2 border-cyber-cyan opacity-40' />
            <div className='absolute bottom-6 left-6 w-6 h-6 border-b-2 border-l-2 border-cyber-cyan opacity-40' />
            <div className='absolute bottom-6 right-6 w-6 h-6 border-b-2 border-r-2 border-cyber-cyan opacity-40' />

            <div className='w-full max-w-md relative'>

                {/* Panel corners */}
                <div className='absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-cyber-cyan' />
                <div className='absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-cyber-cyan' />
                <div className='absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-cyber-cyan' />
                <div className='absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-cyber-cyan' />

                <div className='bg-dark-panel border border-panel-border p-8 flex flex-col gap-6'>

                    {/* Header */}
                    <div className='flex flex-col gap-1'>
                        <p className='text-cyber-cyan text-xs tracking-[0.4em] font-orbitron uppercase opacity-70'>&gt; New Agent</p>
                        <h1 className='font-orbitron font-bold text-2xl tracking-wider text-white'>REGISTRATION</h1>
                        <div className='w-full h-px bg-gradient-to-r from-cyber-cyan/50 to-transparent mt-1' />
                    </div>

                    <form onSubmit={handleRegister} className='flex flex-col gap-5'>
                        <div>
                            <label className='block text-xs font-semibold tracking-widest uppercase text-cyber-cyan font-orbitron mb-2'>
                                Agent ID
                            </label>
                            <BasicInput
                                type='text'
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder='Choose a username'
                                required
                                minLength={3}
                                maxLength={32}
                            />
                        </div>

                        <div>
                            <label className='block text-xs font-semibold tracking-widest uppercase text-cyber-cyan font-orbitron mb-2'>
                                Access Code
                            </label>
                            <BasicInput
                                type='password'
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder='Choose a password'
                                required
                                minLength={6}
                            />
                        </div>

                        <div>
                            <label className='block text-xs font-semibold tracking-widest uppercase text-cyber-cyan font-orbitron mb-2'>
                                Confirm Code
                            </label>
                            <BasicInput
                                type='password'
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder='Confirm your password'
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type='submit'
                            disabled={loading}
                            className={`mt-2 w-full font-orbitron font-bold text-sm tracking-[0.2em] uppercase py-3 border transition-all duration-300 rounded-sm ${
                                loading
                                    ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                                    : 'border-neon-green text-neon-green hover:bg-neon-green/10 hover:shadow-[0_0_25px_rgba(20,241,149,0.4)]'
                            }`}
                        >
                            {loading ? (
                                <span className='flex items-center justify-center gap-2'>
                                    <span className='w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin' />
                                    CREATING...
                                </span>
                            ) : (
                                'CREATE AGENT'
                            )}
                        </button>
                    </form>

                    <p className='text-center text-xs text-gray-600 tracking-widest font-orbitron'>
                        HAVE AN ACCOUNT?{' '}
                        <Link href='/signin' className='text-cyber-cyan hover:text-white transition-colors duration-200'>
                            SIGN IN
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
