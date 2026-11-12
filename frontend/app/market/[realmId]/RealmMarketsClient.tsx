'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'

const PROGRAM_ID_STR = 'BZ21yPSaWuGgpwaHT9yAZ5KUoGjNZ5R2fFukhhcZQiKg'
const META_PROG_STR  = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
const RPC_URL        = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

async function buildProgram(walletPubkeyStr: string) {
    const { Connection, PublicKey, SystemProgram } = await import('@solana/web3.js')
    const { Program, AnchorProvider, BN }          = await import('@coral-xyz/anchor')
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
    const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    const META_PROG  = new PublicKey(META_PROG_STR)

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('admin_config')], PROG_ID)

    return { program, connection, BN, PublicKey, SystemProgram, PROG_ID, TOKEN_PROG, META_PROG, configPda, walletPk }
}

type Props = {
    realmId:           string
    realmName:         string
    marketAdminPubkey: string | null
    token:             string
}

export default function RealmMarketsClient({ realmId, realmName, marketAdminPubkey, token }: Props) {
    const router = useRouter()

    const [walletPubkey, setWalletPubkey] = useState('')
    const [connecting,   setConnecting]   = useState(false)

    const [deployName,     setDeployName]     = useState('')
    const [deployDesc,     setDeployDesc]     = useState('')
    const [deployDeadline, setDeployDeadline] = useState('')
    const [deployLmsrB,    setDeployLmsrB]    = useState<number>(1)
    const [deploying,      setDeploying]      = useState(false)

    const isAdmin    = !!(walletPubkey && marketAdminPubkey && walletPubkey === marketAdminPubkey)
    const deployCost = (deployLmsrB * 0.693).toFixed(3)

    async function connectWallet() {
        const solana = (window as any).solana
        if (!solana) return toast.error('No Solana wallet found. Install Phantom or Solflare.')
        setConnecting(true)
        try {
            await solana.connect()
            setWalletPubkey(solana.publicKey.toString())
        } catch { toast.error('Wallet connection cancelled.') }
        setConnecting(false)
    }

    async function handleDeploy() {
        if (!walletPubkey)      return toast.error('Connect your wallet first.')
        if (!isAdmin)           return toast.error('Only the market admin can deploy markets.')
        if (!deployName.trim()) return toast.error('Market question is required.')
        if (!deployDesc.trim()) return toast.error('Description is required.')
        if (!deployDeadline)    return toast.error('Deadline is required.')

        const deadlineUnix = Math.floor(new Date(deployDeadline).getTime() / 1000)
        if (deadlineUnix <= Math.floor(Date.now() / 1000))
            return toast.error('Deadline must be in the future.')

        setDeploying(true)
        try {
            const { program, connection, BN, PublicKey, SystemProgram, PROG_ID, TOKEN_PROG, META_PROG, configPda, walletPk } = await buildProgram(walletPubkey)
            const SYSVAR_RENT = new PublicKey('SysvarRent111111111111111111111111111111111')

            const nameBytes   = Buffer.from(deployName.trim()).subarray(0, 32)
            const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), configPda.toBytes(), nameBytes], PROG_ID)
            const [mintYes]   = PublicKey.findProgramAddressSync([Buffer.from('mint_yes'), marketPda.toBytes()], PROG_ID)
            const [mintNo]    = PublicKey.findProgramAddressSync([Buffer.from('mint_no'),  marketPda.toBytes()], PROG_ID)
            const [vaultPda]  = PublicKey.findProgramAddressSync([Buffer.from('market_vault'), marketPda.toBytes()], PROG_ID)
            const [metaYes]   = PublicKey.findProgramAddressSync([Buffer.from('metadata'), META_PROG.toBytes(), mintYes.toBytes()], META_PROG)
            const [metaNo]    = PublicKey.findProgramAddressSync([Buffer.from('metadata'), META_PROG.toBytes(), mintNo.toBytes()],  META_PROG)

            const sig = await (program.methods as any)
                .createMarket(
                    {
                        name:        deployName.trim(),
                        description: deployDesc.trim(),
                        deadLine:    new BN(deadlineUnix),
                        lmsrB:       new BN(deployLmsrB),
                    },
                    {
                        yesName:   `${deployName.trim()} YES`,
                        yesSymbol: 'YES',
                        yesUri:    '',
                        noName:    `${deployName.trim()} NO`,
                        noSymbol:  'NO',
                        noUri:     '',
                    }
                )
                .accounts({
                    admin:                walletPk,
                    gatherConfig:         configPda,
                    gatherMarket:         marketPda,
                    marketVaultAccount:   vaultPda,
                    mintYes,
                    mintNo,
                    metadataYes:          metaYes,
                    metadataNo:           metaNo,
                    systemProgram:        SystemProgram.programId,
                    tokenProgram:         TOKEN_PROG,
                    tokenMetadataProgram: META_PROG,
                    rent:                 SYSVAR_RENT,
                })
                .rpc()

            await connection.confirmTransaction(sig, 'confirmed')

            // Save to realm_markets table
            const API_URL  = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
            const saveResp = await fetch(`${API_URL}/realms/${realmId}/markets`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ market_pubkey: marketPda.toString(), market_name: deployName.trim() }),
            })

            if (!saveResp.ok) {
                toast.error('Market deployed but failed to save. Pubkey: ' + marketPda.toString())
            } else {
                toast.success(`"${deployName.trim()}" deployed!`)
                setDeployName('')
                setDeployDesc('')
                setDeployDeadline('')
                setDeployLmsrB(1)
                router.refresh()
            }
        } catch (err: any) {
            const msg: string = err?.message || ''
            if (msg.includes('NotEnoughAmount') || msg.includes('0x177b'))
                toast.error(`Not enough SOL. Need ~${deployCost} SOL for liquidity.`)
            else if (msg.includes('already in use'))
                toast.error('A market with that name already exists on-chain. Use a different question.')
            else
                toast.error('Transaction failed: ' + msg.slice(0, 120))
        }
        setDeploying(false)
    }

    return (
        <div className='border border-cyber-purple/30 bg-dark-panel/60 p-6 flex flex-col gap-5'
            style={{ boxShadow: '0 0 30px rgba(153,69,255,0.08)' }}>

            <div>
                <p className='font-orbitron text-xs text-cyber-purple tracking-widest uppercase'>Deploy New Market</p>
                <div className='w-32 h-px bg-cyber-purple/30 mt-2' />
            </div>

            {/* Wallet */}
            {!walletPubkey ? (
                <button
                    onClick={connectWallet}
                    disabled={connecting}
                    className='self-start font-orbitron text-xs tracking-widest uppercase border border-cyber-cyan text-cyber-cyan px-5 py-2.5 hover:bg-cyber-cyan/10 transition-all duration-200 disabled:opacity-50'
                >
                    {connecting ? 'Connecting...' : 'Connect Admin Wallet'}
                </button>
            ) : (
                <div className='flex items-center gap-3'>
                    <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-neon-green' : 'bg-red-500'}`} />
                    <p className='font-mono text-xs text-gray-400'>{walletPubkey.slice(0, 8)}...{walletPubkey.slice(-6)}</p>
                    {!isAdmin && <p className='text-xs text-red-400'>Not the admin wallet</p>}
                    <button onClick={() => setWalletPubkey('')} className='text-xs text-gray-600 underline'>Disconnect</button>
                </div>
            )}

            {/* Deploy form — only shown when admin wallet is connected */}
            {isAdmin && (
                <div className='flex flex-col gap-3 border-t border-cyber-purple/20 pt-4'>

                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-gray-500'>Market Question *</label>
                        <input
                            type='text'
                            placeholder='e.g. Will SOL hit $500 by end of 2025?'
                            value={deployName}
                            onChange={e => setDeployName(e.target.value)}
                            maxLength={48}
                            className='bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-purple'
                        />
                        <p className='text-xs text-gray-700'>Must be unique on-chain — used as the market identifier.</p>
                    </div>

                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-gray-500'>Description *</label>
                        <textarea
                            placeholder='Describe the resolution criteria...'
                            value={deployDesc}
                            onChange={e => setDeployDesc(e.target.value)}
                            maxLength={100}
                            rows={2}
                            className='bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-purple resize-none'
                        />
                    </div>

                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-gray-500'>Resolution Deadline *</label>
                        <input
                            type='datetime-local'
                            value={deployDeadline}
                            onChange={e => setDeployDeadline(e.target.value)}
                            className='bg-black/40 border border-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-cyber-purple'
                        />
                    </div>

                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-gray-500'>
                            Liquidity (B) — Initial cost: <span className='text-neon-green'>~{deployCost} SOL</span>
                        </label>
                        <div className='flex items-center gap-3'>
                            <input
                                type='range' min={1} max={10} step={1}
                                value={deployLmsrB}
                                onChange={e => setDeployLmsrB(Number(e.target.value))}
                                className='flex-1 accent-cyber-purple'
                            />
                            <span className='text-white text-sm w-4'>{deployLmsrB}</span>
                        </div>
                        <p className='text-xs text-gray-700'>Higher B = more liquidity, smoother prices, higher upfront cost.</p>
                    </div>

                    <button
                        onClick={handleDeploy}
                        disabled={deploying || !deployName.trim() || !deployDesc.trim() || !deployDeadline}
                        className='self-start font-orbitron text-xs tracking-widest uppercase border border-cyber-purple text-cyber-purple px-6 py-3 hover:bg-cyber-purple/10 transition-all duration-200 disabled:border-gray-700 disabled:text-gray-600 disabled:cursor-not-allowed'
                    >
                        {deploying ? 'Deploying...' : 'Deploy Market on Solana'}
                    </button>
                </div>
            )}
        </div>
    )
}
