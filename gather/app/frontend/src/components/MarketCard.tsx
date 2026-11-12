import { useState, useEffect } from 'react';
import { Market } from '@/hooks/useGatherProgram';
import { PublicKey } from '@solana/web3.js';

interface MarketCardProps {
  market: Market;
  isAdmin: boolean;
  hasBettorProfile: boolean;
  onResolve: (marketPda: PublicKey, outcome: 'yes' | 'no') => Promise<string | undefined>;
  onBuyShares: (marketPda: PublicKey, amount: number, isYes: boolean) => Promise<string | undefined>;
  onClaimRewards: (marketPda: PublicKey, sharesAmount: number) => Promise<string | undefined>;
  getUserShares: (marketPda: PublicKey) => Promise<{ yesShares: number; noShares: number }>;
}

export default function MarketCard({ market, isAdmin, hasBettorProfile, onResolve, onBuyShares, onClaimRewards, getUserShares }: MarketCardProps) {
  const { publicKey, account } = market;

  const [amount, setAmount] = useState('1');
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [winningShares, setWinningShares] = useState<number | null>(null);

  const isActive = 'active' in account.marketState;
  const isResolved = 'resolved' in account.marketState;
  const isYesOutcome = 'yes' in account.marketOutcome;
  const isNoOutcome = 'no' in account.marketOutcome;

  const totalShares = account.outcomeYesShares.add(account.outcomeNoShares);
  const yesPercentage = totalShares.isZero()
    ? 50
    : account.outcomeYesShares.toNumber() / totalShares.toNumber() * 100;

  const deadline = new Date(account.deadLine.toNumber() * 1000);
  const isExpired = deadline < new Date();

  useEffect(() => {
    if (isResolved && hasBettorProfile) {
      getUserShares(publicKey).then(({ yesShares, noShares }) => {
        const shares = isYesOutcome ? yesShares : noShares;
        setWinningShares(shares);
        if (shares > 0) setClaimAmount(shares.toString());
      });
    }
  }, [isResolved, hasBettorProfile, publicKey.toString()]);

  const parseError = (e: any): string => {
    const msg: string = e?.message ?? '';
    if (
      msg.includes('WalletSignTransactionError') ||
      msg.includes('User rejected') ||
      msg.includes('Transaction cancelled') ||
      msg.includes('rejected the request')
    ) {
      return 'Transaction cancelled';
    }
    if (msg.includes('NotEnoughShares') || msg.includes('0x1775')) {
      return 'Not enough shares in your wallet';
    }
    if (msg.includes('NotEnoughAmount') || msg.includes('insufficient lamports') || msg.includes('0x1')) {
      return 'Not enough SOL in your bettor wallet';
    }
    return msg || 'Transaction failed';
  };

  const handleClaim = async () => {
    const parsed = parseInt(claimAmount);
    if (!parsed || parsed <= 0) {
      setClaimError('Enter a valid share amount');
      return;
    }
    setClaimError('');
    setClaiming(true);
    try {
      await onClaimRewards(publicKey, parsed);
      setWinningShares(0);
      setClaimAmount('0');
    } catch (e: any) {
      setClaimError(parseError(e));
    } finally {
      setClaiming(false);
    }
  };

  const handleBuy = async (isYes: boolean) => {
    const parsed = parseInt(amount);
    if (!parsed || parsed <= 0) {
      setError('Enter a valid share amount');
      return;
    }
    setError('');
    setBuying(true);
    try {
      await onBuyShares(publicKey, parsed, isYes);
    } catch (e: any) {
      setError(parseError(e));
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className={`relative bg-[#0a1120]/80 border ${isActive ? 'border-green-500/25' : 'border-white/10'} p-4 scanlines`}>
      {/* Corner decorations */}
      <div className={`absolute top-0 left-0 w-3 h-3 border-t border-l ${isActive ? 'border-green-400/50' : 'border-white/20'}`} />
      <div className={`absolute top-0 right-0 w-3 h-3 border-t border-r ${isActive ? 'border-green-400/50' : 'border-white/20'}`} />
      <div className={`absolute bottom-0 left-0 w-3 h-3 border-b border-l ${isActive ? 'border-green-400/50' : 'border-white/20'}`} />
      <div className={`absolute bottom-0 right-0 w-3 h-3 border-b border-r ${isActive ? 'border-green-400/50' : 'border-white/20'}`} />

      {/* Status badge */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="pixel text-base text-cyan-100 flex-1 leading-tight tracking-wide pr-2">
          {account.marketName}
        </h3>
        <span className={`pixel text-xs tracking-wider px-2 py-0.5 shrink-0 ${
          isActive
            ? 'text-green-400 bg-green-500/10 border border-green-500/30'
            : 'text-slate-400 bg-slate-500/10 border border-slate-500/20'
        }`}>
          {isActive ? '● OPEN' : '■ CLOSED'}
        </span>
      </div>

      {/* Description */}
      <p className="text-cyan-300/40 text-xs mb-3 font-mono line-clamp-2">{account.description}</p>

      {/* Deadline */}
      <div className="text-xs font-mono text-cyan-400/40 mb-3">
        DEADLINE: {deadline.toLocaleDateString()}
        {isExpired && isActive && <span className="text-red-400 ml-2">[EXPIRED]</span>}
      </div>

      {/* Probability bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs font-mono mb-1">
          <span className="text-green-400">YES {yesPercentage.toFixed(1)}%</span>
          <span className="text-red-400">NO {(100 - yesPercentage).toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-black/50 border border-white/10 overflow-hidden">
          <div
            className="h-full bg-green-500/60 transition-all"
            style={{ width: `${yesPercentage}%` }}
          />
        </div>
      </div>

      {/* Share counts */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-black/30 border border-green-500/15 p-2">
          <div className="pixel text-xs text-green-400/60 tracking-wider">YES SHARES</div>
          <div className="font-mono text-green-400 font-medium text-sm">
            {account.outcomeYesShares.toString()}
          </div>
        </div>
        <div className="bg-black/30 border border-red-500/15 p-2">
          <div className="pixel text-xs text-red-400/60 tracking-wider">NO SHARES</div>
          <div className="font-mono text-red-400 font-medium text-sm">
            {account.outcomeNoShares.toString()}
          </div>
        </div>
      </div>

      {/* Buy actions */}
      {isActive && (
        <div className="mb-2">
          {hasBettorProfile ? (
            <>
              <div className="mb-2">
                <label className="pixel text-xs text-cyan-400/50 tracking-wider mb-1 block">SHARES (WHOLE NUMBER)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-1.5 bg-black/40 border border-cyan-500/20 text-cyan-300 text-sm font-mono focus:outline-none focus:border-cyan-400 placeholder-cyan-500/30"
                />
                <p className="pixel text-xs text-cyan-400/30 mt-1 tracking-wide">PRICE CALCULATED BY LMSR</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBuy(true)}
                  disabled={buying}
                  className="btn-pixel flex-1 py-2 bg-green-500/15 hover:bg-green-500/25 disabled:opacity-40 text-green-400 border border-green-500/30 tracking-wider"
                >
                  {buying ? '...' : '▲ BUY YES'}
                </button>
                <button
                  onClick={() => handleBuy(false)}
                  disabled={buying}
                  className="btn-pixel flex-1 py-2 bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 text-red-400 border border-red-500/30 tracking-wider"
                >
                  {buying ? '...' : '▼ BUY NO'}
                </button>
              </div>
            </>
          ) : (
            <p className="pixel text-xs text-cyan-400/30 text-center py-2 tracking-wider">
              [ CREATE PROFILE TO ENTER ]
            </p>
          )}
          {error && <p className="text-red-400 text-xs mt-2 font-mono">{error}</p>}
        </div>
      )}

      {/* Claim rewards */}
      {isResolved && hasBettorProfile && (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            {isYesOutcome && <p className="pixel text-xs text-green-400 tracking-wider">OUTCOME: YES WON ▲</p>}
            {isNoOutcome && <p className="pixel text-xs text-red-400 tracking-wider">OUTCOME: NO WON ▼</p>}
          </div>
          {winningShares !== null && (
            <p className="font-mono text-xs text-cyan-400/50 mb-2">
              YOUR WINNING SHARES: <span className="text-cyan-300">{winningShares}</span>
            </p>
          )}
          {winningShares === 0 ? (
            <p className="pixel text-xs text-cyan-400/25 text-center py-2 tracking-wider">[ NO REWARDS TO CLAIM ]</p>
          ) : (
            <>
              <label className="pixel text-xs text-cyan-400/50 tracking-wider mb-1 block">SHARES TO CLAIM</label>
              <input
                type="number"
                min="1"
                step="1"
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-1.5 bg-black/40 border border-cyan-500/20 text-cyan-300 text-sm font-mono focus:outline-none focus:border-cyan-400 placeholder-cyan-500/30 mb-2"
              />
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="btn-pixel w-full py-2 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 text-cyan-300 border border-cyan-500/30 tracking-wider"
              >
                {claiming ? 'CLAIMING...' : '★ CLAIM REWARDS'}
              </button>
            </>
          )}
          {claimError && <p className="text-red-400 text-xs mt-2 font-mono">{claimError}</p>}
        </div>
      )}

      {/* Admin resolve */}
      {isAdmin && isActive && isExpired && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="pixel text-xs text-yellow-400/60 tracking-wider mb-2">[ ADMIN ] RESOLVE ROOM</p>
          <div className="flex gap-2">
            <button
              onClick={() => onResolve(publicKey, 'yes')}
              className="btn-pixel flex-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/25 tracking-wider text-sm"
            >
              RESOLVE YES
            </button>
            <button
              onClick={() => onResolve(publicKey, 'no')}
              className="btn-pixel flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 tracking-wider text-sm"
            >
              RESOLVE NO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
