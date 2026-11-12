'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { call } from '@/utils/village/client'
import { btnGhost, btnGold, input, nearAccountUrl, panel } from '../village/ui'

type PoolData = {
    pool: { balance: string; total_deposited: string; total_withdrawn: string; authority: string } | null
    limit: { remaining: string; max: string; resetsAt: number } | null
    account: string; walletBalance: string; minDeposit: string; contract: string
}

export default function PoolPanel({ onClose }: { onClose: () => void }) {
    const [data, setData] = useState<PoolData | null>(null)
    const [amount, setAmount] = useState(0.01)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try { setData(await call('pool:get')) } catch (e: any) { toast.error(e.message) }
    }, [])
    useEffect(() => { load() }, [load])

    const act = async (ev: string, ok: string) => {
        setBusy(true)
        try {
            const r = await call(ev, { amount })
            toast.success(<span>{ok} <a className='underline' href={`https://testnet.nearblocks.io/txns/${r.tx}`} target='_blank' rel='noreferrer'>tx ↗</a></span>)
            await load()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }

    return (
        <div className='absolute inset-0 z-50 grid place-items-center bg-black/50 p-2' onClick={onClose}>
            <div className={`${panel} w-[min(460px,100%)] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
                <div className='flex items-center gap-3 p-3 border-b border-[#5a4a36] bg-[#2a2119]'>
                    <h2 className='font-bold text-lg'>🏦 Team pool</h2>
                    <button onClick={onClose} className='ml-auto p-1 rounded hover:bg-[#3a2f24]' aria-label='Close'><XMarkIcon className='w-6 h-6' /></button>
                </div>
                <div className='p-4 flex flex-col gap-3 text-sm'>
                    <p className='text-[#cdb88f]'>A shared NEAR jar for this office: snacks, bounties, celebrations. Anyone can chip in; each person can take out up to {data?.limit?.max ?? '10'} NEAR per day.</p>
                    {!data ? <p>Loading from NEAR…</p> : (
                        <>
                            <div className='rounded-lg bg-[#2a2119] border border-[#5a4a36] p-3 text-center'>
                                <p className='text-3xl font-bold tabular-nums'>{data.pool?.balance ?? '0'} <span className='text-base'>NEAR</span></p>
                                <p className='text-xs text-[#cdb88f]'>{data.pool ? `${data.pool.total_deposited} in · ${data.pool.total_withdrawn} out` : 'Not opened yet: the first deposit opens it.'}</p>
                            </div>
                            <p className='text-xs'>Your wallet <a className='underline' href={nearAccountUrl(data.account)} target='_blank' rel='noreferrer'>{data.account}</a>: <b>{data.walletBalance} NEAR</b>
                                {data.limit && data.pool && <> · you can withdraw {data.limit.remaining} NEAR today</>}</p>
                            <div className='flex items-center gap-2'>
                                <input type='number' step={0.005} min={0.001} className={`${input} w-28`} value={amount} onChange={e => setAmount(Math.max(0.001, Number(e.target.value) || 0.001))} onKeyDown={e => e.stopPropagation()} />
                                <span>NEAR</span>
                                <button className={`${btnGold} ml-auto`} disabled={busy || amount < Number(data.minDeposit)} onClick={() => act('pool:deposit', `Added ${amount} NEAR to the pool`)}>Deposit</button>
                                <button className={btnGhost} disabled={busy || !data.pool} onClick={() => act('pool:withdraw', `Withdrew ${amount} NEAR to your wallet`)}>Withdraw</button>
                            </div>
                            <p className='text-[11px] text-[#cdb88f]'>Minimum deposit {data.minDeposit} NEAR. Contract <a className='underline' href={nearAccountUrl(data.contract)} target='_blank' rel='noreferrer'>{data.contract}</a>. Gas is paid by Hearthwork.</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
