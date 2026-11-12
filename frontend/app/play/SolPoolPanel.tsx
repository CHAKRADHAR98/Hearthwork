'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
    fetchPoolState,
    fetchVaultBalance,
    getRemainingDailyLimit,
    buildInitializePoolTx,
    buildDepositTx,
    buildWithdrawTx,
    signAndSend,
} from '@/utils/solana/solPool'

type Props = {
    realmId: string
    onClose: () => void
}

type Status = { type: 'idle' } | { type: 'loading'; msg: string } | { type: 'error'; msg: string } | { type: 'success'; msg: string; sig: string }

// ─── Wallet registry ──────────────────────────────────────────────────────────

const WALLETS = [
    {
        name: 'Phantom',
        getProvider: () => {
            const w = window as any
            return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null)
        },
    },
    {
        name: 'Solflare',
        getProvider: () => {
            const w = window as any
            return w.solflare?.isSolflare ? w.solflare : null
        },
    },
    {
        name: 'Backpack',
        getProvider: () => {
            const w = window as any
            return w.backpack?.isBackpack ? w.backpack : null
        },
    },
    {
        name: 'OKX Wallet',
        getProvider: () => (window as any).okxwallet?.solana ?? null,
    },
]

// ─── Component ────────────────────────────────────────────────────────────────

