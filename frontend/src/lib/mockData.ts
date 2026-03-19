/**
 * Static config and display utilities.
 * All market data (prices, vol, series, vault) is fetched live from chain/APIs via hooks.ts
 */

export const STRIKES = [2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4500];

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
