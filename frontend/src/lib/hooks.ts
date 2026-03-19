"use client";

import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import {
  CONTRACTS,
  VOL_ORACLE_ABI,
  OPTION_SERIES_ABI,
  COLLATERAL_VAULT_ABI,
  ERC20_FULL_ABI,
} from "./config";
import { blackScholes } from "./blackScholes";

/* ── ETH Price ─────────────────────────────────────────────────────────── */
export function useEthPrice() {
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT"
      );
      const data = await res.json();
      setPrice(parseFloat(data.price));
    } catch {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await res.json();
        setPrice(data.ethereum.usd);
      } catch {
        // keep existing price
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const t = setInterval(fetchPrice, 15_000);
    return () => clearInterval(t);
  }, [fetchPrice]);

  return { price, loading };
}

/* ── Volatility Oracle ─────────────────────────────────────────────────── */
export function useVolatility() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.volOracle,
        abi: VOL_ORACLE_ABI,
        functionName: "getVolatilityUnsafe",
      },
      {
        address: CONTRACTS.volOracle,
        abi: VOL_ORACLE_ABI,
        functionName: "getHistory",
        args: [BigInt(48)],
      },
      {
        address: CONTRACTS.volOracle,
        abi: VOL_ORACLE_ABI,
        functionName: "chainsMask",
      },
      {
        address: CONTRACTS.volOracle,
        abi: VOL_ORACLE_ABI,
        functionName: "sampleCount",
      },
    ],
    query: { refetchInterval: 10_000 },
  });

  const volResult = data?.[0]?.result as [bigint, bigint] | undefined;
  const historyResult = data?.[1]?.result as readonly bigint[] | undefined;
  const chainsMask = data?.[2]?.result as bigint | undefined;
  const sampleCount = data?.[3]?.result as bigint | undefined;

  const vol = volResult ? Number(volResult[0]) / 1e18 : 0;
  const age = volResult ? Number(volResult[1]) : 0;

  const volHistory = historyResult
    ? [...historyResult]
        .map((v, i) => ({ hour: 47 - i, vol: +(Number(v) / 1e18 * 100).toFixed(2) }))
        .filter((h) => h.vol > 0)
        .reverse()
    : [];

  const mask = Number(chainsMask ?? 0);
  const samples = Number(sampleCount ?? 0);
  const CHAIN_WEIGHTS: Record<string, number> = {
    Ethereum: 0.35,
    Arbitrum: 0.30,
    Base: 0.20,
    BSC: 0.15,
  };
  const chainVolData = [
    { chain: "Ethereum", flag: 1 },
    { chain: "Arbitrum", flag: 2 },
    { chain: "Base",     flag: 4 },
    { chain: "BSC",      flag: 8 },
  ]
    .filter((c) => (mask & c.flag) !== 0)
    .map((c) => ({
      chain: c.chain,
      vol,
      samples: Math.round(samples * CHAIN_WEIGHTS[c.chain]),
      weight: CHAIN_WEIGHTS[c.chain],
    }));

  // If oracle has no data yet, fall back to showing all 4 chains
  const displayChains =
    chainVolData.length > 0
      ? chainVolData
      : [
          { chain: "Ethereum", vol, samples, weight: 0.35 },
          { chain: "Arbitrum", vol, samples, weight: 0.30 },
          { chain: "Base",     vol, samples, weight: 0.20 },
          { chain: "BSC",      vol, samples, weight: 0.15 },
        ];

  return { vol, age, volHistory, chainVolData: displayChains, loading: isLoading };
}

/* ── Active Option Series ──────────────────────────────────────────────── */
type OnChainSeries = {
  underlying: `0x${string}`;
  quoteAsset: `0x${string}`;
  strike: bigint;
  expiry: bigint;
  isCall: boolean;
  optionToken: `0x${string}`;
  settled: boolean;
  settlementPrice: bigint;
};

export type LiveSeries = {
  id: number;
  ticker: string;
  strike: number;
  expiry: number;
  isCall: boolean;
  optionToken: `0x${string}`;
  premium: number;
  delta: number;
  openInterest: number;
};

