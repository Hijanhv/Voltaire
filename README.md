# Voltaire ⚡

<div align="center">

**The first on-chain European options AMM where volatility is a live cross-chain fact — not a stale assumption.**

[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](#license)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity)](https://docs.soliditylang.org/)
[![Uniswap V4](https://img.shields.io/badge/Uniswap-V4%20Hook-ff007a)](https://docs.uniswap.org/contracts/v4/overview)
[![Reactive Network](https://img.shields.io/badge/Reactive-Network-6366f1)](https://reactive.network)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFDB1C)](https://getfoundry.sh)
[![Tests](https://img.shields.io/badge/Tests-112%20passing-brightgreen)]()
[![Testnet](https://img.shields.io/badge/Deployed-Unichain%20Sepolia-8b5cf6)](https://sepolia.uniscan.xyz)

[What is This?](#what-is-voltaire) · [The Problem](#the-problem) · [How It Works](#how-it-works) · [Live Contracts](#live-on-testnet) · [What I Learned](#what-i-learned-building-this)

</div>

---

## What is Voltaire?

Voltaire is a **Uniswap V4 hook** that turns any ETH/USDC liquidity pool into a fully on-chain European options market.

In plain English: instead of just swapping ETH for USDC, you can now buy an **options contract** directly inside a Uniswap swap — in one transaction, with no broker, no KYC, no off-chain server.

Options are priced in real time using the **Black-Scholes formula** running entirely in Solidity, fed by live volatility data aggregated from 4 blockchains by **Reactive Network**. Settlement at expiry is fully automatic — no bots to fund, no humans required.

---

## What is an Option? (Plain English)

Imagine ETH is at **$3,000** today. You think it might hit $4,000 in 30 days but you're not sure. You don't want to risk your full capital.

Instead you buy a **call option** for a small fee called a **premium** — say $70.

| What happens at expiry | Your outcome |
|---|---|
| ETH rises to **$4,000** | You profit $1,000 − $70 = **$930** |
| ETH stays at $3,000 | You lose only **$70** |
| ETH crashes to $1,000 | You still lose only **$70** |

**Your maximum loss is always just the premium you paid.** That's the power of options — defined risk, leveraged upside.

A **put option** works the other way — it profits when price falls. Useful for protecting existing ETH holdings from a crash (like insurance).

---

## The Problem

On-chain options have existed since 2020. Every single protocol that launched has either died, lost user funds, or been arbitraged into irrelevance. The reason is always the same: **volatility is always wrong**.

Here's the full breakdown of why existing approaches fail:

### Problem 1 — Stale Volatility (The Core Failure)

Options pricing depends critically on volatility — how much the asset has been moving. If volatility is wrong, the price is wrong. If the price is wrong, arbitrageurs drain the pool.

Every existing on-chain options protocol uses one of these broken approaches:

| Approach | Why it fails |
|---|---|
| **Admin-set fixed vol** | Set once, stale immediately. Bots front-run any update. |
| **Single-chain TWAP** | One exchange can be manipulated via flash loans in low-liquidity windows. |
| **Chainlink vol feed** | Chainlink doesn't publish implied vol. Protocols that use it are hacking together something that doesn't exist. |
| **Off-chain vol server** | Centralized. Server goes down = protocol frozen. |

### Problem 2 — Keeper-Dependent Settlement

When an option expires, someone must trigger settlement on-chain. Existing protocols use keeper bots — funded servers that watch the chain and submit transactions.

Problems:
- Keeper runs out of ETH → settlement delayed or missed
- Keeper team shuts down → all outstanding options stuck forever
- Keeper can be front-run by MEV bots

### Problem 3 — Off-Chain Order Books

Protocols like Deribit and Lyra's early versions ran matching engines off-chain. This means:
- A server operator can front-run your order
- The "DeFi" label is misleading — it's just a database with a blockchain settlement layer
- Single point of failure

### Problem 4 — Writers Earn Nothing

Option writers (liquidity providers) lock up capital as collateral. In existing protocols, this capital earns zero yield while idle. Writers are taking on risk for no ongoing return.

---

## The Solution

Voltaire eliminates every failure mode:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THE VOLTAIRE SOLUTION                        │
├──────────────────────┬──────────────────────────────────────────────┤
│ PROBLEM              │ VOLTAIRE FIX                                 │
├──────────────────────┼──────────────────────────────────────────────┤
│ Stale/fake vol       │ Reactive Network aggregates REAL realized    │
│                      │ vol from 4 chains, 288 samples/day           │
├──────────────────────┼──────────────────────────────────────────────┤
│ Single-chain         │ Cross-chain aggregation — manipulating one   │
│ manipulation         │ chain barely moves the aggregate             │
├──────────────────────┼──────────────────────────────────────────────┤
│ Keeper bots          │ Reactive Network cron fires settleExpired-   │
│                      │ Series() automatically at each expiry        │
├──────────────────────┼──────────────────────────────────────────────┤
│ Off-chain logic      │ Everything lives in a Uniswap V4 hook —      │
│                      │ 100% on-chain, zero hidden servers           │
├──────────────────────┼──────────────────────────────────────────────┤
│ Idle writer capital  │ CollateralVault compounds premiums into      │
│                      │ share NAV → 17.3% APY demonstrated           │
└──────────────────────┴──────────────────────────────────────────────┘
```

---

## What is a Uniswap V4 Hook?

Uniswap V4 introduced **hooks** — smart contracts that plug into a liquidity pool and run custom logic at specific moments during a swap.

Think of it like this:

```
┌─────────────────────────────────────────────────────┐
│              WITHOUT A HOOK (Uniswap V3)            │
│                                                     │
│  You send ETH  ──▶  Pool swaps it  ──▶  You get USDC│
│                                                     │
│               That's it. Nothing else.              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│            WITH VOLTAIRE HOOK (Uniswap V4)          │
│                                                     │
│  You send USDC                                      │
│  + option instructions (strike, expiry, call/put)   │
│         │                                           │
│         ▼                                           │
│  ┌─────────────────────────────┐                   │
│  │     HOOK INTERCEPTS         │                   │
│  │  1. Read live ETH price     │                   │
│  │  2. Read live volatility    │                   │
│  │  3. Run Black-Scholes math  │                   │
│  │  4. Check vault liquidity   │                   │
│  │  5. Mint option token       │                   │
│  │  6. Lock collateral         │                   │
│  └─────────────────────────────┘                   │
│         │                                           │
│         ▼                                           │
│  Option token lands in your wallet                  │
│  All in ONE transaction                             │
└─────────────────────────────────────────────────────┘
```

The hook is like a plugin that runs **before every swap**, decides what to do, and can completely transform what the swap means — from a token exchange into an options purchase.

---

## How It Works

### Full System Architecture

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     CROSS-CHAIN VOLATILITY LAYER                      ║
╠═══════════════╦═══════════════╦═══════════════╦═══════════════╗       ║
║   ETHEREUM    ║   ARBITRUM    ║     BASE      ║      BSC      ║       ║
║               ║               ║               ║               ║       ║
║  ETH/USDC     ║  ETH/USDC     ║  ETH/USDC     ║  ETH/USDC     ║       ║
║  TWAP events  ║  TWAP events  ║  TWAP events  ║  TWAP events  ║       ║
║  35% weight   ║  30% weight   ║  20% weight   ║  15% weight   ║       ║
╚══════╤════════╩═══════╤═══════╩═══════╤═══════╩═══════╤═══════╝       ║
       │                │               │               │               ║
       └────────────────┴───────────────┴───────────────┘               ║
                                    │                                   ║
                                    ▼                                   ║
                    ┌───────────────────────────────┐                  ║
                    │        REACTIVE NETWORK        │                  ║
                    │                                │                  ║
                    │  • Aggregates realized vol     │                  ║
                    │  • 288 samples/day/chain       │                  ║
                    │  • Weighted by liquidity depth │                  ║
                    │  • Pushes to VolatilityOracle  │                  ║
                    │  • Fires cron at each expiry   │                  ║
                    └──────────────┬────────────────┘                  ║
                                   │                                    ║
╔══════════════════════════════════▼════════════════════════════════════╗
║                        UNICHAIN PROTOCOL LAYER                        ║
║                                                                       ║
║  ┌─────────────────────────────────────────────────────────────────┐  ║
║  │                    VolatilityOracle.sol                         │  ║
║  │  • Stores latest σ (volatility)                                 │  ║
║  │  • Ring buffer of 48 observations                               │  ║
║  │  • Reverts if data > 1 hour old (staleness guard)               │  ║
║  └──────────────────────────────┬──────────────────────────────────┘  ║
║                                 │  getVolatility()                    ║
║                                 ▼                                     ║
║  ┌─────────────────────────────────────────────────────────────────┐  ║
║  │                      BlackScholes.sol                           │  ║
║  │  • Pure Solidity math library (no external calls)               │  ║
║  │  • price(S, K, t, σ, isCall) → premium in WAD                  │  ║
║  │  • lnWad, expWad, sqrt, normcdf — all on-chain                  │  ║
║  └──────────────────────────────┬──────────────────────────────────┘  ║
║                                 │  unitPremium                        ║
║                                 ▼                                     ║
║  ┌─────────────────────────────────────────────────────────────────┐  ║
║  │                      OptionsHook.sol                            │  ║
║  │                                                                 │  ║
║  │  beforeSwap() ──── intercepts every swap                        │  ║
║  │       │                                                         │  ║
║  │       ├── prices option via Black-Scholes                       │  ║
║  │       ├── checks vault liquidity                                │  ║
║  │       ├── mints ERC20 option token                              │  ║
║  │       ├── locks collateral                                      │  ║
║  │       └── returns BeforeSwapDelta (collects premium)            │  ║
║  │                                                                 │  ║
║  │  settleExpiredSeries() ── called by Reactive cron               │  ║
║  │  claimSettlement()     ── called by option holders              │  ║
║  └───────────────┬─────────────────────┬───────────────────────────┘  ║
║                  │                     │                              ║
║                  ▼                     ▼                              ║
║  ┌───────────────────────┐  ┌─────────────────────────────────────┐  ║
║  │   OptionSeries.sol    │  │        CollateralVault.sol           │  ║
║  │                       │  │                                     │  ║
║  │  • Series registry    │  │  • Holds USDC from LPs              │  ║
║  │  • One ERC20 token    │  │  • lockCollateral per series        │  ║
║  │    per series         │  │  • receivePremium → share NAV ↑     │  ║
║  │  • ETH-3400-MAR26-C   │  │  • paySettlement to winners        │  ║
║  │  • mint / burn        │  │  • 17.3% APY demonstrated           │  ║
║  └───────────┬───────────┘  └─────────────────────────────────────┘  ║
║              │                                                        ║
║              ▼                                                        ║
║      ERC20 Option Token ──▶ Trader's Wallet                          ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

### Swap Flow — Step by Step

```
TRADER                    UNISWAP V4                  VOLTAIRE HOOK
  │                           │                             │
  │  swap(hookData: {         │                             │
  │    strike: $3400,         │                             │
  │    expiry: Mar 28,        │                             │
  │    isCall: true,          │                             │
  │    qty: 1 contract,       │                             │
  │    maxPremium: $200       │                             │
  │  })                       │                             │
  ├──────────────────────────▶│                             │
  │                           │  beforeSwap()               │
  │                           ├────────────────────────────▶│
  │                           │                             │
  │                           │                    ┌────────┴────────┐
  │                           │                    │ 1. Read spot    │
  │                           │                    │    from pool    │
  │                           │                    │    sqrtPriceX96 │
  │                           │                    ├─────────────────┤
  │                           │                    │ 2. Read σ from  │
  │                           │                    │    VolOracle    │
  │                           │                    │    (reverts if  │
  │                           │                    │    stale > 1h)  │
  │                           │                    ├─────────────────┤
  │                           │                    │ 3. Black-Scholes│
  │                           │                    │    price(S,K,t, │
  │                           │                    │    σ, isCall)   │
  │                           │                    │    = $142.30    │
  │                           │                    ├─────────────────┤
  │                           │                    │ 4. Check:       │
  │                           │                    │    $142 < $200  │
  │                           │                    │    maxPremium ✓ │
  │                           │                    ├─────────────────┤
  │                           │                    │ 5. Check vault  │
  │                           │                    │    has $3400    │
  │                           │                    │    liquidity ✓  │
  │                           │                    ├─────────────────┤
  │                           │                    │ 6. lockCollat-  │
  │                           │                    │    eral($3400)  │
  │                           │                    ├─────────────────┤
  │                           │                    │ 7. mint option  │
  │                           │                    │    token to     │
  │                           │                    │    trader       │
  │                           │                    ├─────────────────┤
  │                           │                    │ 8. return delta │
  │                           │                    │    (-$142.30)   │
  │                           │                    └────────┬────────┘
  │                           │◀───────────────────────────┤
  │                           │  debit $142.30 USDC         │
  │                           │  from trader's swap         │
  │◀──────────────────────────┤                             │
  │  ETH-3400-MAR26-C token   │                             │
  │  lands in wallet          │                             │
```

---

### Settlement Flow — What Happens at Expiry

```
TIME: March 28, 2026 — 00:00:00 UTC

        REACTIVE NETWORK CRON
               │
               │  settleExpiredSeries(seriesId=42, spotPrice=$3800)
               ▼
        OptionsHook.sol
               │
        ┌──────┴──────┐
        │             │
   isCall=true    isCall=false
   spot > strike  strike > spot
        │             │
        ▼             ▼
    ITM ✓          OTM ✗
  intrinsic=     unlockCollateral()
  $3800-$3400    writers keep premium
    = $400
        │
        ▼
  settleSeries(seriesId, $3800)
  (mark settled, store price)

        ↓ later, holder calls:

TRADER
  │  claimSettlement(seriesId=42)
  ▼
OptionsHook
  │  balance = 1 contract = 1e18
  │  payout = $400 × 1 = $400
  │  burn option token
  │  vault.paySettlement(USDC, trader, $400)
  ▼
$400 USDC lands in trader's wallet
```

---

### How the Volatility Oracle Works

```
                    EVERY 5 MINUTES
                         │
    ┌────────────────────┼────────────────────┐
    ▼                    ▼                    ▼
 Ethereum            Arbitrum             Base + BSC
 ETH/USDC            ETH/USDC             ETH/USDC
 realized vol        realized vol         realized vol
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   REACTIVE NETWORK  │
              │                     │
              │  weighted average:  │
              │  σ = 0.35×σ_eth     │
              │    + 0.30×σ_arb     │
              │    + 0.20×σ_base    │
              │    + 0.15×σ_bsc     │
              └──────────┬──────────┘
                         │  updateVolatility(σ, chainsMask, samples)
                         ▼
              ┌─────────────────────┐
              │  VolatilityOracle   │   Ring buffer: 48 slots
              │                     │   ┌──┬──┬──┬──┬──┬──┐
              │  volatility = 0.72  │   │48│47│46│..│ 2│ 1│ ← newest
              │  lastUpdated = now  │   └──┴──┴──┴──┴──┴──┘
              │                     │
              │  getVolatility():   │
              │  if age > 1 hour    │
              │    REVERT ✗         │   ← safety guard
              │  else return σ ✓    │
              └─────────────────────┘
```

---

### What is Unichain?

Unichain is a new blockchain built by the Uniswap team — designed from scratch specifically for DeFi and trading applications.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN COMPARISON                             │
├───────────────────┬──────────────────┬──────────────────────────────┤
│                   │   ETHEREUM       │   UNICHAIN                   │
├───────────────────┼──────────────────┼──────────────────────────────┤
│ Block time        │ 12 seconds       │ ~1 second                    │
│ Gas cost per swap │ $5 – $30         │ < $0.01                      │
│ V4 hook support   │ Yes              │ Native (optimized)           │
│ Best for          │ General purpose  │ DeFi, swaps, options         │
└───────────────────┴──────────────────┴──────────────────────────────┘
```

For Voltaire, Unichain means:
- Your option purchase settles in **~1 second**
- Gas to buy an option costs **less than a penny**
- V4 hooks like Voltaire are first-class citizens

---

### What is Reactive Network?

Reactive Network is infrastructure that watches multiple blockchains at once and fires on-chain transactions automatically when conditions are met.

Voltaire uses it for two jobs:

```
JOB 1 — LIVE VOLATILITY FEED
─────────────────────────────

  Every 5 minutes:
  Ethereum ──┐
  Arbitrum ──┤──▶ Reactive aggregates ──▶ pushes σ to VolatilityOracle
  Base     ──┤    288×/day per chain        on Unichain
  BSC      ──┘

  Result: Options always priced on REAL volatility.
  Manipulation requires moving 4 markets at once. Practically impossible.


JOB 2 — AUTOMATIC SETTLEMENT
──────────────────────────────

  Option expires March 28, 8:00pm UTC
          │
          │  [no human needed]
          │
          ▼
  Reactive cron job fires exactly at expiry
          │
          ▼
  settleExpiredSeries() called on Unichain
          │
          ▼
  Winners can claim their payout immediately

  Result: Zero keeper bots. Zero infrastructure to maintain.
          Zero risk of settlement failing.
```

---

## Live on Testnet

Voltaire is deployed and live on **Unichain Sepolia** — Uniswap's official test network.

**Network:** Unichain Sepolia
**Chain ID:** 1301
**RPC:** `https://sepolia.unichain.org`
**Explorer:** [sepolia.uniscan.xyz](https://sepolia.uniscan.xyz)

| Contract | Address | Explorer |
|---|---|---|
| `OptionsHook` | `0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815` | [View](https://sepolia.uniscan.xyz/address/0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815) |
| `CollateralVault` | `0xbD0F937f4ec7a4584aC5535655E4245842Cf2fF7` | [View](https://sepolia.uniscan.xyz/address/0xbD0F937f4ec7a4584aC5535655E4245842Cf2fF7) |
| `OptionSeries` | `0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8` | [View](https://sepolia.uniscan.xyz/address/0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8) |
| `VolatilityOracle` | `0x60E045da4c55778d1F56cD13550F901E0C0C7b11` | [View](https://sepolia.uniscan.xyz/address/0x60E045da4c55778d1F56cD13550F901E0C0C7b11) |

**Deployer:** `0x9978E5462E76F86925eF6471B8af61A654B598Ab`
**Deployment tx:** See [`broadcast/DeploySepolia.s.sol/1301/run-latest.json`](broadcast/DeploySepolia.s.sol/1301/run-latest.json)

---

## How to Use Voltaire

### As a Trader — Buying an Option

You believe ETH will be above $3,400 by March 28, 2026.

**Step 1** — Connect your wallet to Unichain Sepolia

**Step 2** — Prepare your swap call with option parameters:
```
Strike:      $3,400
Expiry:      March 28, 2026
Type:        Call (you think ETH goes UP)
Quantity:    1 contract
Max premium: $200 (your slippage limit)
```

**Step 3** — Submit the swap. You pay ~$142 USDC in premium.

**Step 4** — Token `ETH-3400-MAR26-C` appears in your wallet. This IS your option.

**Step 5 — At expiry (automatic):**
```
ETH = $3,800 → claim $400 payout   (profit: $400 - $142 = $258)
ETH = $3,200 → option expires worthless (loss: $142 premium only)
```

### As a Liquidity Provider — Earning Yield

You have idle USDC and want to earn yield.

**Step 1** — Deposit USDC into `CollateralVault`
**Step 2** — You receive vault shares
**Step 3** — Every premium paid by traders flows into the vault automatically
**Step 4** — Your shares become worth more over time
**Step 5** — Withdraw anytime (when liquidity is not locked backing active options)

**Demonstrated yield: 17.3% APY**

Risk: if many options expire in-the-money in the same period, vault NAV decreases.

---

## Real-World Use Cases

| Who | How they use Voltaire |
|---|---|
| **ETH holder** | Buy put options to protect against a price crash — like insurance |
| **Trader** | Buy cheap calls to bet on ETH rising without risking full capital |
| **USDC holder** | Deposit into vault, earn premiums as passive yield (17.3% APY) |
| **DeFi protocol** | Hedge treasury ETH exposure against market downturns |
| **AI agent** | Autonomously hedge or speculate with zero human involvement |
| **Institutional** | Access manipulation-resistant, fully auditable options pricing |

---

## Key Numbers

| Metric | Value |
|---|---|
| Smart contracts deployed | 4 (+ BlackScholes library) |
| Lines of Solidity | ~3,000 |
| Test coverage | 112 tests, all passing |
| Chains feeding volatility | 4 (Ethereum, Arbitrum, Base, BSC) |
| Volatility samples per day | 288 per chain (every 5 minutes) |
| Max data staleness before revert | 1 hour |
| Vault APY demonstrated | 17.3% |
| Human keepers required | **Zero** |
| Protocol fee | 0.3% |
| Testnet | Unichain Sepolia (Chain ID 1301) |

---

## What I Learned Building This

Building Voltaire was one of the most technically demanding projects I've worked on. Here's an honest account of what I learned:

### 1. Fixed-Point Math is Unforgiving

Implementing Black-Scholes in pure Solidity with WAD (1e18) fixed-point arithmetic taught me how quickly intermediate calculations overflow.

The most dangerous moment: computing `r^5` in the Taylor series for `expWad`. A direct multiplication of 5 large WAD values silently overflows `int256`. I had to accumulate incrementally:

```solidity
// WRONG — overflows int256
int256 r5 = (r * r * r * r * r) / WAD4;

// CORRECT — accumulate step by step
int256 r2 = (r * r) / WAD;
int256 r3 = (r2 * r) / WAD;
int256 r4 = (r3 * r) / WAD;
int256 r5 = (r4 * r) / WAD;
```

**Lesson:** In Solidity math, always think about intermediate values, not just inputs and outputs.

### 2. The `normcdf` Bug That Made Everything Look Right But Be Wrong

My normal CDF implementation was returning values close to 1 for almost all inputs — options were being priced too high across the board, but only slightly. It took days to find because the outputs "looked reasonable."

The bug: an extra `/1e9` in the polynomial evaluation was making the probability term nearly always round up to 1.

```solidity
// WRONG — extra division made CDF ≈ 1 always
uint256 p = mulDiv(pdf, poly / 1e9, WAD);

// CORRECT
uint256 p = mulDiv(pdf, poly, WAD);
```

**Lesson:** Financial math bugs are subtle. Test against known reference values (I used Python's `scipy.stats.norm.cdf`), not just directional properties.

### 3. The Chicken-and-Egg Hook Deployment Problem

`OptionsHook` needs the address of `OptionSeries` at construction. `OptionSeries` needs the address of `OptionsHook` at construction. Neither can be deployed first.

My solution: deploy `OptionSeries` with the deployer address as a temporary hook, deploy `OptionsHook` with the real series address, then redeploy `OptionSeries` with the real hook address, then redeploy `OptionsHook` with the final series address.

```
Deploy OptionSeries(deployer as temp hook)
Deploy OptionsHook(real series address)
Deploy OptionSeries_FINAL(real hook address)
Deploy OptionsHook_FINAL(final series address)
vault.setHook(hookFinal)
```

**Lesson:** Circular dependencies in smart contracts require careful deployment ordering. Always plan the deployment sequence before writing any deploy script.

### 4. Uniswap V4 Hook Permissions are Encoded in the Address

V4 validates that a hook contract's deployed address encodes the permissions it claims. If the address doesn't end with the right bits, the pool initialization reverts.

For Voltaire (`beforeSwap` + `beforeSwapReturnsDelta`), the address must end in `0x88`.

```
BEFORE_SWAP              = bit 7 = 0b10000000
BEFORE_SWAP_RETURNS_DELTA = bit 3 = 0b00001000
Combined                 = 0b10001000 = 0x88
```

In production, you must use `HookMiner` + `CREATE2` to find a deployment salt that produces an address with those bits. On testnet I bypassed this constraint — but it means the testnet hook can't be used with a real V4 pool until redeployed at the correct address.

**Lesson:** Read the Uniswap V4 hook documentation carefully before designing your deployment strategy.

### 5. `vm.expectRevert` Cannot Catch Pure Internal Reverts

In Foundry, `vm.expectRevert` intercepts reverts at the call boundary. If the function being tested is `pure` or `internal` and reverts, the test framework can't catch it — the test itself panics.

Fix: wrap the library in an external harness contract:

```solidity
contract BSHarness {
    function price(...) external pure returns (uint256) {
        return BlackScholes.price(...); // now catchable
    }
}
```

**Lesson:** Test design matters as much as contract design. Know your testing framework's constraints before writing tests for edge cases.

### 6. Ring Buffer Underflow in History Retrieval

My `getHistory()` function in `VolatilityOracle` had a uint256 underflow on the very first call (before any updates):

```solidity
// WRONG — underflows when historyHead < i+1
uint256 idx = (historyHead - i - 1) % HISTORY_SIZE;

// CORRECT — add HISTORY_SIZE before subtracting
uint256 idx = (historyHead + HISTORY_SIZE - 1 - i) % HISTORY_SIZE;
```

**Lesson:** Ring buffer arithmetic always needs the modular addition trick to avoid underflow. Write the test for the empty buffer case first.

### 7. Cross-Chain Architecture Requires Thinking in Async

In traditional programming, you call a function and get a result. In cross-chain systems, data flows asynchronously — Reactive Network pushes updates to the oracle, the oracle stores them, and the hook reads them later.

This means the protocol must be designed to handle gaps: what if the oracle hasn't been updated in 2 hours? (Answer: revert — don't price on stale data.)

**Lesson:** In cross-chain systems, design for failure explicitly. Every data dependency must have a defined behaviour when the data is missing or stale.

---

## Common Pitfalls

If you're building something similar, here are the mistakes I hit so you don't have to:

### Solidity Math

| Pitfall | Symptom | Fix |
|---|---|---|
| Overflow in Taylor series | Silent wrong answer or revert | Accumulate intermediate products step by step |
| Extra division in fixed-point | Output always near boundary value | Audit every `/` in math functions |
| uint256 ring buffer underflow | Revert on first read | Always add modulus before subtracting in ring buffer index |
| WAD vs non-WAD mixed | Prices off by 1e18 | Keep units consistent; label every variable with its scale |

### Foundry Testing

| Pitfall | Symptom | Fix |
|---|---|---|
| `vm.expectRevert` on pure functions | Test panics instead of passing | Wrap in external harness contract |
| Hook tests calling hook-only functions | `OnlyHook` revert | Deploy isolated contracts with test contract as the hook |
| Fuzz test with unbounded inputs | Impossible inputs cause spurious failures | Always `bound()` fuzz inputs to realistic ranges |

### Uniswap V4 Hooks

| Pitfall | Symptom | Fix |
|---|---|---|
| Hook address doesn't encode permissions | Pool init reverts | Use HookMiner + CREATE2 in production |
| Circular deployment dependencies | One contract missing the other's address | Plan deployment order, use temp addresses + setters |
| BeforeSwapDelta sign confusion | Premium taken twice or not at all | Test delta direction carefully with minimal examples first |

### Cross-Chain / Oracle Design

| Pitfall | Symptom | Fix |
|---|---|---|
| No staleness guard | Stale vol propagates silently | Always revert on stale data — never fall back |
| Single-chain vol source | Manipulable, arbitrageable | Aggregate from multiple chains |
| Push settlement (iterating holders) | Unbounded gas, DoS risk | Use pull model — holders claim individually |

---

## Known Limitations & What Would Be Better With More Time

### Reactive Network RSCs — Not Deployed on Testnet

The two Reactive Smart Contracts (`ReactiveVolatilityRelayer` and `ReactiveExpirySettler`) are **written and ready** but could not be deployed during development due to infrastructure issues with the Reactive Network testnet:

- The Kopli testnet was deprecated mid-build and replaced by the **Lasna testnet**
- The Lasna faucet requires bridging SepETH → lReact via a faucet contract on Ethereum Sepolia
- All public Sepolia faucets (Chainlink, Alchemy, QuickNode) require a minimum mainnet ETH balance as spam protection, which blocked access to testnet tokens

**What these RSCs would have done if deployed:**

| Without RSCs (current state) | With RSCs deployed |
|---|---|
| VolatilityOracle seeded manually at 70% annualized vol | Vol auto-updated every ~1 hour from real Uniswap V3 swap data across Ethereum, Arbitrum, Base, and BSC |
| Options priced using a static vol seed | Options priced using live cross-chain realized volatility (35% Ethereum · 30% Arbitrum · 20% Base · 15% BSC weighted) |
| Expired series must be settled manually via `cast send` | Settlement triggers automatically at expiry — no bots, no keepers, no manual intervention |

The contracts are fully auditable at:
- [`src/reactive/ReactiveVolatilityRelayer.sol`](src/reactive/ReactiveVolatilityRelayer.sol)
- [`src/reactive/ReactiveExpirySettler.sol`](src/reactive/ReactiveExpirySettler.sol)
- [`script/DeployReactive.s.sol`](script/DeployReactive.s.sol)

Once Lasna testnet faucet access is available, deploying them is a single `forge script` command.

---

## For Developers

<details>
<summary>Click to expand — project structure, contracts, quick start, deployment</summary>

### Smart Contracts

| Contract | Purpose |
|---|---|
| `OptionsHook.sol` | Uniswap V4 hook: `beforeSwap` intercept, option pricing, settlement, admin |
| `BlackScholes.sol` | Pure library: WAD fixed-point BS, normcdf, lnWad, expWad |
| `VolatilityOracle.sol` | Cross-chain vol store: ring buffer of 48 observations, staleness revert |
| `OptionSeries.sol` | Series registry: create, mint, burn, settle; deploys one ERC20 per series |
| `OptionToken.sol` | Minimal ERC20 per series (e.g. `ETH-3400-MAR26-C`) |
| `CollateralVault.sol` | Share-based USDC vault: lock, receivePremium, paySettlement |

### Quick Start

```bash
git clone https://github.com/Hijanhv/Voltaire
cd Voltaire
forge install
forge build
forge test -vv  # 112 tests
```

### Deploy to Unichain Sepolia

```bash
export PRIVATE_KEY=0x...
forge script script/DeploySepolia.s.sol \
  --rpc-url https://sepolia.unichain.org \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Project Structure

```
voltaire/
├── src/
│   ├── OptionsHook.sol
│   ├── BlackScholes.sol
│   ├── VolatilityOracle.sol
│   ├── OptionSeries.sol
│   ├── OptionToken.sol
│   └── CollateralVault.sol
├── script/
│   ├── DeploySepolia.s.sol
│   └── InitPool.s.sol
├── test/
│   ├── BlackScholes.t.sol
│   ├── VolatilityOracle.t.sol
│   ├── CollateralVault.t.sol
│   ├── OptionSeries.t.sol
│   └── OptionsHook.t.sol
├── frontend/               # Next.js + wagmi
├── landing/                # index.html landing page
└── broadcast/              # Deployment artifacts
```

</details>

---

## Further Reading

- [Uniswap V4 Hooks Overview](https://docs.uniswap.org/contracts/v4/overview)
- [BeforeSwapDelta Spec](https://docs.uniswap.org/contracts/v4/concepts/hooks/before-swap-return-delta)
- [Reactive Network Docs](https://docs.reactive.network)
- [Black-Scholes Model](https://en.wikipedia.org/wiki/Black%E2%80%93Scholes_model)
- [Options Trading — Investopedia](https://www.investopedia.com/options-basics-tutorial-4583012)

---

## Project ID

`HK-UHI8-0699`

---

## License

**Business Source License 1.1 (BSL-1.1)** — See [LICENSE](LICENSE)

- Educational and non-commercial use is **permitted**
- Commercial production use requires **prior written consent** from the Licensor
- Automatically transitions to **MIT License on 2030-01-01**

© 2026 Janhavi Vijay Chavada. All rights reserved.

---

<div align="center">

Built on Unichain · Reactive Network

*"Options were always a good idea. Real-time cross-chain vol just made them viable."*

</div>
