import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'

export const SOL_POOL_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_SOL_POOL_PROGRAM_ID || '11111111111111111111111111111111'
)

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

// ─── PDA helpers ─────────────────────────────────────────────────────────────
// Solana seeds are capped at 32 bytes each. UUIDs are 36 bytes, so truncate.

function enc(s: string): Uint8Array {
    // Copy into a fresh ArrayBuffer so it satisfies Uint8Array<ArrayBuffer> (not ArrayBufferLike)
    const encoded = new TextEncoder().encode(s)
    const out = new Uint8Array(encoded.length)
    out.set(encoded)
    return out
}

function realmIdSeed(realmId: string): Uint8Array {
    const bytes = enc(realmId)
    return bytes.subarray(0, Math.min(bytes.length, 32))
}

export function getPoolStatePda(realmId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [enc('sol_pool_state'), realmIdSeed(realmId)],
        SOL_POOL_PROGRAM_ID
    )
}

export function getPoolVaultPda(realmId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [enc('sol_pool_vault'), realmIdSeed(realmId)],
        SOL_POOL_PROGRAM_ID
    )
}

export function getWithdrawalRecordPda(poolStatePubkey: PublicKey, walletPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [enc('withdrawal_record'), poolStatePubkey.toBytes(), walletPubkey.toBytes()],
        SOL_POOL_PROGRAM_ID
    )
}

// ─── Instruction discriminator ───────────────────────────────────────────────
// Anchor discriminator = SHA256("global:<instruction_name>")[0..8]

async function getDiscriminator(instructionName: string): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', enc(`global:${instructionName}`))
    return new Uint8Array(hash).subarray(0, 8)
}

// ─── Binary helpers ───────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const p of parts) { out.set(p, off); off += p.length }
    return out
}

function u32le(n: number): Uint8Array {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, true)
    return b
}

function u64le(n: bigint): Uint8Array {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigUint64(0, n, true)
    return b
}

// ─── On-chain state types ─────────────────────────────────────────────────────

export interface PoolState {
    authority: PublicKey
    realmId: string
    totalDeposited: bigint
    totalWithdrawn: bigint
    vaultBump: number
    bump: number
}

export interface WithdrawalRecord {
    wallet: PublicKey
    lastWithdrawalTimestamp: bigint
    withdrawnInWindow: bigint
    bump: number
}

// ─── Account decoders ─────────────────────────────────────────────────────────
// SolPoolState layout (after 8-byte discriminator):
//   authority:       Pubkey   (32 bytes)
//   realm_id:        String   (u32 LE length prefix + utf8 bytes)
//   total_deposited: u64      (8 bytes LE)
//   total_withdrawn: u64      (8 bytes LE)
//   vault_bump:      u8       (1 byte)
//   bump:            u8       (1 byte)

function decodePoolState(raw: Uint8Array): PoolState {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    let off = 8 // skip discriminator

    const authority = new PublicKey(raw.subarray(off, off + 32)); off += 32

    const realmIdLen = view.getUint32(off, true); off += 4
    const realmId = new TextDecoder().decode(raw.subarray(off, off + realmIdLen)); off += realmIdLen

    const totalDeposited = view.getBigUint64(off, true); off += 8
    const totalWithdrawn = view.getBigUint64(off, true); off += 8
    const vaultBump = view.getUint8(off++);
    const bump = view.getUint8(off++)

    return { authority, realmId, totalDeposited, totalWithdrawn, vaultBump, bump }
}

// WithdrawalRecord layout (after 8-byte discriminator):
//   wallet:                    Pubkey (32)
//   last_withdrawal_timestamp: i64    (8)
//   withdrawn_in_window:       u64    (8)
//   bump:                      u8     (1)

function decodeWithdrawalRecord(raw: Uint8Array): WithdrawalRecord {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    let off = 8

    const wallet = new PublicKey(raw.subarray(off, off + 32)); off += 32
    const lastWithdrawalTimestamp = view.getBigInt64(off, true); off += 8
    const withdrawnInWindow = view.getBigUint64(off, true); off += 8
    const bump = view.getUint8(off)

    return { wallet, lastWithdrawalTimestamp, withdrawnInWindow, bump }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function fetchPoolState(realmId: string): Promise<PoolState | null> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [poolStatePda] = getPoolStatePda(realmId)
    const accountInfo = await connection.getAccountInfo(poolStatePda)
    if (!accountInfo) return null
    const raw = accountInfo.data as unknown as Uint8Array
    return decodePoolState(raw)
}

