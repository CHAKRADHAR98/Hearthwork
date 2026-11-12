'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'

const PROGRAM_ID_STR          = 'BZ21yPSaWuGgpwaHT9yAZ5KUoGjNZ5R2fFukhhcZQiKg'
const TOKEN_PROGRAM_STR       = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const ASSOC_TOKEN_PROGRAM_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

interface MarketData {
    marketName:       string
    description:      string
    lsmrB:            any  // BN
    deadLine:         any  // BN
    marketState:      { active?: Record<string, never>; resolved?: Record<string, never> }
    marketOutcome:    { yes?: Record<string, never>; no?: Record<string, never>; notResolved?: Record<string, never> }
    outcomeYesShares: any  // BN
    outcomeNoShares:  any  // BN
}

function lmsrProb(qY: number, qN: number, b: number) {
    if (b <= 0) return { yes: 0.5, no: 0.5 }
    const eY = Math.exp(qY / b), eN = Math.exp(qN / b), s = eY + eN
    return { yes: eY / s, no: eN / s }
}
function lmsrCost(qY: number, qN: number, b: number, n: number, isYes: boolean) {
    if (b <= 0) return 0
    const nY = isYes ? qY + n : qY, nN = isYes ? qN : qN + n
    return Math.max(0,
        b * Math.log(Math.exp(nY / b) + Math.exp(nN / b)) -
        b * Math.log(Math.exp(qY / b) + Math.exp(qN / b))
    )
}

async function buildProgram(walletPubkeyStr: string) {
    const { Connection, PublicKey, SystemProgram, ComputeBudgetProgram } = await import('@solana/web3.js')
    const { Program, AnchorProvider, BN } = await import('@coral-xyz/anchor')
    const idl = (await import('@/utils/gather-idl.json')).default as any

    const solana     = (window as any).solana
    const connection = new Connection(RPC_URL, 'confirmed')
    const walletPk   = new PublicKey(walletPubkeyStr)
    const wallet     = {
        publicKey:           walletPk,
        signTransaction:     (tx: any)    => solana.signTransaction(tx),
        signAllTransactions: (txs: any[]) => solana.signAllTransactions(txs),
    }
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
    const program  = new Program(idl, provider)

    const PROG_ID    = new PublicKey(PROGRAM_ID_STR)
    const TOKEN_PROG = new PublicKey(TOKEN_PROGRAM_STR)
    const ASSOC_PROG = new PublicKey(ASSOC_TOKEN_PROGRAM_STR)

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('admin_config')], PROG_ID)

    return { program, connection, BN, PublicKey, SystemProgram, ComputeBudgetProgram, PROG_ID, TOKEN_PROG, ASSOC_PROG, configPda, walletPk }
}

type Props = {
    realmId:           string
    realmName:         string
    marketName:        string
    marketPubkey:      string
    marketAdminPubkey: string | null
    userId:            string
    token:             string
}

