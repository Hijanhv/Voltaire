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
  optionsHook: "0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815" as `0x${string}`,
  optionSeries: "0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8" as `0x${string}`,
  collateralVault: "0xbD0F937f4ec7a4584aC5535655E4245842Cf2fF7" as `0x${string}`,
  volOracle: "0x60E045da4c55778d1F56cD13550F901E0C0C7b11" as `0x${string}`,
  usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as `0x${string}`,
  weth: "0x4200000000000000000000000000000000000006" as `0x${string}`,
};

// Minimal ABIs for contract interactions
export const VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "withdraw",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "shares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const HOOK_ABI = [
  {
    name: "claimSettlement",
    type: "function",
    inputs: [{ name: "seriesId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// Option expiry timestamps
export const EXPIRIES = {
  "MAR-26": new Date("2026-03-28").getTime() / 1000,
  "APR-26": new Date("2026-04-25").getTime() / 1000,
  "MAY-26": new Date("2026-05-30").getTime() / 1000,
  "JUN-26": new Date("2026-06-27").getTime() / 1000,
};

// Strike grid (USD)
export const STRIKES = [2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4500];