export async function fetchVaultBalance(realmId: string): Promise<number> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [vaultPda] = getPoolVaultPda(realmId)
    const lamports = await connection.getBalance(vaultPda)
    return lamports / LAMPORTS_PER_SOL
}

export async function fetchWithdrawalRecord(realmId: string, walletPubkey: PublicKey): Promise<WithdrawalRecord | null> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [poolStatePda] = getPoolStatePda(realmId)
    const [recordPda] = getWithdrawalRecordPda(poolStatePda, walletPubkey)
    const accountInfo = await connection.getAccountInfo(recordPda)
    if (!accountInfo) return null
    const raw = accountInfo.data as unknown as Uint8Array
    return decodeWithdrawalRecord(raw)
}

// Returns how many lamports the wallet can still withdraw today (0–10 SOL)
export async function getRemainingDailyLimit(realmId: string, walletPubkey: PublicKey): Promise<bigint> {
    const MAX = BigInt(10_000_000_000)
    const WINDOW = BigInt(86_400)

    const record = await fetchWithdrawalRecord(realmId, walletPubkey)
    if (!record) return MAX

    const nowSec = BigInt(Math.floor(Date.now() / 1000))
    const windowExpired = nowSec - record.lastWithdrawalTimestamp > WINDOW
    if (windowExpired) return MAX

    const used = record.withdrawnInWindow > MAX ? MAX : record.withdrawnInWindow
    return MAX - used
}

// ─── Transaction builders ─────────────────────────────────────────────────────

export async function buildInitializePoolTx(realmId: string, authorityPubkey: PublicKey): Promise<Transaction> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [poolStatePda] = getPoolStatePda(realmId)
    const [vaultPda] = getPoolVaultPda(realmId)

    const discriminator = await getDiscriminator('initialize_pool')
    const realmIdBytes = enc(realmId)
    // Borsh string: u32 LE length prefix + utf8 bytes
    const data = concat(discriminator, u32le(realmIdBytes.length), realmIdBytes)

    const ix = new TransactionInstruction({
        programId: SOL_POOL_PROGRAM_ID,
        keys: [
            { pubkey: authorityPubkey, isSigner: true, isWritable: true },
            { pubkey: poolStatePda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
    })

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: authorityPubkey, recentBlockhash: blockhash })
    tx.add(ix)
    return tx
}

export async function buildDepositTx(realmId: string, depositorPubkey: PublicKey, amountLamports: bigint): Promise<Transaction> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [poolStatePda] = getPoolStatePda(realmId)
    const [vaultPda] = getPoolVaultPda(realmId)

    const discriminator = await getDiscriminator('deposit')
    const data = concat(discriminator, u64le(amountLamports))

    const ix = new TransactionInstruction({
        programId: SOL_POOL_PROGRAM_ID,
        keys: [
            { pubkey: depositorPubkey, isSigner: true, isWritable: true },
            { pubkey: poolStatePda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
    })

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: depositorPubkey, recentBlockhash: blockhash })
    tx.add(ix)
    return tx
}

export async function buildWithdrawTx(realmId: string, requesterPubkey: PublicKey, amountLamports: bigint): Promise<Transaction> {
    const connection = new Connection(RPC_URL, 'confirmed')
    const [poolStatePda] = getPoolStatePda(realmId)
    const [vaultPda] = getPoolVaultPda(realmId)
    const [recordPda] = getWithdrawalRecordPda(poolStatePda, requesterPubkey)

    const discriminator = await getDiscriminator('withdraw')
    const data = concat(discriminator, u64le(amountLamports))

    const ix = new TransactionInstruction({
        programId: SOL_POOL_PROGRAM_ID,
        keys: [
            { pubkey: requesterPubkey, isSigner: true, isWritable: true },
            { pubkey: poolStatePda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: recordPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
    })

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: requesterPubkey, recentBlockhash: blockhash })
    tx.add(ix)
    return tx
}

// ─── Sign & send helper ───────────────────────────────────────────────────────

export async function signAndSend(tx: Transaction, provider?: any): Promise<string> {
    const solana = provider ?? (window as any).solana
    if (!solana) throw new Error('No wallet connected')

    const connection = new Connection(RPC_URL, 'confirmed')
    const signed = await solana.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize())
    await connection.confirmTransaction(sig, 'confirmed')
    return sig
}