export default function MarketClient({ realmName, marketName, marketPubkey, marketAdminPubkey }: Props) {

    const [marketData,    setMarketData]    = useState<MarketData | null>(null)
    const [loadingMarket, setLoadingMarket] = useState(false)
    const [walletPubkey,  setWalletPubkey]  = useState('')
    const [connecting,    setConnecting]    = useState(false)

    // ── Bettor wallet state ────────────────────────────────────────────────────
    const [hasBettorProfile,    setHasBettorProfile]    = useState(false)
    const [bettorWalletBalance, setBettorWalletBalance] = useState<number | null>(null)
    const [loadingProfile,      setLoadingProfile]      = useState(false)

    // ── Profile creation ───────────────────────────────────────────────────────
    const [profileDeposit,  setProfileDeposit]  = useState('2')
    const [creatingProfile, setCreatingProfile] = useState(false)

    // ── Top-up deposit ─────────────────────────────────────────────────────────
    const [depositAmount, setDepositAmount] = useState('2')
    const [depositing,    setDepositing]    = useState(false)

    // ── Withdraw ───────────────────────────────────────────────────────────────
    const [withdrawing, setWithdrawing] = useState(false)

    const [userYesShares, setUserYesShares] = useState(0)
    const [userNoShares,  setUserNoShares]  = useState(0)

    const [shares,   setShares]    = useState(1)
    const [buying,   setBuying]    = useState(false)
    const [resolving, setResolving] = useState(false)
    const [claiming,  setClaiming]  = useState(false)

    // ── Resolve confirmation ───────────────────────────────────────────────────
    const [resolveConfirm, setResolveConfirm] = useState<boolean | null>(null)

    // ── Load market from chain ─────────────────────────────────────────────────
    const loadMarket = useCallback(async () => {
        setLoadingMarket(true)
        try {
            const { Connection, PublicKey } = await import('@solana/web3.js')
            const { Program, AnchorProvider } = await import('@coral-xyz/anchor')
            const idl = (await import('@/utils/gather-idl.json')).default as any

            const conn = new Connection(RPC_URL, 'confirmed')
            const dummyWallet = {
                publicKey: null,
                signTransaction: async (tx: any) => tx,
                signAllTransactions: async (txs: any[]) => txs,
            }
            const provider = new AnchorProvider(conn, dummyWallet as any, { commitment: 'confirmed' })
            const program  = new Program(idl, provider)
            const data = await (program.account as any).gatherMarket.fetch(new PublicKey(marketPubkey))
            setMarketData(data as MarketData)
        } catch (err: any) {
            toast.error('Failed to load market: ' + (err?.message?.slice(0, 80) ?? 'Unknown'))
        }
        setLoadingMarket(false)
    }, [marketPubkey])

    useEffect(() => { loadMarket() }, [loadMarket])

    // ── Load bettor profile & wallet balance ───────────────────────────────────
    const loadBettorWallet = useCallback(async () => {
        if (!walletPubkey) return
        setLoadingProfile(true)
        try {
            const { Connection, PublicKey } = await import('@solana/web3.js')
            const { Program, AnchorProvider } = await import('@coral-xyz/anchor')
            const idl = (await import('@/utils/gather-idl.json')).default as any

            const conn   = new Connection(RPC_URL, 'confirmed')
            const dummy  = { publicKey: null, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t }
            const prog   = new Program(idl, new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' }))
            const PROG_ID = new PublicKey(PROGRAM_ID_STR)

            const bettor    = new PublicKey(walletPubkey)
            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('admin_config')], PROG_ID)
            const [profPda]   = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), bettor.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]    = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  bettor.toBytes(), configPda.toBytes()], PROG_ID)

            try {
                await (prog.account as any).bettor.fetch(profPda)
                setHasBettorProfile(true)
                const lamports = await conn.getBalance(walPda)
                setBettorWalletBalance(lamports / 1e9)
            } catch {
                setHasBettorProfile(false)
                setBettorWalletBalance(null)
            }
        } catch { /* network error */ }
        setLoadingProfile(false)
    }, [walletPubkey])

    useEffect(() => { loadBettorWallet() }, [loadBettorWallet])

    // ── Load user token balances ───────────────────────────────────────────────
    const loadUserShares = useCallback(async () => {
        if (!walletPubkey) return
        try {
            const { Connection, PublicKey } = await import('@solana/web3.js')
            const PROG_ID    = new PublicKey(PROGRAM_ID_STR)
            const TOKEN_PROG = new PublicKey(TOKEN_PROGRAM_STR)
            const ASSOC_PROG = new PublicKey(ASSOC_TOKEN_PROGRAM_STR)
            const conn       = new Connection(RPC_URL, 'confirmed')
            const bettor     = new PublicKey(walletPubkey)
            const marketPk   = new PublicKey(marketPubkey)

            const [mintYes] = PublicKey.findProgramAddressSync([Buffer.from('mint_yes'), marketPk.toBytes()], PROG_ID)
            const [mintNo]  = PublicKey.findProgramAddressSync([Buffer.from('mint_no'),  marketPk.toBytes()], PROG_ID)
            const [yesAta]  = PublicKey.findProgramAddressSync([bettor.toBytes(), TOKEN_PROG.toBytes(), mintYes.toBytes()], ASSOC_PROG)
            const [noAta]   = PublicKey.findProgramAddressSync([bettor.toBytes(), TOKEN_PROG.toBytes(), mintNo.toBytes()],  ASSOC_PROG)

            const [yesBal, noBal] = await Promise.all([
                conn.getTokenAccountBalance(yesAta).catch(() => null),
                conn.getTokenAccountBalance(noAta).catch(() => null),
            ])
            setUserYesShares(yesBal ? Number(yesBal.value.amount) : 0)
            setUserNoShares(noBal  ? Number(noBal.value.amount)   : 0)
        } catch { /* account may not exist yet */ }
    }, [walletPubkey, marketPubkey])

    useEffect(() => { loadUserShares() }, [loadUserShares])

    // ── Connect wallet ─────────────────────────────────────────────────────────
    async function connectWallet() {
        const solana = (window as any).solana
        if (!solana) return toast.error('Install Phantom or Solflare.')
        setConnecting(true)
        try {
            await solana.connect()
            setWalletPubkey(solana.publicKey.toString())
        } catch { toast.error('Wallet connection cancelled.') }
        setConnecting(false)
    }

    // ── Create bettor profile + initial deposit ────────────────────────────────
    async function handleCreateProfile() {
        const amount = parseInt(profileDeposit)
        if (!amount || amount < 1) return toast.error('Enter a valid SOL amount (minimum 1).')
        setCreatingProfile(true)
        try {
            const { program, connection, BN, PublicKey, SystemProgram, PROG_ID, configPda, walletPk } = await buildProgram(walletPubkey)
            const [profPda] = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]  = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  walletPk.toBytes(), configPda.toBytes()], PROG_ID)

            const sig = await (program.methods as any)
                .initializeBettorAccount(new BN(amount), null)
                .accounts({
                    bettor: walletPk, gatherConfig: configPda,
                    bettorProfile: profPda, bettorWalletAccount: walPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc()
            await connection.confirmTransaction(sig, 'confirmed')
            toast.success(`Profile created! ${amount} SOL deposited to your betting wallet.`)
            await loadBettorWallet()
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('insufficient lamports') || msg.includes('0x1'))
                toast.error('Not enough SOL in your Phantom wallet.')
            else
                toast.error('Failed: ' + msg.slice(0, 120))
        }
        setCreatingProfile(false)
    }

    // ── Top-up existing bettor wallet ──────────────────────────────────────────
    async function handleDeposit() {
        const amount = parseInt(depositAmount)
        if (!amount || amount < 1) return toast.error('Enter a valid SOL amount (minimum 1).')
        setDepositing(true)
        try {
            const { program, connection, BN, PublicKey, SystemProgram, PROG_ID, configPda, walletPk } = await buildProgram(walletPubkey)
            const [profPda] = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]  = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  walletPk.toBytes(), configPda.toBytes()], PROG_ID)

            const sig = await (program.methods as any)
                .depositBettorWallet(new BN(amount))
                .accounts({
                    bettor: walletPk, gatherConfig: configPda,
                    bettorProfile: profPda, bettorWalletAccount: walPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc()
            await connection.confirmTransaction(sig, 'confirmed')
            toast.success(`${amount} SOL deposited to your betting wallet.`)
            await loadBettorWallet()
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('insufficient lamports') || msg.includes('0x1'))
                toast.error('Not enough SOL in your Phantom wallet.')
            else
                toast.error('Failed: ' + msg.slice(0, 120))
        }
        setDepositing(false)
    }

    // ── Withdraw all SOL from bettor wallet back to Phantom ───────────────────
    async function handleWithdraw() {
        if (!walletPubkey) return toast.error('Connect your wallet first.')
        setWithdrawing(true)
        try {
            const { program, connection, PublicKey, SystemProgram, PROG_ID, configPda, walletPk } = await buildProgram(walletPubkey)
            const marketPk  = new PublicKey(marketPubkey)
            const [profPda] = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]  = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [wagPda]  = PublicKey.findProgramAddressSync([Buffer.from('bet'), marketPk.toBytes(), walletPk.toBytes()], PROG_ID)

            const sig = await (program.methods as any)
                .bettorWithdrawAmount()
                .accounts({
                    bettor: walletPk, gatherConfig: configPda,
                    gatherMarket: marketPk, wagerAccount: wagPda,
                    bettorWalletAccount: walPda, bettorProfile: profPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc()
            await connection.confirmTransaction(sig, 'confirmed')
            toast.success('All SOL withdrawn to your Phantom wallet.')
            await loadBettorWallet()
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('2006') || msg.includes('AccountNotInitialized'))
                toast.error('You must place at least one bet on this market before withdrawing.')
            else
                toast.error('Withdraw failed: ' + msg.slice(0, 120))
        }
        setWithdrawing(false)
    }

    // ── Buy shares — ONLY calls buyShares, no auto-deposit ────────────────────
    async function handleBuy(isYes: boolean) {
        if (!walletPubkey || !marketData) return
        if (!hasBettorProfile) return toast.error('Create your betting profile first.')
        if (shares < 1) return toast.error('Enter at least 1 share.')

        setBuying(true)
        try {
            const { program, connection, BN, PublicKey, SystemProgram, ComputeBudgetProgram, PROG_ID, TOKEN_PROG, ASSOC_PROG, configPda, walletPk } = await buildProgram(walletPubkey)
            const marketPk  = new PublicKey(marketPubkey)
            const [profPda] = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]  = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [wagPda]  = PublicKey.findProgramAddressSync([Buffer.from('bet'), marketPk.toBytes(), walletPk.toBytes()], PROG_ID)
            const [mintYes] = PublicKey.findProgramAddressSync([Buffer.from('mint_yes'), marketPk.toBytes()], PROG_ID)
            const [mintNo]  = PublicKey.findProgramAddressSync([Buffer.from('mint_no'),  marketPk.toBytes()], PROG_ID)
            const [vaultPda]= PublicKey.findProgramAddressSync([Buffer.from('market_vault'), marketPk.toBytes()], PROG_ID)
            const [yesAta]  = PublicKey.findProgramAddressSync([walletPk.toBytes(), TOKEN_PROG.toBytes(), mintYes.toBytes()], ASSOC_PROG)
            const [noAta]   = PublicKey.findProgramAddressSync([walletPk.toBytes(), TOKEN_PROG.toBytes(), mintNo.toBytes()],  ASSOC_PROG)

            const sig = await (program.methods as any)
                .buyShares(new BN(shares), isYes)
                .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
                .accounts({
                    bettor: walletPk, bettorProfile: profPda, wagerAccount: wagPda,
                    bettorWalletAccount: walPda, gatherConfig: configPda, gatherMarket: marketPk,
                    mintYes, mintNo, marketVaultAccount: vaultPda,
                    bettorYesAccount: yesAta, bettorNoAccount: noAta,
                    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROG, associatedTokenProgram: ASSOC_PROG,
                })
                .rpc()

            await connection.confirmTransaction(sig, 'confirmed')
            toast.success(`Bought ${shares} ${isYes ? 'YES' : 'NO'} shares!`)
            await Promise.all([loadMarket(), loadUserShares(), loadBettorWallet()])
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('NotEnoughAmount') || msg.includes('0x177b'))
                toast.error('Not enough SOL in your betting wallet. Top up below.')
            else if (msg.includes('MarketGotResolved') || msg.includes('0x177c'))
                toast.error('Market is already resolved.')
            else
                toast.error('Transaction failed: ' + msg.slice(0, 120))
        }
        setBuying(false)
    }

    // ── Resolve (admin only) ───────────────────────────────────────────────────
    async function handleResolve(outcomeIsYes: boolean) {
        if (!walletPubkey) return toast.error('Connect your wallet first.')
        setResolving(true)
        try {
            const { program, connection, PublicKey, configPda, walletPk } = await buildProgram(walletPubkey)
            const sig = await (program.methods as any)
                .resolveMarket(outcomeIsYes ? { yes: {} } : { no: {} })
                .accounts({ admin: walletPk, gatherConfig: configPda, gatherMarket: new PublicKey(marketPubkey) })
                .rpc()
            await connection.confirmTransaction(sig, 'confirmed')
            await new Promise(r => setTimeout(r, 1500))
            await loadMarket()
            toast.success(`Resolved as ${outcomeIsYes ? 'YES' : 'NO'}!`)
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('0x177e')) toast.error('Deadline not reached yet.')
            else if (msg.includes('0x177c')) toast.error('Market already resolved.')
            else if (msg.includes('0x1774')) toast.error('Only the market admin can resolve.')
            else toast.error('Transaction failed: ' + msg.slice(0, 120))
        }
        setResolving(false)
    }

    // ── Claim ──────────────────────────────────────────────────────────────────
    async function handleClaim() {
        if (!walletPubkey || !marketData) return
        const isYesOutcome  = 'yes' in (marketData.marketOutcome as any)
        const winningShares = isYesOutcome ? userYesShares : userNoShares
        if (winningShares === 0) return toast.error('No winning shares to claim.')

        setClaiming(true)
        try {
            const { program, connection, BN, PublicKey, SystemProgram, ComputeBudgetProgram, PROG_ID, TOKEN_PROG, ASSOC_PROG, configPda, walletPk } = await buildProgram(walletPubkey)
            const marketPk  = new PublicKey(marketPubkey)
            const [profPda] = PublicKey.findProgramAddressSync([Buffer.from('bettor_profile'), walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [walPda]  = PublicKey.findProgramAddressSync([Buffer.from('bettor_wallet'),  walletPk.toBytes(), configPda.toBytes()], PROG_ID)
            const [wagPda]  = PublicKey.findProgramAddressSync([Buffer.from('bet'), marketPk.toBytes(), walletPk.toBytes()], PROG_ID)
            const [mintYes] = PublicKey.findProgramAddressSync([Buffer.from('mint_yes'), marketPk.toBytes()], PROG_ID)
            const [mintNo]  = PublicKey.findProgramAddressSync([Buffer.from('mint_no'),  marketPk.toBytes()], PROG_ID)
            const [vaultPda]= PublicKey.findProgramAddressSync([Buffer.from('market_vault'), marketPk.toBytes()], PROG_ID)
            const [yesAta]  = PublicKey.findProgramAddressSync([walletPk.toBytes(), TOKEN_PROG.toBytes(), mintYes.toBytes()], ASSOC_PROG)
            const [noAta]   = PublicKey.findProgramAddressSync([walletPk.toBytes(), TOKEN_PROG.toBytes(), mintNo.toBytes()],  ASSOC_PROG)

            const sig = await (program.methods as any)
                .claimBettorAmount(new BN(winningShares))
                .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
                .accounts({
                    bettor: walletPk, wagerAccount: wagPda, bettorProfile: profPda,
                    bettorWalletAccount: walPda, bettorYesAta: yesAta, bettorNoAta: noAta,
                    gatherConfig: configPda, gatherMarket: marketPk, marketVaultAccount: vaultPda,
                    mintYes, mintNo,
                    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROG, associatedTokenProgram: ASSOC_PROG,
                })
                .rpc()

            await connection.confirmTransaction(sig, 'confirmed')
            toast.success('Winnings claimed to your betting wallet!')
            await Promise.all([loadMarket(), loadUserShares(), loadBettorWallet()])
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('0x177e')) toast.error('Market is not resolved yet.')
            else if (msg.includes('0x177f')) toast.error('No winning shares.')
            else toast.error('Transaction failed: ' + msg.slice(0, 120))
        }
        setClaiming(false)
    }

    // ── Derived ────────────────────────────────────────────────────────────────
    const isAdmin      = !!(walletPubkey && marketAdminPubkey && walletPubkey === marketAdminPubkey)
    const isResolved   = marketData ? 'resolved' in (marketData.marketState as any) : false
    const isActive     = marketData ? 'active'   in (marketData.marketState as any) : false
    const outcomeLabel = marketData
        ? ('yes' in (marketData.marketOutcome as any) ? 'YES' : 'no' in (marketData.marketOutcome as any) ? 'NO' : '—')
        : '—'

    const qY = marketData ? marketData.outcomeYesShares.toNumber() : 0
    const qN = marketData ? marketData.outcomeNoShares.toNumber()  : 0
    const b  = marketData ? marketData.lsmrB.toNumber()            : 1

    const prob       = lmsrProb(qY, qN, b)
    const estCostYes = marketData ? lmsrCost(qY, qN, b, shares, true)  : 0
    const estCostNo  = marketData ? lmsrCost(qY, qN, b, shares, false) : 0

    const deadlineDate = marketData ? new Date(marketData.deadLine.toNumber() * 1000) : null
    const pastDeadline = deadlineDate ? Date.now() > deadlineDate.getTime() : false

    const insufficientFunds = hasBettorProfile && bettorWalletBalance !== null
        && bettorWalletBalance < Math.max(estCostYes, estCostNo)

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className='px-4 sm:px-8 py-8 max-w-3xl mx-auto flex flex-col gap-6'>

            {/* Header */}
            <div>
                <p className='font-orbitron text-xs text-cyber-purple tracking-[0.4em] opacity-70 mb-1'>&gt; {realmName}</p>
                <h1 className='font-orbitron font-bold text-2xl text-white tracking-wider'>{marketName}</h1>
                <div className='w-64 h-px bg-gradient-to-r from-cyber-purple/50 to-transparent mt-2' />
            </div>

            {/* Wallet connect */}
            {!walletPubkey ? (
                <button onClick={connectWallet} disabled={connecting}
                    className='self-start font-orbitron text-xs tracking-widest uppercase border border-cyber-cyan text-cyber-cyan px-6 py-3 hover:bg-cyber-cyan/10 transition-all duration-200 disabled:opacity-50'>
                    {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
            ) : (
                <div className='flex items-center gap-3'>
                    <div className='w-2 h-2 rounded-full bg-neon-green' />
                    <p className='font-mono text-xs text-neon-green'>{walletPubkey.slice(0, 8)}...{walletPubkey.slice(-6)}</p>
                    <button onClick={() => { setWalletPubkey(''); setHasBettorProfile(false); setBettorWalletBalance(null) }}
                        className='text-xs text-gray-600 underline'>Disconnect</button>
                </div>
            )}

            {/* ── Betting wallet section (shown when wallet connected) ─────────── */}
            {walletPubkey && (
                <>
                    {loadingProfile ? (
                        <div className='border border-gray-700/30 bg-dark-panel/30 p-4'>
                            <p className='text-xs text-gray-600 font-orbitron tracking-widest animate-pulse'>LOADING PROFILE...</p>
                        </div>
                    ) : !hasBettorProfile ? (
                        /* ── Create profile ──────────────────────────────────────── */
                        <div className='border border-cyber-cyan/30 bg-dark-panel/60 p-5 flex flex-col gap-3'
                            style={{ boxShadow: '0 0 20px rgba(0,212,255,0.06)' }}>
                            <div>
                                <p className='font-orbitron text-xs text-cyber-cyan tracking-widest uppercase'>Create Betting Profile</p>
                                <p className='text-xs text-gray-500 mt-1'>
                                    You need a profile to bet. Deposit SOL into your in-protocol betting wallet to activate.
                                </p>
                            </div>
                            <div className='flex items-center gap-3'>
                                <input
                                    type='number' min={1} value={profileDeposit}
                                    onChange={e => setProfileDeposit(e.target.value)}
                                    className='w-24 bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-cyan text-center'
                                />
                                <span className='text-xs text-gray-500'>SOL</span>
                                <button
                                    onClick={handleCreateProfile}
                                    disabled={creatingProfile}
                                    className='font-orbitron text-xs tracking-widest uppercase border border-cyber-cyan text-cyber-cyan px-5 py-2 hover:bg-cyber-cyan/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                                    {creatingProfile ? 'Creating...' : 'Activate'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── Profile exists: show balance + top-up ───────────────── */
                        <div className='border border-gray-700/30 bg-dark-panel/40 p-4 flex flex-wrap items-center gap-4'>
                            <div>
                                <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Betting Wallet</p>
                                <p className='font-mono text-sm text-cyber-cyan mt-0.5'>
                                    {bettorWalletBalance !== null ? `${bettorWalletBalance.toFixed(4)} SOL` : '...'}
                                </p>
                                <p className='text-xs text-gray-600 mt-0.5'>In-protocol balance (separate from Phantom)</p>
                            </div>
                            <div className='flex items-center gap-2 ml-auto flex-wrap'>
                                <input
                                    type='number' min={1} value={depositAmount}
                                    onChange={e => setDepositAmount(e.target.value)}
                                    className='w-20 bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-cyan text-center'
                                />
                                <span className='text-xs text-gray-500'>SOL</span>
                                <button
                                    onClick={handleDeposit}
                                    disabled={depositing || withdrawing}
                                    className='font-orbitron text-xs tracking-widest uppercase border border-gray-600 text-gray-400 px-4 py-2 hover:border-cyber-cyan hover:text-cyber-cyan transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                                    {depositing ? 'Depositing...' : 'Top Up'}
                                </button>
                                <button
                                    onClick={handleWithdraw}
                                    disabled={withdrawing || depositing || !bettorWalletBalance}
                                    className='font-orbitron text-xs tracking-widest uppercase border border-gray-600 text-gray-400 px-4 py-2 hover:border-red-400 hover:text-red-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                                    {withdrawing ? 'Withdrawing...' : 'Withdraw All'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Loading market */}
            {loadingMarket && (
                <div className='border border-cyber-purple/20 bg-dark-panel/40 p-8 text-center'>
                    <p className='text-gray-500 font-orbitron text-xs tracking-widest animate-pulse'>LOADING MARKET DATA...</p>
                </div>
            )}

            {/* Market load error */}
            {!loadingMarket && !marketData && (
                <div className='border border-red-500/30 bg-red-500/5 p-6'>
                    <p className='text-red-400 text-sm'>Failed to load market data from chain.</p>
                    <button onClick={loadMarket} className='text-xs text-cyber-cyan underline mt-2'>Retry</button>
                </div>
            )}

            {/* Market content */}
            {marketData && (
                <>
                    {/* Market info */}
                    <div className='border border-cyber-purple/30 bg-dark-panel/60 p-6 flex flex-col gap-3'
                        style={{ boxShadow: '0 0 30px rgba(153,69,255,0.08)' }}>
                        <div className='flex items-center justify-between'>
                            <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Market Question</p>
                            <span className={`font-orbitron text-xs tracking-widest px-2 py-0.5 border ${isResolved
                                ? 'border-neon-green/40 text-neon-green bg-neon-green/5'
                                : 'border-cyber-cyan/40 text-cyber-cyan bg-cyber-cyan/5'}`}>
                                {isResolved ? 'RESOLVED' : 'ACTIVE'}
                            </span>
                        </div>
                        <h2 className='font-bold text-white text-lg'>{marketData.marketName}</h2>
                        <p className='text-gray-400 text-sm'>{marketData.description}</p>
                        <p className='text-xs text-gray-600'>
                            Deadline: <span className='text-gray-400'>{deadlineDate?.toLocaleString()}</span>
                        </p>
                        {isResolved && (
                            <p className='text-sm font-orbitron tracking-widest'>
                                Outcome: <span className={outcomeLabel === 'YES' ? 'text-neon-green' : 'text-red-400'}>{outcomeLabel}</span>
                            </p>
                        )}
                    </div>

                    {/* Odds bars */}
                    <div className='border border-cyber-cyan/20 bg-dark-panel/40 p-5 flex flex-col gap-3'>
                        <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Current Odds</p>
                        {(['yes', 'no'] as const).map(side => (
                            <div key={side} className='flex items-center gap-3'>
                                <span className={`font-orbitron text-xs w-8 ${side === 'yes' ? 'text-neon-green' : 'text-red-400'}`}>
                                    {side.toUpperCase()}
                                </span>
                                <div className='flex-1 h-3 bg-black/40 rounded-full overflow-hidden'>
                                    <div
                                        className={`h-full transition-all duration-500 rounded-full ${side === 'yes' ? 'bg-neon-green' : 'bg-red-500'}`}
                                        style={{ width: `${((side === 'yes' ? prob.yes : prob.no) * 100).toFixed(1)}%` }}
                                    />
                                </div>
                                <span className={`font-orbitron text-sm w-12 text-right ${side === 'yes' ? 'text-neon-green' : 'text-red-400'}`}>
                                    {((side === 'yes' ? prob.yes : prob.no) * 100).toFixed(1)}%
                                </span>
                            </div>
                        ))}
                        <p className='text-xs text-gray-600 mt-1'>
                            Total shares: {qY.toLocaleString()} YES / {qN.toLocaleString()} NO
                        </p>
                    </div>

                    {/* User shares */}
                    {walletPubkey && (userYesShares > 0 || userNoShares > 0) && (
                        <div className='border border-gray-700/40 bg-dark-panel/30 p-4 flex gap-6'>
                            <div>
                                <p className='text-xs text-gray-500 font-orbitron tracking-widest'>YOUR YES</p>
                                <p className='text-neon-green font-bold text-lg'>{userYesShares}</p>
                            </div>
                            <div>
                                <p className='text-xs text-gray-500 font-orbitron tracking-widest'>YOUR NO</p>
                                <p className='text-red-400 font-bold text-lg'>{userNoShares}</p>
                            </div>
                        </div>
                    )}

                    {/* Buy shares */}
                    {isActive && (
                        <div className='border border-cyber-purple/30 bg-dark-panel/60 p-5 flex flex-col gap-4'>
                            <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Buy Shares</p>

                            {insufficientFunds && (
                                <div className='border border-yellow-500/30 bg-yellow-500/5 px-3 py-2'>
                                    <p className='text-xs text-yellow-400'>
                                        Your betting wallet has {bettorWalletBalance?.toFixed(4)} SOL — not enough for this trade. Top up above.
                                    </p>
                                </div>
                            )}

                            <div className='flex items-center gap-3'>
                                <label className='text-xs text-gray-400 w-20'>Shares</label>
                                <input
                                    type='number' min={1} max={1000} value={shares}
                                    onChange={e => setShares(Math.max(1, parseInt(e.target.value) || 1))}
                                    className='w-24 bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-purple text-center'
                                />
                            </div>
                            <div className='flex gap-3'>
                                <button onClick={() => handleBuy(true)} disabled={buying || !walletPubkey || !hasBettorProfile}
                                    className='flex-1 flex flex-col items-center gap-1 border border-neon-green/50 bg-neon-green/5 px-4 py-3 hover:bg-neon-green/10 hover:border-neon-green transition-all duration-200 disabled:border-gray-700 disabled:bg-transparent disabled:cursor-not-allowed'>
                                    <span className='font-orbitron font-bold text-xs text-neon-green tracking-widest'>BUY YES</span>
                                    <span className='text-xs text-gray-400'>~{estCostYes.toFixed(4)} SOL</span>
                                </button>
                                <button onClick={() => handleBuy(false)} disabled={buying || !walletPubkey || !hasBettorProfile}
                                    className='flex-1 flex flex-col items-center gap-1 border border-red-500/50 bg-red-500/5 px-4 py-3 hover:bg-red-500/10 hover:border-red-500 transition-all duration-200 disabled:border-gray-700 disabled:bg-transparent disabled:cursor-not-allowed'>
                                    <span className='font-orbitron font-bold text-xs text-red-400 tracking-widest'>BUY NO</span>
                                    <span className='text-xs text-gray-400'>~{estCostNo.toFixed(4)} SOL</span>
                                </button>
                            </div>
                            {buying && <p className='text-xs text-gray-500 text-center animate-pulse'>Processing transaction...</p>}
                            {!walletPubkey && <p className='text-xs text-gray-600 text-center'>Connect wallet to buy shares</p>}
                            {walletPubkey && !hasBettorProfile && (
                                <p className='text-xs text-gray-600 text-center'>Create your betting profile above to buy shares</p>
                            )}
                        </div>
                    )}

                    {/* Claim winnings */}
                    {isResolved && (
                        <div className='border border-neon-green/20 bg-neon-green/5 p-5 flex flex-col gap-3'>
                            <p className='font-orbitron text-xs text-gray-500 tracking-widest uppercase'>Claim Winnings</p>
                            <p className='text-sm text-gray-400'>
                                Market resolved as <span className={outcomeLabel === 'YES' ? 'text-neon-green font-bold' : 'text-red-400 font-bold'}>{outcomeLabel}</span>.{' '}
                                Winnings are sent to your betting wallet (top of page).
                            </p>
                            {walletPubkey && (
                                <p className='text-xs text-gray-400'>
                                    Your winning shares: <span className='text-white font-bold'>{outcomeLabel === 'YES' ? userYesShares : userNoShares}</span>
                                </p>
                            )}
                            <button onClick={handleClaim} disabled={claiming || !walletPubkey || !hasBettorProfile}
                                className='self-start font-orbitron text-xs tracking-widest uppercase border border-neon-green text-neon-green px-6 py-3 hover:bg-neon-green/10 transition-all duration-200 disabled:border-gray-700 disabled:text-gray-600 disabled:cursor-not-allowed'>
                                {claiming ? 'Claiming...' : 'Claim Winnings'}
                            </button>
                        </div>
                    )}

                    {/* Admin: Resolve */}
                    {isAdmin && isActive && pastDeadline && (
                        <div className='border border-yellow-500/30 bg-yellow-500/5 p-5 flex flex-col gap-3'>
                            <p className='font-orbitron text-xs text-yellow-400 tracking-widest uppercase'>Admin — Resolve Market</p>
                            <p className='text-xs text-gray-400'>Deadline passed. Choose the correct outcome.</p>

                            {resolveConfirm === null ? (
                                /* Step 1 — pick outcome */
                                <div className='flex gap-3'>
                                    <button onClick={() => setResolveConfirm(true)} disabled={resolving}
                                        className='flex-1 font-orbitron text-xs tracking-widest uppercase border border-neon-green text-neon-green px-4 py-3 hover:bg-neon-green/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                                        Resolve YES
                                    </button>
                                    <button onClick={() => setResolveConfirm(false)} disabled={resolving}
                                        className='flex-1 font-orbitron text-xs tracking-widest uppercase border border-red-500 text-red-400 px-4 py-3 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                                        Resolve NO
                                    </button>
                                </div>
                            ) : (
                                /* Step 2 — confirm */
                                <div className='flex flex-col gap-3'>
                                    <p className='text-sm font-orbitron'>
                                        Confirm resolve as{' '}
                                        <span className={resolveConfirm ? 'text-neon-green font-bold' : 'text-red-400 font-bold'}>
                                            {resolveConfirm ? 'YES' : 'NO'}
                                        </span>
                                        ? <span className='text-xs text-gray-500 font-sans font-normal'>This cannot be undone.</span>
                                    </p>
                                    <div className='flex gap-3'>
                                        <button
                                            onClick={() => { handleResolve(resolveConfirm); setResolveConfirm(null) }}
                                            disabled={resolving}
                                            className={`flex-1 font-orbitron text-xs tracking-widest uppercase px-4 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border ${
                                                resolveConfirm
                                                    ? 'border-neon-green text-neon-green hover:bg-neon-green/10'
                                                    : 'border-red-500 text-red-400 hover:bg-red-500/10'
                                            }`}>
                                            {resolving ? 'Resolving...' : `Yes, Resolve ${resolveConfirm ? 'YES' : 'NO'}`}
                                        </button>
                                        <button onClick={() => setResolveConfirm(null)} disabled={resolving}
                                            className='font-orbitron text-xs tracking-widest uppercase border border-gray-600 text-gray-400 px-4 py-3 hover:border-gray-400 transition-all duration-200 disabled:opacity-50'>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <p className='text-xs text-gray-700 font-mono break-all'>Market: {marketPubkey}</p>
                </>
            )}
        </div>
    )
}
