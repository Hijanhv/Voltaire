/**
 * Mock data for hackathon demo.
 * In production these come from on-chain reads and the Reactive Network feed.
 */

export const MOCK_SPOT = 3247.82;
export const MOCK_VOL = 0.72; // 72% annualised

export const STRIKES = [2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4500];

// Cross-chain vol breakdown (for dashboard)
export const CHAIN_VOL_DATA = [
  { chain: "Ethereum",  vol: 0.71, samples: 288, weight: 0.35 },
  { chain: "Arbitrum",  vol: 0.74, samples: 288, weight: 0.30 },
  { chain: "Base",      vol: 0.70, samples: 288, weight: 0.20 },
  { chain: "BSC",       vol: 0.73, samples: 288, weight: 0.15 },
];

// Historical vol index (last 48 hours, hourly)
export const VOL_HISTORY = Array.from({ length: 48 }, (_, i) => ({
  hour: i,
  vol: 0.65 + 0.12 * Math.sin(i / 6) + (Math.random() - 0.5) * 0.04,
  timestamp: Date.now() / 1000 - (47 - i) * 3600,
}));

// Active option series
export const ACTIVE_SERIES = [
  {
    id: 0,
    ticker: "ETH-3200-MAR26-C",
    strike: 3200,
    expiry: new Date("2026-03-28").getTime() / 1000,
    isCall: true,
    premium: 0, // computed live
    openInterest: 1240,
    volume24h: 380,
  },
  {
    id: 1,
    ticker: "ETH-3400-MAR26-C",
    strike: 3400,
    expiry: new Date("2026-03-28").getTime() / 1000,
    isCall: true,
    premium: 0,
    openInterest: 856,
    volume24h: 220,
  },
  {
    id: 2,
    ticker: "ETH-3000-MAR26-P",
    strike: 3000,
    expiry: new Date("2026-03-28").getTime() / 1000,
    isCall: false,
    premium: 0,
    openInterest: 634,
    volume24h: 145,
  },
  {
    id: 3,
    ticker: "ETH-3500-APR26-C",
    strike: 3500,
    expiry: new Date("2026-04-25").getTime() / 1000,
    isCall: true,
    premium: 0,
    openInterest: 512,
    volume24h: 98,
  },
  {
    id: 4,
    ticker: "ETH-2800-APR26-P",
    strike: 2800,
    expiry: new Date("2026-04-25").getTime() / 1000,
    isCall: false,
    premium: 0,
    openInterest: 289,
    volume24h: 67,
  },
];

// Mock vault state
export const MOCK_VAULT = {
  totalCollateral: 4_280_000,
  utilized: 2_940_000,
  premiumsEarned: 187_420,
  apy: 0.173, // 17.3%
};

// Mock portfolio (user's option positions)
export const MOCK_PORTFOLIO = [
  {
    id: 0,
    ticker: "ETH-3200-MAR26-C",
    quantity: 2,
    avgCost: 142.30,
    currentValue: 0, // computed live
    expiry: new Date("2026-03-28").getTime() / 1000,
    strike: 3200,
    isCall: true,
  },
  {
    id: 1,
    ticker: "ETH-3000-MAR26-P",
    quantity: 1,
    avgCost: 89.15,
    currentValue: 0,
    expiry: new Date("2026-03-28").getTime() / 1000,
    strike: 3000,
    isCall: false,
  },
];

export function formatTimeToExpiry(expiry: number): string {
  const secs = expiry - Date.now() / 1000;
  if (secs <= 0) return "Expired";
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (days > 1) return `${days}d ${hours}h`;
  if (days === 1) return `${days}d ${hours}h`;
  return `${hours}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function formatUSD(n: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