export function useActiveSeries(spot: number, vol: number) {
  const { data: nextIdData, isLoading: nextIdLoading } = useReadContract({
    address: CONTRACTS.optionSeries,
    abi: OPTION_SERIES_ABI,
    functionName: "nextSeriesId",
    query: { refetchInterval: 30_000 },
  });

  const nextId = Number(nextIdData ?? 0);

  const seriesContracts = Array.from({ length: nextId }, (_, i) => ({
    address: CONTRACTS.optionSeries as `0x${string}`,
    abi: OPTION_SERIES_ABI,
    functionName: "getSeries" as const,
    args: [BigInt(i)] as const,
  }));

  const { data: seriesData, isLoading: seriesLoading } = useReadContracts({
    contracts: seriesContracts,
    query: { enabled: nextId > 0, refetchInterval: 30_000 },
  });

  const now = Math.floor(Date.now() / 1000);
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

  const validSeries = (seriesData ?? [])
    .map((r, i) => {
      const s = r.result as OnChainSeries | undefined;
      if (!s || s.optionToken === ZERO_ADDR) return null;
      return { id: i, ...s };
    })
    .filter(
      (s): s is NonNullable<typeof s> =>
        s !== null && !s.settled && Number(s.expiry) > now
    );

  // Read totalSupply for each active option token
  const supplyContracts = validSeries.map((s) => ({
    address: s.optionToken as `0x${string}`,
    abi: ERC20_FULL_ABI,
    functionName: "totalSupply" as const,
  }));

  const { data: supplyData } = useReadContracts({
    contracts: supplyContracts,
    query: { enabled: validSeries.length > 0, refetchInterval: 30_000 },
  });

  const activeSeries: LiveSeries[] = validSeries.map((s, i) => {
    const strike = Number(s.strike) / 1e18;
    const expiry = Number(s.expiry);
    const bs =
      spot > 0 && vol > 0
        ? blackScholes({ spot, strike, expiry, vol, isCall: s.isCall })
        : { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, impliedMovePercent: 0 };

    const supply = supplyData?.[i]?.result as bigint | undefined;
    const openInterest = supply ? Number(supply) / 1e18 : 0;

    const expiryDate = new Date(expiry * 1000);
    const month = expiryDate
      .toLocaleString("en-US", { month: "short" })
      .toUpperCase();
    const year = String(expiryDate.getFullYear()).slice(2);
    const ticker = `ETH-${strike.toFixed(0)}-${month}${year}-${s.isCall ? "C" : "P"}`;

    return {
      id: s.id,
      ticker,
      strike,
      expiry,
      isCall: s.isCall,
      optionToken: s.optionToken as `0x${string}`,
      premium: bs.price,
      delta: bs.delta,
      openInterest,
    };
  });

  return { activeSeries, nextId, loading: nextIdLoading || seriesLoading };
}

