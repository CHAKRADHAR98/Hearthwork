'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import idl from '@/idl/gather.json';

const PROGRAM_ID = new PublicKey('BZ21yPSaWuGgpwaHT9yAZ5KUoGjNZ5R2fFukhhcZQiKg');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export type MarketStatus = { active: {} } | { resolved: {} };
export type MarketOutcome = { yes: {} } | { no: {} } | { notResolved: {} };

export interface Market {
  publicKey: PublicKey;
  account: {
    marketName: string;
    description: string;
    intialDeposite: BN;
    lsmrB: BN;
    deadLine: BN;
    marketState: MarketStatus;
    marketOutcome: MarketOutcome;
    outcomeYesShares: BN;
    outcomeNoShares: BN;
    mintYesBump: number;
    mintNoBump: number;
    marketVaultBump: number;
    marketBump: number;
  };
}

export const useGatherProgram = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [program, setProgram] = useState<Program<any> | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [configPda, setConfigPda] = useState<PublicKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasBettorProfile, setHasBettorProfile] = useState(false);
  const [bettorWalletBalance, setBettorWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    if (wallet.publicKey) {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
      });
      const prog = new Program(idl as any, provider);
      setProgram(prog);
    }
  }, [connection, wallet.publicKey]);

  const fetchConfig = useCallback(async () => {
    if (!program) return;
    try {
      const [cfgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('admin_config')],
        PROGRAM_ID
      );
      const cfg = await (program.account as any).gatherConfig.fetch(cfgPda);
      setConfig(cfg);
      setConfigPda(cfgPda);

      if (wallet.publicKey) {
        const isUserAdmin = cfg.admin.some(
          (a: PublicKey) => a.toString() === wallet.publicKey!.toString()
        );
        setIsAdmin(isUserAdmin);
      }
    } catch (e) {
      console.error('Config not initialized');
    }
  }, [program, wallet.publicKey]);

  const fetchBettorWalletBalance = useCallback(async () => {
    if (!wallet.publicKey || !configPda) return;
    const [bettorWalletPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_wallet'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const lamports = await connection.getBalance(bettorWalletPda);
    setBettorWalletBalance(lamports / 1_000_000_000);
  }, [connection, wallet.publicKey, configPda]);

  const fetchBettorProfile = useCallback(async () => {
    if (!program || !wallet.publicKey || !configPda) return;
    try {
      const [bettorProfilePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bettor_profile'), wallet.publicKey.toBytes(), configPda.toBytes()],
        PROGRAM_ID
      );
      await (program.account as any).bettor.fetch(bettorProfilePda);
      setHasBettorProfile(true);
      await fetchBettorWalletBalance();
    } catch (e) {
      setHasBettorProfile(false);
      setBettorWalletBalance(null);
    }
  }, [program, wallet.publicKey, configPda, fetchBettorWalletBalance]);

  const fetchMarkets = useCallback(async () => {
    if (!program) return;
    try {
      setLoading(true);
      const allMarkets = await (program.account as any).gatherMarket.all();
      setMarkets(allMarkets as Market[]);
    } catch (e) {
      console.error('Error fetching markets:', e);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    if (program) {
      fetchConfig();
      fetchMarkets();
    }
  }, [program, fetchConfig, fetchMarkets]);

  useEffect(() => {
    if (configPda) {
      fetchBettorProfile();
    }
  }, [configPda, fetchBettorProfile]);

  const initializeConfig = async (fees: number) => {
    if (!program || !wallet.publicKey) return;

    const [cfgPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('admin_config')],
      PROGRAM_ID
    );
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), cfgPda.toBytes()],
      PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .initializeConfig(fees)
      .accounts({
        admin: wallet.publicKey,
        gatherConfig: cfgPda,
        treasuryAccount: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await fetchConfig();
    return tx;
  };

  const initBettorProfile = async (amountSol: number, name?: string) => {
    if (!program || !wallet.publicKey || !configPda) return;

    const [bettorProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_profile'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [bettorWalletPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_wallet'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .initializeBettorAccount(new BN(amountSol), name ?? null)
      .accounts({
        bettor: wallet.publicKey,
        gatherConfig: configPda,
        bettorProfile: bettorProfilePda,
        bettorWalletAccount: bettorWalletPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    setHasBettorProfile(true);
    return tx;
  };

  const createMarket = async (
    name: string,
    description: string,
    deadline: number,
    liquidityParam: number
  ) => {
    if (!program || !wallet.publicKey || !isAdmin || !configPda) return;

    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

    const nameBytes = Buffer.from(name).subarray(0, 32);
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), configPda.toBytes(), nameBytes],
      PROGRAM_ID
    );
    const [marketVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market_vault'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [mintYesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_yes'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [mintNoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_no'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [metadataYesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBytes(), mintYesPda.toBytes()],
      METADATA_PROGRAM_ID
    );
    const [metadataNoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBytes(), mintNoPda.toBytes()],
      METADATA_PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .createMarket(
        {
          name: name,
          description: description,
          deadLine: new BN(deadline),
          lmsrB: new BN(liquidityParam),
        },
        {
          yesName: `${name} YES`,
          yesSymbol: 'YES',
          yesUri: '',
          noName: `${name} NO`,
          noSymbol: 'NO',
          noUri: '',
        }
      )
      .accounts({
        admin: wallet.publicKey,
        gatherConfig: configPda,
        gatherMarket: marketPda,
        marketVaultAccount: marketVaultPda,
        mintYes: mintYesPda,
        mintNo: mintNoPda,
        metadataYes: metadataYesPda,
        metadataNo: metadataNoPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
      })
      .rpc();

    await fetchMarkets();
    return tx;
  };

  const buyShares = async (
    marketPda: PublicKey,
    sharesAmount: number,
    isYes: boolean
  ) => {
    if (!program || !wallet.publicKey || !configPda) return;

    const [bettorProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_profile'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [wagerAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet'), marketPda.toBytes(), wallet.publicKey.toBytes()],
      PROGRAM_ID
    );
    const [bettorWalletPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_wallet'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [mintYesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_yes'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [mintNoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_no'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [marketVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market_vault'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [bettorYesAccount] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintYesPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const [bettorNoAccount] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintNoPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .buyShares(new BN(sharesAmount), isYes)
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ])
      .accounts({
        bettor: wallet.publicKey,
        bettorProfile: bettorProfilePda,
        wagerAccount: wagerAccountPda,
        bettorWalletAccount: bettorWalletPda,
        gatherConfig: configPda,
        gatherMarket: marketPda,
        mintYes: mintYesPda,
        mintNo: mintNoPda,
        marketVaultAccount: marketVaultPda,
        bettorYesAccount: bettorYesAccount,
        bettorNoAccount: bettorNoAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    await fetchMarkets();
    await fetchBettorWalletBalance();
    return tx;
  };

  const claimBettorAmount = async (marketPda: PublicKey, sharesAmount: number) => {
    if (!program || !wallet.publicKey || !configPda) return;

    const [bettorProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_profile'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [wagerAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet'), marketPda.toBytes(), wallet.publicKey.toBytes()],
      PROGRAM_ID
    );
    const [bettorWalletPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_wallet'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [mintYesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_yes'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [mintNoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_no'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [marketVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market_vault'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [bettorYesAta] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintYesPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const [bettorNoAta] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintNoPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .claimBettorAmount(new BN(sharesAmount))
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ])
      .accounts({
        bettor: wallet.publicKey,
        wagerAccount: wagerAccountPda,
        bettorProfile: bettorProfilePda,
        bettorWalletAccount: bettorWalletPda,
        bettorYesAta: bettorYesAta,
        bettorNoAta: bettorNoAta,
        gatherConfig: configPda,
        gatherMarket: marketPda,
        marketVaultAccount: marketVaultPda,
        mintYes: mintYesPda,
        mintNo: mintNoPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    await fetchMarkets();
    await fetchBettorWalletBalance();
    return tx;
  };

  const getUserShares = async (marketPda: PublicKey): Promise<{ yesShares: number; noShares: number }> => {
    if (!wallet.publicKey) return { yesShares: 0, noShares: 0 };

    const [mintYesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_yes'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [mintNoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_no'), marketPda.toBytes()],
      PROGRAM_ID
    );
    const [bettorYesAta] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintYesPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const [bettorNoAta] = PublicKey.findProgramAddressSync(
      [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintNoPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const [yesBalance, noBalance] = await Promise.all([
      connection.getTokenAccountBalance(bettorYesAta).catch(() => null),
      connection.getTokenAccountBalance(bettorNoAta).catch(() => null),
    ]);

    return {
      yesShares: yesBalance ? Number(yesBalance.value.amount) : 0,
      noShares: noBalance ? Number(noBalance.value.amount) : 0,
    };
  };

  const depositBettorWallet = async (amountSol: number) => {
    if (!program || !wallet.publicKey || !configPda) return;

    const [bettorProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_profile'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );
    const [bettorWalletPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bettor_wallet'), wallet.publicKey.toBytes(), configPda.toBytes()],
      PROGRAM_ID
    );

    const tx = await (program.methods as any)
      .depositBettorWallet(new BN(amountSol))
      .accounts({
        bettor: wallet.publicKey,
        gatherConfig: configPda,
        bettorProfile: bettorProfilePda,
        bettorWalletAccount: bettorWalletPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await fetchBettorWalletBalance();
    return tx;
  };

  const resolveMarket = async (marketPda: PublicKey, outcome: 'yes' | 'no') => {
    if (!program || !wallet.publicKey || !isAdmin || !configPda) return;

    const outcomeArg = outcome === 'yes' ? { yes: {} } : { no: {} };

    const tx = await (program.methods as any)
      .resolveMarket(outcomeArg)
      .accounts({
        admin: wallet.publicKey,
        gatherConfig: configPda,
        gatherMarket: marketPda,
      })
      .rpc();

    await fetchMarkets();
    return tx;
  };

  return {
    program,
    markets,
    config,
    isAdmin,
    loading,
    wallet,
    connection,
    hasBettorProfile,
    bettorWalletBalance,
    initializeConfig,
    initBettorProfile,
    depositBettorWallet,
    createMarket,
    buyShares,
    claimBettorAmount,
    getUserShares,
    resolveMarket,
    refreshMarkets: fetchMarkets,
  };
};

export default useGatherProgram;
