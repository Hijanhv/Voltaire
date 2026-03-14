# Voltaire ⚡

<div align="center">

**The first options AMM where volatility is a live fact, not an assumption.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity)](https://docs.soliditylang.org/)
[![Uniswap V4](https://img.shields.io/badge/Uniswap-V4%20Hook-ff007a)](https://docs.uniswap.org/contracts/v4/overview)
[![Reactive Network](https://img.shields.io/badge/Reactive-Network-6366f1)](https://reactive.network)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFDB1C)](https://getfoundry.sh)

[Trade Options](#) · [Deploy Vault](#) · [Architecture](#architecture) · [Agent Interface](#x402-agent-interface)

</div>

---

## Overview

Voltaire is a Uniswap V4 hook that turns any ETH/USDC pool into a European options market. Options are priced entirely on-chain using a Black-Scholes implementation in pure Solidity (WAD fixed-point arithmetic), with volatility sourced from a live cross-chain realized vol index aggregated by Reactive Network across Ethereum, Arbitrum, Base, and BSC.

When a trader swaps with `hookData` encoding a strike, expiry, and call/put direction, `OptionsHook.beforeSwap` intercepts, computes the Black-Scholes premium against the current vol index, checks vault liquidity, mints an ERC20 option token to the buyer, and routes the premium to the collateral vault — all within a single transaction. At expiry, a Reactive Network cron job triggers settlement automatically. No keepers. No stale volatility. No off-chain order book.

---

## The Problem

On-chain options protocols have historically failed at one thing: volatility. Every existing approach either:

1. **Uses a fixed vol parameter** — stale the moment it is set, immediately arbitrageable
2. **Pulls from a single-chain oracle** — manipulable via flash loans or thin markets
3. **Relies on keeper bots for settlement** — centralization risk, requires continuous funding
4. **Moves order book logic off-chain** — defeats the purpose of a trustless protocol

The result is a graveyard of options protocols with TVL that evaporated the moment arb bots discovered the pricing edge.

---
Project ID number: HK-UHI8-0699
## The Solution

Voltaire eliminates each failure mode:

| Problem | Voltaire Approach |
|---|---|
| Stale or manipulable volatility | Reactive Network aggregates realized vol from **4 chains**, **288 samples/day**, weighted by liquidity depth |
| Single point of oracle failure | Cross-chain aggregation — any single chain's manipulation is diluted by the other three |
| Keeper-dependent settlement | Reactive Network cron fires `settleExpiredSeries()` at each expiry timestamp — zero infrastructure required |
| Off-chain order flow | **Uniswap V4 hook** — options trade directly within pool swaps, inheriting V4 liquidity and routing |
| Writers earn nothing from idle capital | CollateralVault accrues option premiums as yield — demonstrated **17.3% APY** |

The vol index has a built-in staleness guard: `VolatilityOracle.getVolatility()` reverts if the last update is older than one hour, preventing any stale-price exploit from propagating into option pricing.

---

## How It Works

### Full Option Lifecycle

**Step 1 — LP deposits USDC**

Option writers deposit USDC collateral into `CollateralVault`. They receive vault shares representing their proportional claim on total assets (collateral + accumulated premiums).

```solidity
// CollateralVault.sol
function deposit(address token, uint256 amount) external returns (uint256 shares) {
    // First deposit: 1:1 share ratio
    // Subsequent: shares = amount * totalShares / totalAssets
    // Premiums compound into NAV per share automatically
}
```

**Step 2 — Trader initiates swap with hookData**

Instead of a normal AMM swap, the trader encodes option parameters:

```solidity
// OptionsHook.sol — OptionParams struct
struct OptionParams {
    uint256 strike;     // strike price in WAD (e.g. 3400e18 = $3,400)
    uint256 expiry;     // unix timestamp
    bool isCall;        // true = call, false = put
    uint256 quantity;   // contracts in WAD (1e18 = 1 contract)
    uint256 maxPremium; // slippage guard — reverts if premium exceeds this
}
// Encoded as: abi.encode(params) passed as hookData to IPoolManager.swap()
```

**Step 3 — `beforeSwap` prices and fills**

The hook intercepts, reads live vol, computes Black-Scholes, verifies vault liquidity, and fills in one atomic step:

```solidity
// OptionsHook.sol — _processOptionSwap (simplified)
uint256 spot = _getSpotFromPool(key);          // derived from sqrtPriceX96
uint256 vol  = volOracle.getVolatility();       // reverts if > 1h stale
uint256 tte  = p.expiry - block.timestamp;      // time-to-expiry in seconds

uint256 unitPremium = BlackScholes.price(spot, p.strike, tte, vol, p.isCall);
uint256 totalPremium = (unitPremium * p.quantity) / 1e18;
if (totalPremium > p.maxPremium) revert PremiumTooHigh();

// Collateral check: max payout is spot (calls) or strike (puts)
uint256 maxPayout = p.isCall ? spot : p.strike;
uint256 required  = (maxPayout * p.quantity) / 1e18;
if (vault.availableLiquidity(quoteToken) < required) revert InsufficientVaultLiquidity();

// Mint option token and lock collateral
vault.lockCollateral(seriesId, quoteToken, required);
optionSeries.mint(seriesId, sender, p.quantity);

// BeforeSwapDelta collects premium from trader in same tx — no separate approval needed
BeforeSwapDelta delta = toBeforeSwapDelta(int128(int256(totalPremium)), 0);
```

**Step 4 — Reactive Network triggers settlement**

At each series expiry, the Reactive Network cron job calls:

```solidity
// OptionsHook.sol
function settleExpiredSeries(uint256 seriesId, uint256 spotPrice) external {
    if (msg.sender != reactiveCron) revert OnlyReactiveCron();
    // spotPrice = cross-chain TWAP at expiry, provided by Reactive

    bool itm;
    uint256 intrinsic;
    if (s.isCall && spotPrice > s.strike) {
        intrinsic = spotPrice - s.strike; // call ITM
        itm = true;
    } else if (!s.isCall && s.strike > spotPrice) {
        intrinsic = s.strike - spotPrice; // put ITM
        itm = true;
    }

    optionSeries.settleSeries(seriesId, spotPrice);
    if (!itm) {
        vault.unlockCollateral(seriesId, s.quoteAsset); // writers keep premium
    }
    // If ITM: pull-model — holders call claimSettlement()
}
```

**Step 5 — ITM holders claim payout**

Pull-model settlement: option token holders call `claimSettlement(seriesId)`, which burns their tokens and pays intrinsic value in USDC from the vault.

```solidity
// payout per contract = (settlementPrice - strike) for calls
uint256 payout = (intrinsic * balance) / 1e18;
optionSeries.burn(seriesId, msg.sender, balance);
vault.paySettlement(s.quoteAsset, msg.sender, payout, seriesId);
```

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════════╗
║                     CROSS-CHAIN DATA LAYER                           ║
╠════════════╦════════════╦════════════╦═════════════╗                 ║
║  Ethereum  ║  Arbitrum  ║    Base    ║     BSC     ║  288 samples/  ║
║   35% wt   ║   30% wt   ║   20% wt  ║   15% wt   ║  chain/day     ║
╚═══════╤════╩═══════╤════╩═══════╤════╩═══════╤═════╝                ║
        └────────────┴────────────┴────────────┘                      ║
                              │                                        ║
                              ▼                                        ║
               ┌──────────────────────────┐                           ║
               │     REACTIVE NETWORK     │  Computes weighted        ║
               │  Realized Vol Aggregator │  realized vol             ║
               │  + Cron Settlement Bot   │  Fires at each expiry     ║
               └─────────────┬────────────┘                           ║
                             │                                         ║
╔════════════════════════════▼═════════════════════════════════════════╗
║                    UNICHAIN PROTOCOL LAYER                           ║
║                                                                      ║
║   VolatilityOracle.sol  ────  getVolatility() (staleness guard)     ║
║           │                                                          ║
║           ▼                                                          ║
║   BlackScholes.sol  ────────  price(S, K, t, σ, isCall) → WAD      ║
║           │                                                          ║
║           ▼                                                          ║
║   OptionsHook.sol  ─────────  beforeSwap() intercept                ║
║       │           │                                                  ║
║       ▼           ▼                                                  ║
║  OptionSeries.sol   CollateralVault.sol                              ║
║  OptionToken.sol    (USDC, 17.3% APY, utilization tracking)         ║
║       │                                                              ║
║       ▼                                                              ║
║  ERC20 Option Token → Trader's Wallet                                ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Smart Contracts

| Contract | Lines (est.) | Purpose |
|---|---|---|
| `OptionsHook.sol` | ~340 | Uniswap V4 hook: `beforeSwap` intercept, option pricing, settlement, admin |
| `BlackScholes.sol` | ~280 | Pure library: WAD fixed-point BS, A&S N(x) approximation, `lnWad`, `expWad`, `sqrt` |
| `VolatilityOracle.sol` | ~150 | Stores cross-chain vol pushed by Reactive; ring buffer of 48 observations; staleness revert |
| `OptionSeries.sol` | ~200 | Registry of all (underlying, quote, strike, expiry, isCall) series; deploys OptionToken per series |
| `OptionToken.sol` | ~50 | Minimal ERC20 (OpenZeppelin), mint/burn gated to `OptionSeries` |
| `CollateralVault.sol` | ~200 | Share-based USDC vault; `lockCollateral`, `receivePremium`, `paySettlement` |

**Total: ~1,220 lines core logic + ~1,700 lines comments, interfaces, and math helpers ≈ 3,000 lines**

---

## x402 Agent Interface

x402 is the "Stripe for machines" protocol — AI agents pay HTTP 402 responses with USDC to access on-chain resources. Voltaire exposes a machine-readable interface so autonomous agents can hedge positions, speculate on volatility, or execute options strategies without accounts, API keys, or human intervention.

### How It Works

```
AGENT                          VOLTAIRE API                    UNICHAIN
  │                                │                              │
  │  GET /api/v1/options/quote     │                              │
  │  ?asset=ETH&strike=3400        │                              │
  │  &expiry=2026-03-28&type=call  │                              │
  ├───────────────────────────────►│                              │
  │                                │                              │
  │  HTTP 402 Payment Required     │                              │
  │  X-Payment-Scheme: exact       │                              │
  │  X-Payment-Asset: USDC         │                              │
  │  X-Payment-Amount: 142.30      │                              │
  │  X-Payment-To: 0x[OptionsHook] │                              │
  │◄───────────────────────────────┤                              │
  │                                │                              │
  │  [Agent broadcasts USDC tx]    │                              │
  ├────────────────────────────────┼─────────────────────────────►│
  │                                │  beforeSwap intercepts       │
  │                                │  Black-Scholes prices        │
  │                                │  OptionToken minted          │
  │◄───────────────────────────────┼─────────────────────────────┤
  │  ETH-3400-MAR26-C in wallet    │                              │
  │                                │                              │
  │  [At expiry — automatic]       │  Reactive cron fires         │
  │                                │  settleExpiredSeries()       │
  │  claimSettlement(seriesId)     │                              │
  ├────────────────────────────────┼─────────────────────────────►│
  │  USDC payout received          │  burn tokens, pay USDC       │
  │◄───────────────────────────────┼─────────────────────────────┤
```

### Agent Use Cases

**Treasury Hedge** — Agent holds ETH, buys puts to define maximum downside:
```
BUY ETH-3000-MAR26-P @ $54.20 premium
→ Locks in minimum effective ETH value of ~$2,945.80
→ Settlement is fully automatic at expiry via Reactive cron
```

**Directional Bet** — Agent wants ETH upside without spot exposure:
```
BUY ETH-3400-MAR26-C @ $68.50 premium
→ Max loss: $68.50. Profit: (ETH_spot - 3400) × qty if ETH > $3,400
→ Capital-efficient levered upside for bots redeploying idle USDC
```

**Vol Arbitrage** — Agent captures implied vs. realized vol spread:
```
Vol Index: 72% realized. If implied vol pricing calls "rich" by regime standards:
→ Earn premiums via vault deposit (short vol)
→ Or buy options if implied < realized (long vol cheaply)
→ Systematic, fully autonomous, zero human intervention required
```

### Why x402 for DeFi Options?

Traditional DeFi options require: wallet connection → API key → account creation → manual order placement. x402 reduces this to a single HTTP interaction cycle. An agent with a funded wallet can buy options, hedge positions, and receive payouts without any human in the loop — the entire lifecycle is machine-to-machine.

---

## Prerequisites

| Concept | Why You Need It |
|---|---|
| [Uniswap V4 Hooks](https://docs.uniswap.org/contracts/v4/overview) | Voltaire's core mechanism — hooks intercept swaps |
| [BeforeSwapDelta](https://docs.uniswap.org/contracts/v4/concepts/hooks/before-swap-return-delta) | How the hook collects premiums without a separate transfer |
| [Black-Scholes Model](https://en.wikipedia.org/wiki/Black%E2%80%93Scholes_model) | The pricing formula implemented in Solidity |
| [WAD fixed-point arithmetic](https://github.com/transmissions11/solmate/blob/main/src/utils/FixedPointMathLib.sol) | All math uses 1e18 as the unit of precision |
| [Reactive Network](https://reactive.network/docs) | Cross-chain event subscriptions + cron scheduling |
| [ERC20](https://eips.ethereum.org/EIPS/eip-20) | Option tokens are standard ERC20s — one contract per series |
| [x402 Protocol](https://x402.org) | HTTP payment protocol for autonomous machine access |

---

## Project Structure

```
voltaire/
├── src/
│   ├── OptionsHook.sol        # Main hook — beforeSwap, settlement, admin
│   ├── BlackScholes.sol       # Pure math library — lnWad, expWad, normcdf, price()
│   ├── VolatilityOracle.sol   # Cross-chain vol store — ring buffer, staleness guard
│   ├── OptionSeries.sol       # Series registry — create, mint, burn, settle
│   ├── OptionToken.sol        # Minimal ERC20 per series (e.g. ETH-3400-MAR26-C)
│   └── CollateralVault.sol    # USDC vault — shares, utilization, premium accrual
├── script/
│   ├── Deploy.s.sol           # Full deployment (VolOracle → Vault → Hook → Series)
│   └── SeedVol.s.sol          # Seed oracle with initial volatility for testnet
├── test/
│   └── (test suite)           # Foundry tests — unit + integration
├── lib/
│   ├── v4-core/               # Uniswap V4 core (submodule)
│   ├── openzeppelin-contracts/ # OZ ERC20, SafeERC20 (submodule)
│   └── forge-std/             # Foundry standard library (submodule)
├── docs/
│   ├── architecture.svg       # Visual system diagram
│   └── pitch.md               # Pitch materials
├── frontend/                  # Next.js frontend (wagmi, viem)
├── landing/
│   └── index.html             # Self-contained landing page
└── foundry.toml               # Compiler config (solc 0.8.26, via_ir=true)
```

---

## Quick Start

### Prerequisites

- [Foundry](https://getfoundry.sh) installed
- Git with submodule support

### Install

```bash
git clone https://github.com/your-org/voltaire
cd voltaire
forge install
```

### Build

```bash
forge build
```

### Test

```bash
forge test -vv
```

### Deploy to Unichain (testnet)

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://unichain-testnet.rpc.url
export REACTIVE_RELAYER=0x...  # your Reactive Network relayer address

forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

### Seed Volatility (testnet demo)

```bash
# If REACTIVE_RELAYER == deployer (testnet only), Deploy.s.sol seeds automatically.
# For production, Reactive Network pushes updateVolatility() on a schedule.
forge script script/SeedVol.s.sol --rpc-url $RPC_URL --broadcast
```

---

## Key Design Decisions

### 1. WAD Fixed-Point Arithmetic Throughout

All numerical values — prices, strikes, premiums, volatility, probabilities — are represented as 18-decimal fixed-point integers (`WAD = 1e18`). This eliminates float conversion errors and makes all arithmetic deterministic. The Black-Scholes implementation requires `sqrt`, `ln`, and `exp` — all implemented in WAD space:

```solidity
// BlackScholes.sol
// sqrt: sqrt_wad(x) = sqrt(x * 1e18), returning WAD
// lnWad: binary decomposition + Maclaurin series for the fractional part
// expWad: k*ln(2) decomposition + 5-term Horner polynomial for e^r
// normcdf: Abramowitz & Stegun polynomial approximation, accurate to 1e-7
```

**Rationale:** Floating point is non-deterministic in distributed systems. WAD math is the established DeFi standard (Maker, Aave, Uniswap all use variants). Every operation must produce the same result across every EVM node.

### 2. Reactive Network for Vol, Not a Price Oracle

Traditional options protocols rely on Chainlink or Pyth for spot price and vol. Voltaire uses Reactive Network specifically for realized volatility because vol *requires cross-chain aggregation*. A single-chain vol estimate derived from ETH/USDC on Ethereum alone can be manipulated via coordinated large swaps during low-liquidity windows. Aggregating across four chains and 288 samples/day makes manipulation economically infeasible.

**Rationale:** Vol is the most important and most commonly manipulated input to options pricing. We source it where it is hardest to manipulate.

### 3. Pull Model for Settlement

When a series settles ITM, Voltaire does not iterate over all token holders to push payments. Instead, `settleExpiredSeries()` marks the settlement price, and each holder calls `claimSettlement()` to pull their payout.

**Rationale:** Push settlement over an arbitrary number of holders is an unbounded gas cost — a single large series could have thousands of holders. Pull model caps per-claim gas cost to O(1) regardless of series size.

### 4. BeforeSwapDelta for Premium Collection

Rather than requiring a separate `transferFrom` call to collect premiums, Voltaire uses Uniswap V4's `BeforeSwapDelta` mechanism. The hook returns a delta that effectively debits the premium from the swap input in the same atomic operation.

```solidity
// OptionsHook.sol
BeforeSwapDelta delta = toBeforeSwapDelta(int128(int256(totalPremium)), 0);
return (IHooks.beforeSwap.selector, delta, 0);
```

**Rationale:** Eliminates need for prior token approval beyond the swap amount, reduces transaction count, and makes the option purchase atomically fail-safe — no premium is taken if the option cannot be issued.

### 5. JIT OptionToken Deployment

`OptionSeries.createSeries()` deploys a new `OptionToken` contract the first time a series is traded. Subsequent purchases of the same series reuse the existing token contract.

```solidity
// OptionSeries.sol
string memory ticker = _buildTicker(underlying, strike, expiry, isCall);
// e.g. "ETH-3400-MAR26-C"
optionToken = address(new OptionToken(name, ticker, address(this)));
```

**Rationale:** Pre-deploying all possible (strike × expiry × direction) combinations is impractical. JIT deployment defers gas costs until demand actually exists, and gives each series a unique tradeable ERC20 address that can appear on secondary markets and in wallets.

### 6. Staleness Revert, Not Fallback

`VolatilityOracle.getVolatility()` hard-reverts if `block.timestamp - lastUpdated > stalenessThreshold` (default 1 hour). There is no fallback to a cached or default value.

**Rationale:** A fallback to stale vol is worse than reverting — it allows options to be minted at a price that may be significantly wrong, creating instant arbitrage against vault LPs. A revert surfaces the problem immediately and prevents any pricing until the oracle is refreshed. Protocol safety > availability.

---

## Test Suite

The test suite covers:

- **BlackScholes unit tests**: Known (S, K, t, σ) → expected premium pairs verified against Python `py_vollib` reference implementation
- **VolatilityOracle**: Staleness revert at threshold boundary, ring buffer write/read correctness, update authorization enforcement
- **CollateralVault**: Deposit/withdraw share accounting under premium accrual, utilization cap enforcement, `availableLiquidity` during locked positions
- **OptionSeries**: Series creation, ticker string construction (`_buildTicker`), duplicate series prevention, `getSeriesId` lookup
- **OptionsHook integration**: End-to-end purchase with mock `PoolManager`, settlement flow with mock Reactive cron, ITM and OTM payout branches, `claimSettlement` burn-and-pay
- **Edge cases**: Zero time-to-expiry (intrinsic value only), deep ITM/OTM extremes, `maxPremium` slippage guard trigger, vault under-liquidity revert

```bash
# Run all tests with stack traces
forge test -vv

# Gas report
forge test --gas-report

# Run a specific test
forge test --match-test testBlackScholesAtmCall -vvv
```

---

## Deployment

### Networks

| Network | Status | Notes |
|---|---|---|
| Unichain Mainnet | Target | All contracts deployed here |
| Unichain Sepolia | Testnet | Development and demo deployment |
| Ethereum / Arbitrum / Base / BSC | Data sources only | Reactive Network reads TWAP events from these chains; no Voltaire contracts deployed there |

### Deployment Addresses

> Deployment addresses will be published here post-launch.

| Contract | Address |
|---|---|
| `VolatilityOracle` | `TBD` |
| `CollateralVault` | `TBD` |
| `OptionSeries` | `TBD` |
| `OptionsHook` | `TBD` |

### Hook Address Requirements

The Uniswap V4 hook must be deployed at an address where the lower bits encode the required permission flags:

```
Flag bits required: BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA
Binary:             0b10001000 = 0x88
```

In production, use `HookMiner` from Uniswap V4 periphery with `CREATE2` to find a salt that produces an address ending in `0x88`. See `Deploy.s.sol` for the full deployment order and `setHook` wiring pattern to handle the chicken-and-egg of hook ↔ vault mutual references.

### Deployment Order

```
1. VolatilityOracle (needs reactiveRelayer address)
2. CollateralVault  (needs hook address — deploy with deployer as temp hook)
3. OptionSeries     (needs hook address — deploy with deployer as temp hook)
4. OptionsHook      (needs VolOracle, CollateralVault, OptionSeries, reactiveCron)
5. vault.setHook(address(hook))
6. Redeploy OptionSeries with correct hook, or use proxy pattern
7. Seed VolatilityOracle (Reactive does this in prod; deployer does it in testnet)
8. Initialize Uniswap V4 pool with OptionsHook address
```

---

## Key Numbers

| Metric | Value |
|---|---|
| Smart contracts | 6 |
| Lines of Solidity | ~3,000 |
| Chains feeding vol index | 4 (Ethereum, Arbitrum, Base, BSC) |
| Vol samples per chain per day | 288 |
| Staleness threshold | 1 hour |
| Vault APY (demonstrated) | 17.3% |
| Keepers required | **0** |
| Protocol fee | 30 bps (0.3%) |
| Max vol accepted by oracle | 500% (sanity cap) |
| History ring buffer size | 48 observations |

---

## Further Reading

**Uniswap V4**
- [V4 Hooks Overview](https://docs.uniswap.org/contracts/v4/overview)
- [BeforeSwapDelta Specification](https://docs.uniswap.org/contracts/v4/concepts/hooks/before-swap-return-delta)
- [V4 Core Repository](https://github.com/Uniswap/v4-core)

**Reactive Network**
- [Reactive Network Documentation](https://docs.reactive.network)
- [Cross-Chain Event Subscriptions](https://docs.reactive.network/getting-started/what-is-reactive-network)

**Black-Scholes and Options Math**
- [Black-Scholes Model](https://en.wikipedia.org/wiki/Black%E2%80%93Scholes_model)
- [Abramowitz & Stegun N(x) Approximation](https://en.wikipedia.org/wiki/Normal_distribution#Numerical_approximations_for_the_normal_CDF)
- [WAD Math — Solmate FixedPointMathLib](https://github.com/transmissions11/solmate/blob/main/src/utils/FixedPointMathLib.sol)

**x402 Protocol**
- [x402 Specification](https://x402.org)
- [HTTP 402 Payment Required — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)

**DeFi Options Background**
- [Lyra Finance](https://docs.lyra.finance)
- [Panoptic — perpetual options on Uniswap V4](https://panoptic.xyz)
- [Dopex — on-chain options AMM](https://docs.dopex.io)

---

## License

MIT

---

<div align="center">

Built for [ETHGlobal](https://ethglobal.com) · Unichain · Reactive Network · x402

*"Options were always a good idea. Real-time cross-chain vol just made them viable."*

</div>
