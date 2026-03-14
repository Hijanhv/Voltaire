/**
 * Black-Scholes option pricing — TypeScript port of the Solidity library.
 * Used client-side for instant premium quotes without RPC calls.
 */

function normcdf(x: number): number {
  // A&S approximation
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const result = 1 - pdf * poly;
  return x >= 0 ? result : 1 - result;
}

export interface BSInputs {
  spot: number;      // current price (USD)
  strike: number;    // strike price (USD)
  expiry: number;    // unix timestamp
  vol: number;       // annualised volatility (0–1, e.g. 0.7 = 70%)
  isCall: boolean;
  riskFreeRate?: number; // default 0.05
}

export interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedMovePercent: number;
  d1: number;
  d2: number;
}

export function blackScholes(inputs: BSInputs): BSResult {
  const { spot, strike, vol, isCall } = inputs;
  const r = inputs.riskFreeRate ?? 0.05;

  const now = Date.now() / 1000;
  const tSeconds = Math.max(inputs.expiry - now, 0);
  const t = tSeconds / (365 * 24 * 3600);

  if (t <= 0 || vol <= 0 || spot <= 0 || strike <= 0) {
    const intrinsic = isCall
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
    return {
      price: intrinsic,
      delta: isCall ? (spot > strike ? 1 : 0) : spot < strike ? -1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      impliedMovePercent: 0,
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(t);
  const d1 =
    (Math.log(spot / strike) + (r + (vol * vol) / 2) * t) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const Nd1 = normcdf(d1);
  const Nd2 = normcdf(d2);
  const Nd1neg = normcdf(-d1);
  const Nd2neg = normcdf(-d2);

  const pdf = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const discountedStrike = strike * Math.exp(-r * t);

  let price: number;
  let delta: number;

  if (isCall) {
    price = spot * Nd1 - discountedStrike * Nd2;
    delta = Nd1;
  } else {
    price = discountedStrike * Nd2neg - spot * Nd1neg;
    delta = Nd1 - 1;
  }

  const gamma = pdf / (spot * vol * sqrtT);
  const theta =
    (-(spot * pdf * vol) / (2 * sqrtT) -
      r * discountedStrike * (isCall ? Nd2 : -Nd2neg)) /
    365;
  const vega = (spot * pdf * sqrtT) / 100; // per 1% move in vol

  // Expected move: 1 std dev = spot * vol * sqrt(t)
  const impliedMovePercent = vol * sqrtT * 100;

  return {
    price: Math.max(price, 0),
    delta,
    gamma,
    theta,
    vega,
    impliedMovePercent,
    d1,
    d2,
  };
}

export function formatPremium(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  if (usd < 10) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatDelta(delta: number): string {
  return (delta * 100).toFixed(1);
}