/* ── Vault Data ────────────────────────────────────────────────────────── */
export function useVaultData(
  seriesIds: number[] = [],
  userAddress?: `0x${string}`
) {
  const baseContracts = [
    {
      address: CONTRACTS.collateralVault as `0x${string}`,
      abi: COLLATERAL_VAULT_ABI,
      functionName: "totalCollateral" as const,
      args: [CONTRACTS.usdc] as const,
    },
    {
      address: CONTRACTS.collateralVault as `0x${string}`,
      abi: COLLATERAL_VAULT_ABI,
      functionName: "utilizationRatio" as const,
      args: [CONTRACTS.usdc] as const,
    },
    {
      address: CONTRACTS.collateralVault as `0x${string}`,
      abi: COLLATERAL_VAULT_ABI,
      functionName: "availableLiquidity" as const,
      args: [CONTRACTS.usdc] as const,
    },
    {
      address: CONTRACTS.collateralVault as `0x${string}`,
      abi: COLLATERAL_VAULT_ABI,
      functionName: "vaultState" as const,
      args: [CONTRACTS.usdc] as const,
    },
  ] as const;

  const userContracts = userAddress
    ? ([
        {
          address: CONTRACTS.collateralVault as `0x${string}`,
          abi: COLLATERAL_VAULT_ABI,
          functionName: "positionValue" as const,
          args: [userAddress, CONTRACTS.usdc] as const,
        },
        {
          address: CONTRACTS.collateralVault as `0x${string}`,
          abi: COLLATERAL_VAULT_ABI,
          functionName: "writerShares" as const,
          args: [userAddress, CONTRACTS.usdc] as const,
        },
      ] as const)
    : ([] as const);

  const lockContracts = seriesIds.map((id) => ({
    address: CONTRACTS.collateralVault as `0x${string}`,
    abi: COLLATERAL_VAULT_ABI,
    functionName: "seriesLock" as const,
    args: [BigInt(id), CONTRACTS.usdc] as const,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContracts: any[] = [...baseContracts, ...userContracts, ...lockContracts];

  const { data, isLoading } = useReadContracts({
    contracts: allContracts,
    query: { refetchInterval: 15_000 },
  });

  const USDC_DEC = 6;
  const totalAssets = data?.[0]?.result as bigint | undefined;
  const utilizationWad = data?.[1]?.result as bigint | undefined;
  const available = data?.[2]?.result as bigint | undefined;
  const vaultStateResult = data?.[3]?.result as [bigint, bigint, bigint] | undefined;

  const userOffset = 4;
  const posValue = userAddress ? (data?.[userOffset]?.result as bigint | undefined) : undefined;
  const sharesResult = userAddress ? (data?.[userOffset + 1]?.result as bigint | undefined) : undefined;

  const lockOffset = userAddress ? userOffset + 2 : userOffset;
  const seriesLocks = seriesIds.map((id, i) => ({
    seriesId: id,
    locked: data?.[lockOffset + i]?.result as bigint | undefined,
  }));

  const totalCollateral = totalAssets ? Number(totalAssets) / 10 ** USDC_DEC : 0;
  const utilized = vaultStateResult ? Number(vaultStateResult[2]) / 10 ** USDC_DEC : 0;
  const utilizationPct = utilizationWad ? Number(utilizationWad) / 1e16 : 0;
  const availableLiquidity = available ? Number(available) / 10 ** USDC_DEC : 0;
  const userPositionValue = posValue ? Number(posValue) / 10 ** USDC_DEC : 0;
  const userShares = sharesResult ? Number(sharesResult) : 0;

  return {
    totalCollateral,
    utilized,
    utilizationPct,
    availableLiquidity,
    userPositionValue,
    userShares,
    seriesLocks,
    loading: isLoading,
  };
}

/* ── Portfolio (user option token balances) ────────────────────────────── */
export function usePortfolio(activeSeries: LiveSeries[], spot: number, vol: number) {
  const { address } = useAccount();

  const balanceContracts = activeSeries.map((s) => ({
    address: s.optionToken,
    abi: ERC20_FULL_ABI,
    functionName: "balanceOf" as const,
    args: [address ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)] as const,
  }));

  const { data: balanceData, isLoading } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: !!address && activeSeries.length > 0,
      refetchInterval: 15_000,
    },
  });

  const positions = activeSeries
    .map((s, i) => {
      const bal = balanceData?.[i]?.result as bigint | undefined;
      const quantity = bal ? Number(bal) / 1e18 : 0;
      if (quantity === 0) return null;
      const bs =
        spot > 0 && vol > 0
          ? blackScholes({ spot, strike: s.strike, expiry: s.expiry, vol, isCall: s.isCall })
          : { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, impliedMovePercent: 0 };
      return {
        id: s.id,
        ticker: s.ticker,
        strike: s.strike,
        expiry: s.expiry,
        isCall: s.isCall,
        optionToken: s.optionToken,
        quantity,
        bs,
        currentValue: bs.price * quantity,
        // Cost basis unknown on-chain; use current value as placeholder
        avgCost: bs.price,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return { positions, address, loading: isLoading };
}