const SolPoolPanel: React.FC<Props> = ({ realmId, onClose }) => {
    const [walletPubkey, setWalletPubkey] = useState<string>('')
    const [walletProvider, setWalletProvider] = useState<any>(null)
    const [walletName, setWalletName] = useState<string>('')
    const [showPicker, setShowPicker] = useState(false)

    const [vaultBalance, setVaultBalance] = useState<number | null>(null)
    const [totalDeposited, setTotalDeposited] = useState<bigint | null>(null)
    const [totalWithdrawn, setTotalWithdrawn] = useState<bigint | null>(null)
    const [remainingLimit, setRemainingLimit] = useState<bigint | null>(null)
    const [poolExists, setPoolExists] = useState<boolean | null>(null)
    const [depositAmount, setDepositAmount] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [status, setStatus] = useState<Status>({ type: 'idle' })

    const lamportsToSol = (lamports: bigint) =>
        (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)

    const refreshData = useCallback(async (pubkeyStr: string) => {
        try {
            const [balance, poolState] = await Promise.all([
                fetchVaultBalance(realmId),
                fetchPoolState(realmId),
            ])
            setVaultBalance(balance)
            if (poolState) {
                setPoolExists(true)
                setTotalDeposited(poolState.totalDeposited)
                setTotalWithdrawn(poolState.totalWithdrawn)
            } else {
                setPoolExists(false)
            }
            if (pubkeyStr) {
                const pk = new PublicKey(pubkeyStr)
                const limit = await getRemainingDailyLimit(realmId, pk)
                setRemainingLimit(limit)
            }
        } catch {
            setPoolExists(false)
            setVaultBalance(0)
        }
    }, [realmId])

    // Auto-reconnect: check each known wallet for an already-approved session
    useEffect(() => {
        const tryAutoConnect = async () => {
            for (const w of WALLETS) {
                const provider = w.getProvider()
                const rawKey = provider?.publicKey
                if (provider?.isConnected && rawKey) {
                    const pk = rawKey.toString()
                    setWalletProvider(provider)
                    setWalletName(w.name)
                    setWalletPubkey(pk)
                    await refreshData(pk)
                    return
                }
            }
            await refreshData('')
        }
        tryAutoConnect()
    }, [refreshData])

    const connectWallet = async (walletDef: typeof WALLETS[number]) => {
        const provider = walletDef.getProvider()
        if (!provider) {
            setStatus({ type: 'error', msg: `${walletDef.name} not found. Install it first.` })
            setShowPicker(false)
            return
        }
        try {
            const resp = await provider.connect()
            // Some wallets (e.g. Solflare) return void — fall back to provider.publicKey
            const rawKey = resp?.publicKey ?? provider.publicKey
            if (!rawKey) throw new Error('No public key after connect')
            const pk = rawKey.toString()
            setWalletProvider(provider)
            setWalletName(walletDef.name)
            setWalletPubkey(pk)
            setShowPicker(false)
            await refreshData(pk)
        } catch (e: any) {
            setStatus({ type: 'error', msg: e?.message ?? 'Wallet connection rejected.' })
            setShowPicker(false)
        }
    }

    const handleInitPool = async () => {
        if (!walletPubkey) return
        setStatus({ type: 'loading', msg: 'Initializing pool...' })
        try {
            const tx = await buildInitializePoolTx(realmId, new PublicKey(walletPubkey))
            const sig = await signAndSend(tx, walletProvider)
            setStatus({ type: 'success', msg: 'Pool created!', sig })
            await refreshData(walletPubkey)
        } catch (e: any) {
            setStatus({ type: 'error', msg: e?.message ?? 'Transaction failed.' })
        }
    }

    const handleDeposit = async () => {
        if (!walletPubkey || !depositAmount) return
        const sol = parseFloat(depositAmount)
        if (isNaN(sol) || sol < 0.01) {
            setStatus({ type: 'error', msg: 'Minimum deposit is 0.01 SOL.' })
            return
        }
        const lamports = BigInt(Math.round(sol * LAMPORTS_PER_SOL))
        setStatus({ type: 'loading', msg: 'Sending deposit...' })
        try {
            const tx = await buildDepositTx(realmId, new PublicKey(walletPubkey), lamports)
            const sig = await signAndSend(tx, walletProvider)
            setStatus({ type: 'success', msg: `Deposited ${sol} SOL!`, sig })
            setDepositAmount('')
            await refreshData(walletPubkey)
        } catch (e: any) {
            setStatus({ type: 'error', msg: e?.message ?? 'Transaction failed.' })
        }
    }

    const handleWithdraw = async () => {
        if (!walletPubkey || !withdrawAmount) return
        const sol = parseFloat(withdrawAmount)
        if (isNaN(sol) || sol <= 0) {
            setStatus({ type: 'error', msg: 'Enter a valid amount.' })
            return
        }
        if (sol > 10) {
            setStatus({ type: 'error', msg: 'Max withdrawal is 10 SOL per day.' })
            return
        }
        const lamports = BigInt(Math.round(sol * LAMPORTS_PER_SOL))
        setStatus({ type: 'loading', msg: 'Sending withdrawal...' })
        try {
            const tx = await buildWithdrawTx(realmId, new PublicKey(walletPubkey), lamports)
            const sig = await signAndSend(tx, walletProvider)
            setStatus({ type: 'success', msg: `Withdrew ${sol} SOL!`, sig })
            setWithdrawAmount('')
            await refreshData(walletPubkey)
        } catch (e: any) {
            setStatus({ type: 'error', msg: e?.message ?? 'Transaction failed.' })
        }
    }

    const shortKey = (pk: string) => `${pk.slice(0, 4)}...${pk.slice(-4)}`

    return (
        <div className='absolute inset-0 flex items-center justify-center z-50 pointer-events-none'>
            <div
                className='pointer-events-auto bg-dark-panel border border-neon-green flex flex-col gap-5 p-8 relative w-full max-w-md'
                style={{ boxShadow: '0 0 40px rgba(20,241,149,0.25), inset 0 0 40px rgba(20,241,149,0.04)' }}
            >
                {/* Corner brackets */}
                <div className='absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-neon-green' />
                <div className='absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-neon-green' />
                <div className='absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-neon-green' />
                <div className='absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-neon-green' />

                {/* Header */}
                <div className='flex items-start justify-between'>
                    <div className='flex flex-col gap-1'>
                        <p className='font-orbitron text-xs text-neon-green tracking-[0.4em] uppercase opacity-80'>&gt; Community Pool</p>
                        <h2 className='font-orbitron font-bold text-white text-xl tracking-wider'>SOL WELL</h2>
                        <div className='w-full h-px bg-gradient-to-r from-neon-green/60 to-transparent mt-1' />
                    </div>
                    <button
                        onClick={onClose}
                        className='text-gray-500 hover:text-white font-orbitron text-xs tracking-widest transition-colors'
                    >
                        [X]
                    </button>
                </div>

                {/* Pool stats */}
                <div className='grid grid-cols-3 gap-3'>
                    {[
                        { label: 'BALANCE', value: vaultBalance !== null ? `${vaultBalance.toFixed(4)} SOL` : '...' },
                        { label: 'DEPOSITED', value: totalDeposited !== null ? `${lamportsToSol(totalDeposited)} SOL` : '...' },
                        { label: 'WITHDRAWN', value: totalWithdrawn !== null ? `${lamportsToSol(totalWithdrawn)} SOL` : '...' },
                    ].map(({ label, value }) => (
                        <div key={label} className='flex flex-col gap-1 border border-gray-700 p-3'>
                            <span className='font-orbitron text-[10px] text-gray-500 tracking-widest'>{label}</span>
                            <span className='font-orbitron text-sm text-neon-green font-bold'>{value}</span>
                        </div>
                    ))}
                </div>

                {/* Wallet section */}
                {!walletPubkey ? (
                    <div className='flex flex-col gap-2'>
                        <button
                            onClick={() => setShowPicker(p => !p)}
                            className='font-orbitron text-xs tracking-widest uppercase border border-neon-green text-neon-green px-6 py-3 hover:bg-neon-green/10 transition-all'
                        >
                            {showPicker ? '[CANCEL]' : '[CONNECT WALLET]'}
                        </button>

                        {/* Wallet picker */}
                        {showPicker && (
                            <div className='flex flex-col gap-1 border border-gray-700 p-2'>
                                {WALLETS.map(w => {
                                    const detected = !!w.getProvider()
                                    return (
                                        <button
                                            key={w.name}
                                            onClick={() => connectWallet(w)}
                                            className='flex items-center justify-between px-3 py-2 hover:bg-neon-green/5 transition-all'
                                        >
                                            <span className='font-orbitron text-xs text-white tracking-widest'>{w.name}</span>
                                            <span className={`font-orbitron text-[10px] tracking-widest ${detected ? 'text-neon-green' : 'text-gray-600'}`}>
                                                {detected ? 'DETECTED' : 'NOT FOUND'}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className='flex items-center justify-between border border-gray-700 px-3 py-2'>
                        <span className='font-orbitron text-xs text-gray-400 tracking-widest'>{walletName.toUpperCase()}</span>
                        <div className='flex items-center gap-3'>
                            <span className='font-orbitron text-xs text-neon-green'>{shortKey(walletPubkey)}</span>
                            <button
                                onClick={() => {
                                    setWalletPubkey('')
                                    setWalletProvider(null)
                                    setWalletName('')
                                    setRemainingLimit(null)
                                    setShowPicker(true)
                                }}
                                className='font-orbitron text-[10px] text-gray-500 hover:text-white tracking-widest transition-colors'
                            >
                                [SWITCH]
                            </button>
                        </div>
                    </div>
                )}

                {/* Init pool (if not exists) */}
                {walletPubkey && poolExists === false && (
                    <button
                        onClick={handleInitPool}
                        disabled={status.type === 'loading'}
                        className='font-orbitron text-xs tracking-widest uppercase border border-neon-green text-neon-green px-6 py-3 hover:bg-neon-green/10 transition-all disabled:opacity-40'
                    >
                        {status.type === 'loading' ? '[INITIALIZING...]' : '[CREATE POOL FOR THIS REALM]'}
                    </button>
                )}

                {/* Deposit / Withdraw (only if pool exists and wallet connected) */}
                {walletPubkey && poolExists === true && (
                    <div className='flex flex-col gap-4'>
                        {/* Daily limit display */}
                        {remainingLimit !== null && (
                            <div className='text-xs font-orbitron text-gray-500 tracking-widest'>
                                DAILY LIMIT REMAINING: <span className='text-neon-green'>{lamportsToSol(remainingLimit)} SOL</span>
                            </div>
                        )}

                        {/* Deposit row */}
                        <div className='flex gap-2'>
                            <input
                                type='number'
                                min='0.01'
                                step='0.01'
                                placeholder='SOL amount'
                                value={depositAmount}
                                onChange={e => setDepositAmount(e.target.value)}
                                className='flex-1 bg-transparent border border-gray-700 text-white font-orbitron text-xs px-3 py-2 focus:outline-none focus:border-neon-green placeholder-gray-600'
                            />
                            <button
                                onClick={handleDeposit}
                                disabled={status.type === 'loading' || !depositAmount}
                                className='font-orbitron text-xs tracking-widest uppercase border border-neon-green text-neon-green px-5 py-2 hover:bg-neon-green/10 transition-all disabled:opacity-40'
                            >
                                DEPOSIT
                            </button>
                        </div>

                        {/* Withdraw row */}
                        <div className='flex gap-2'>
                            <input
                                type='number'
                                min='0.01'
                                max='10'
                                step='0.01'
                                placeholder='SOL amount (max 10)'
                                value={withdrawAmount}
                                onChange={e => setWithdrawAmount(e.target.value)}
                                className='flex-1 bg-transparent border border-gray-700 text-white font-orbitron text-xs px-3 py-2 focus:outline-none focus:border-neon-green placeholder-gray-600'
                            />
                            <button
                                onClick={handleWithdraw}
                                disabled={status.type === 'loading' || !withdrawAmount}
                                className='font-orbitron text-xs tracking-widest uppercase border border-gray-700 text-gray-400 px-5 py-2 hover:bg-white/5 transition-all disabled:opacity-40'
                            >
                                WITHDRAW
                            </button>
                        </div>
                    </div>
                )}

                {/* Status bar */}
                {status.type !== 'idle' && (
                    <div className={`font-orbitron text-xs tracking-wide border px-3 py-2 ${
                        status.type === 'error'   ? 'border-red-500 text-red-400' :
                        status.type === 'success' ? 'border-neon-green text-neon-green' :
                        'border-gray-600 text-gray-400'
                    }`}>
                        {status.type === 'loading' && `> ${status.msg}`}
                        {status.type === 'error'   && `! ${status.msg}`}
                        {status.type === 'success' && (
                            <span>
                                ✓ {status.msg}{' '}
                                <a
                                    href={`https://explorer.solana.com/tx/${status.sig}?cluster=devnet`}
                                    target='_blank'
                                    rel='noreferrer'
                                    className='underline opacity-70 hover:opacity-100'
                                >
                                    [view tx]
                                </a>
                            </span>
                        )}
                    </div>
                )}

                <p className='text-gray-600 font-orbitron text-[10px] tracking-widest'>
                    MAX 10 SOL WITHDRAWAL PER WALLET PER 24H · DEVNET
                </p>
            </div>
        </div>
    )
}

export default SolPoolPanel
