import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.unichain.org"] },
  },
  blockExplorers: {
    default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [unichainSepolia],
  connectors: [injected()],
  transports: {
    [unichainSepolia.id]: http(),
  },
});

// Deployed contract addresses on Unichain Sepolia
export const CONTRACTS = {
  optionsHook:     "0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815" as `0x${string}`,
  optionSeries:    "0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8" as `0x${string}`,
  collateralVault: "0xbD0F937f4ec7a4584aC5535655E4245842Cf2fF7" as `0x${string}`,
  volOracle:       "0x60E045da4c55778d1F56cD13550F901E0C0C7b11" as `0x${string}`,
  usdc:            "0x31d0220469e10c4E71834a79b1f276d740d3768F" as `0x${string}`,
  weth:            "0x4200000000000000000000000000000000000006" as `0x${string}`,
};

// ── VolatilityOracle ABI ────────────────────────────────────────────────
export const VOL_ORACLE_ABI = [
  {
    name: "getVolatilityUnsafe",
    type: "function",
    inputs: [],
    outputs: [
      { name: "vol", type: "uint256" },
      { name: "age", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    name: "getHistory",
    type: "function",
    inputs: [{ name: "n", type: "uint256" }],
    outputs: [{ name: "obs", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    name: "chainsMask",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "sampleCount",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── OptionSeries ABI ────────────────────────────────────────────────────
export const OPTION_SERIES_ABI = [
  {
    name: "nextSeriesId",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getSeries",
    type: "function",
    inputs: [{ name: "seriesId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "underlying",      type: "address" },
          { name: "quoteAsset",      type: "address" },
          { name: "strike",          type: "uint256" },
          { name: "expiry",          type: "uint256" },
          { name: "isCall",          type: "bool"    },
          { name: "optionToken",     type: "address" },
          { name: "settled",         type: "bool"    },
          { name: "settlementPrice", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// ── CollateralVault ABI ─────────────────────────────────────────────────
export const COLLATERAL_VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    inputs: [
      { name: "token",  type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "withdraw",
    type: "function",
    inputs: [
      { name: "token",  type: "address" },
      { name: "shares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "totalCollateral",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "utilizationRatio",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "availableLiquidity",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "vaultState",
    type: "function",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "totalShares",    type: "uint256" },
      { name: "totalAssets",    type: "uint256" },
      { name: "utilizedAssets", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    name: "positionValue",
    type: "function",
    inputs: [
      { name: "writer", type: "address" },
      { name: "token",  type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "writerShares",
    type: "function",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "seriesLock",
    type: "function",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── ERC20 ABI (approve + read) ──────────────────────────────────────────
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const ERC20_FULL_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "totalSupply",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── OptionsHook ABI ─────────────────────────────────────────────────────
export const HOOK_ABI = [
  {
    name: "claimSettlement",
    type: "function",
    inputs: [{ name: "seriesId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Option expiry timestamps (used in buy page strike selector)
export const EXPIRIES = {
  "MAR-26": new Date("2026-03-28").getTime() / 1000,
  "APR-26": new Date("2026-04-25").getTime() / 1000,
  "MAY-26": new Date("2026-05-30").getTime() / 1000,
  "JUN-26": new Date("2026-06-27").getTime() / 1000,
};

// Strike grid (USD) — used in buy page for all tradeable strikes
export const STRIKES = [2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4500];
