'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import useGatherProgram from '@/hooks/useGatherProgram';
import MarketCard from './MarketCard';
import CreateMarketModal from './CreateMarketModal';

export default function Dashboard() {
  const { publicKey } = useWallet();
  const {
    markets,
    config,
    isAdmin,
    loading,
    hasBettorProfile,
    bettorWalletBalance,
    createMarket,
    resolveMarket,
    buyShares,
    claimBettorAmount,
    getUserShares,
    initBettorProfile,
    depositBettorWallet,
    refreshMarkets,
  } = useGatherProgram();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileDeposit, setProfileDeposit] = useState('1');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [depositAmount, setDepositAmount] = useState('1');
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState('');

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount);
    if (!amount || amount <= 0) {
      setDepositError('Enter a valid SOL amount');
      return;
    }
    setDepositError('');
    setDepositing(true);
    try {
      await depositBettorWallet(amount);
      setDepositAmount('1');
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('WalletSignTransactionError') || msg.includes('User rejected')) {
        setDepositError('Transaction cancelled');
      } else if (msg.includes('insufficient lamports') || msg.includes('0x1')) {
        setDepositError('Not enough SOL in your main wallet');
      } else {
        setDepositError(msg || 'Deposit failed');
      }
    } finally {
      setDepositing(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCreateProfile = async () => {
    const amount = parseInt(profileDeposit);
    if (!amount || amount <= 0) {
      setProfileError('Enter a valid SOL amount');
      return;
    }
    setProfileError('');
    setCreatingProfile(true);
    try {
      await initBettorProfile(amount);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('insufficient lamports') || msg.includes('0x1')) {
        setProfileError(`Not enough SOL. Reduce the deposit amount or airdrop more SOL to your wallet.`);
      } else {
        setProfileError(msg || 'Failed to create profile');
      }
    } finally {
      setCreatingProfile(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="pixel text-6xl text-cyan-400 mb-2 tracking-widest">HEARTHWORK</div>
          <div className="pixel text-xl text-cyan-300/60 mb-8 tracking-widest">PREDICTION ROOMS</div>
          <div className="w-48 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent mx-auto mb-8" />
          <p className="text-cyan-300/50 mb-8 tracking-wider text-sm">[ CONNECT WALLET TO ENTER ]</p>
          {mounted && (
            <WalletMultiButton className="!bg-cyan-500/20 hover:!bg-cyan-500/30 !text-cyan-300 !border !border-cyan-500/40 !font-mono !tracking-wider" />
          )}
        </div>
      </div>
    );
  }

  const activeMarkets = markets.filter(m => 'active' in m.account.marketState);
  const resolvedMarkets = markets.filter(m => 'resolved' in m.account.marketState);

  return (
    <div className="min-h-screen">
      {/* HUD Header */}
      <header className="border-b border-cyan-500/20 bg-[#0a1120]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="pixel text-2xl text-cyan-400 tracking-widest">HEARTHWORK</span>
              {config && (
                <span className="text-xs text-cyan-400/50 border border-cyan-500/20 px-2 py-0.5 rounded font-mono">
                  FEE {config.fees / 100}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <span className="pixel text-yellow-400 border border-yellow-500/40 px-3 py-0.5 text-sm tracking-wider bg-yellow-500/10">
                  ★ ADMIN
                </span>
              )}
              {hasBettorProfile && (
                <span className="pixel text-green-400 border border-green-500/30 px-3 py-0.5 text-sm tracking-wider bg-green-500/10">
                  ● ONLINE
                </span>
              )}
              {bettorWalletBalance !== null && (
                <span className="font-mono text-sm text-cyan-300 border border-cyan-500/20 px-3 py-0.5 bg-cyan-500/10">
                  {bettorWalletBalance.toFixed(4)} SOL
                </span>
              )}
              {mounted && (
                <WalletMultiButton className="!bg-cyan-500/10 hover:!bg-cyan-500/20 !text-cyan-300 !border !border-cyan-500/30 !font-mono !text-sm" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Create Bettor Profile Banner */}
        {!hasBettorProfile && (
          <div className="mb-6 border border-cyan-500/30 bg-cyan-500/5 p-4 relative">
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-400/60" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-400/60" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-400/60" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-400/60" />
            <p className="pixel text-cyan-400 tracking-widest mb-1 text-lg">[ CREATE PLAYER PROFILE ]</p>
            <p className="text-cyan-300/50 text-xs mb-3 font-mono">
              You need a profile to enter betting rooms. Deposit SOL to activate.
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                value={profileDeposit}
                onChange={(e) => setProfileDeposit(e.target.value)}
                placeholder="SOL"
                className="w-24 px-3 py-1.5 bg-black/40 border border-cyan-500/30 text-cyan-300 text-sm font-mono focus:outline-none focus:border-cyan-400 placeholder-cyan-500/30"
              />
              <span className="text-cyan-400/50 text-sm font-mono">SOL</span>
              <button
                onClick={handleCreateProfile}
                disabled={creatingProfile}
                className="btn-pixel px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 text-cyan-300 border border-cyan-500/40 tracking-wider"
              >
                {creatingProfile ? 'LOADING...' : 'ACTIVATE'}
              </button>
            </div>
            {profileError && <p className="text-red-400 text-xs mt-2 font-mono">{profileError}</p>}
          </div>
        )}

        {/* Deposit Banner */}
        {hasBettorProfile && (
          <div className="mb-6 border border-white/10 bg-white/3 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="pixel text-cyan-300/70 tracking-wider text-sm">TOP UP WALLET</span>
              <input
                type="number"
                min="1"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="SOL"
                className="w-20 px-3 py-1 bg-black/40 border border-white/10 text-cyan-300 text-sm font-mono focus:outline-none focus:border-cyan-400 placeholder-cyan-500/30"
              />
              <span className="text-cyan-400/40 text-sm font-mono">SOL</span>
              <button
                onClick={handleDeposit}
                disabled={depositing}
                className="btn-pixel px-4 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-cyan-300 border border-white/10 tracking-wider text-sm"
              >
                {depositing ? 'SENDING...' : 'DEPOSIT'}
              </button>
              {depositError && <p className="text-red-400 text-xs font-mono">{depositError}</p>}
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="pixel text-2xl text-cyan-400 tracking-widest mb-1">BETTING ROOMS</p>
            <p className="font-mono text-xs text-cyan-400/40">
              {activeMarkets.length} OPEN
              {resolvedMarkets.length > 0 && ` · ${resolvedMarkets.length} CLOSED`}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={refreshMarkets}
              className="btn-pixel px-4 py-1.5 bg-white/5 hover:bg-white/10 text-cyan-300/70 border border-white/10 tracking-wider text-sm"
            >
              ↻ REFRESH
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-pixel px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 tracking-wider text-sm"
              >
                + OPEN ROOM
              </button>
            )}
          </div>
        </div>

        {/* Markets */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="pixel text-cyan-400/50 tracking-widest">LOADING ROOMS...</p>
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center py-20">
            <div className="pixel text-5xl text-cyan-400/20 mb-4">[ EMPTY ]</div>
            <p className="pixel text-xl text-cyan-300/40 tracking-widest mb-2">NO ROOMS FOUND</p>
            <p className="font-mono text-xs text-cyan-400/30">
              {isAdmin ? 'Open a new room to get started' : 'Check back soon for new rooms'}
            </p>
          </div>
        ) : (
          <>
            {/* Active Markets */}
            {activeMarkets.length > 0 && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                  <span className="pixel text-green-400 tracking-widest text-lg">OPEN ROOMS</span>
                  <div className="flex-1 h-px bg-green-400/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeMarkets.map((market) => (
                    <MarketCard
                      key={market.publicKey.toString()}
                      market={market}
                      isAdmin={isAdmin}
                      hasBettorProfile={hasBettorProfile}
                      onResolve={resolveMarket}
                      onBuyShares={buyShares}
                      onClaimRewards={claimBettorAmount}
                      getUserShares={getUserShares}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Markets */}
            {resolvedMarkets.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                  <span className="pixel text-slate-400 tracking-widest text-lg">CLOSED ROOMS</span>
                  <div className="flex-1 h-px bg-slate-400/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {resolvedMarkets.map((market) => (
                    <MarketCard
                      key={market.publicKey.toString()}
                      market={market}
                      isAdmin={isAdmin}
                      hasBettorProfile={hasBettorProfile}
                      onResolve={resolveMarket}
                      onBuyShares={buyShares}
                      onClaimRewards={claimBettorAmount}
                      getUserShares={getUserShares}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Market Modal */}
      {showCreateModal && (
        <CreateMarketModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createMarket}
        />
      )}
    </div>
  );
}
