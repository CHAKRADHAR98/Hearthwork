'use client';

import { useState } from 'react';

interface CreateMarketModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, deadline: number, liquidityParam: number) => Promise<string | undefined>;
}

export default function CreateMarketModal({ onClose, onCreate }: CreateMarketModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [liquidityParam, setLiquidityParam] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
      const tx = await onCreate(name, description, deadlineTimestamp, parseInt(liquidityParam));
      if (tx) {
        onClose();
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('already in use') || msg.includes('0x0')) {
        setError('A market with this name already exists. Use a different name.');
      } else if (
        msg.includes('WalletSignTransactionError') ||
        msg.includes('insufficient lamports') ||
        msg.includes('0x1')
      ) {
        const needed = (parseInt(liquidityParam || '1') * 0.693).toFixed(3);
        setError(`Not enough SOL. Creating this room requires ~${needed} SOL initial liquidity (b=${liquidityParam} × 0.693). Airdrop more SOL or reduce b.`);
      } else {
        setError(msg || 'Transaction failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="relative bg-[#0a1120] border border-cyan-500/30 p-6 max-w-md w-full mx-4">
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400/60" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400/60" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400/60" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400/60" />

        <div className="flex items-center justify-between mb-5">
          <p className="pixel text-xl text-cyan-400 tracking-widest">OPEN NEW ROOM</p>
          <button
            onClick={onClose}
            className="pixel text-cyan-400/40 hover:text-cyan-400 text-xl leading-none tracking-wider"
          >
            ✕
          </button>
        </div>

        <div className="w-full h-px bg-cyan-500/20 mb-5" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="pixel text-xs text-cyan-400/60 tracking-widest mb-1 block">ROOM NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-cyan-500/20 text-cyan-100 text-sm font-mono focus:outline-none focus:border-cyan-400 placeholder-cyan-500/25"
              placeholder="e.g., Will BTC hit $100k in 2025?"
              required
            />
          </div>

          <div>
            <label className="pixel text-xs text-cyan-400/60 tracking-widest mb-1 block">DESCRIPTION</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-cyan-500/20 text-cyan-100 text-sm font-mono focus:outline-none focus:border-cyan-400 h-20 resize-none placeholder-cyan-500/25"
              placeholder="Describe the resolution criteria..."
              required
            />
          </div>

          <div>
            <label className="pixel text-xs text-cyan-400/60 tracking-widest mb-1 block">RESOLUTION DEADLINE</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-cyan-500/20 text-cyan-100 text-sm font-mono focus:outline-none focus:border-cyan-400"
              required
            />
          </div>

          <div>
            <label className="pixel text-xs text-cyan-400/60 tracking-widest mb-1 block">LIQUIDITY PARAM (B)</label>
            <input
              type="number"
              value={liquidityParam}
              onChange={(e) => setLiquidityParam(e.target.value)}
              min="1"
              className="w-full px-3 py-2 bg-black/40 border border-cyan-500/20 text-cyan-100 text-sm font-mono focus:outline-none focus:border-cyan-400"
              required
            />
            <p className="pixel text-xs text-cyan-400/30 mt-1 tracking-wide">
              INITIAL DEPOSIT:{' '}
              <span className="text-yellow-400">~{(parseInt(liquidityParam || '1') * 0.693).toFixed(3)} SOL</span>
              {' '}(b × 0.693)
            </p>
          </div>

          {error && <p className="text-red-400 text-xs font-mono border border-red-500/20 bg-red-500/5 px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-pixel flex-1 py-2 bg-white/5 hover:bg-white/10 text-cyan-300/60 border border-white/10 tracking-wider"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-pixel flex-1 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 text-cyan-300 border border-cyan-500/40 tracking-wider"
            >
              {loading ? 'OPENING...' : 'OPEN ROOM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
