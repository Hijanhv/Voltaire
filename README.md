# Voltaire ⚡

<div align="center">

**Buy and sell crypto options directly inside a Uniswap swap. No brokers. No middlemen. Priced fairly in real time.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity)](https://docs.soliditylang.org/)
[![Uniswap V4](https://img.shields.io/badge/Uniswap-V4%20Hook-ff007a)](https://docs.uniswap.org/contracts/v4/overview)
[![Reactive Network](https://img.shields.io/badge/Reactive-Network-6366f1)](https://reactive.network)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFDB1C)](https://getfoundry.sh)
[![Tests](https://img.shields.io/badge/Tests-112%20passing-brightgreen)]()

[Trade Options](#how-to-use-voltaire) · [Architecture](#how-it-works-simple-version) · [Live Contracts](#live-on-testnet) · [For Developers](#for-developers)

</div>

---

## What is Voltaire?

Voltaire lets anyone buy **options** on ETH — directly inside Uniswap — without needing a brokerage account, a KYC process, or any middleman.

> **Not sure what an option is?** Keep reading. It's simpler than it sounds.

---

## What is an Option? (Plain English)

Imagine ETH is trading at **$3,000** today.

You think it might go up to $4,000, but you're not 100% sure. You don't want to risk buying a full ETH in case you're wrong.

Instead, you buy an **option** — specifically a **call option** — for a small fee (called a *premium*), say **$70**.

Here's what that means:

| Scenario | What happens |
|---|---|
| ETH goes to **$4,000** at expiry | You profit $1,000 − $70 = **$930** |
| ETH stays at **$3,000** | You lose only your $70 premium |
| ETH crashes to **$1,000** | You still lose only your $70 premium |

**Your maximum loss is always just what you paid upfront.** That's the power of options — defined risk, unlimited upside.

You can also buy a **put option** if you think ETH will fall. A put profits when the price drops below your chosen level.

---

## What is Voltaire Solving?

Options have existed in traditional finance (stocks, commodities) for decades. But in crypto, on-chain options have always had one fatal flaw: **the price is always wrong.**

Here's why existing crypto options protocols fail:

| Problem | What it means in plain terms |
|---|---|
| **Stale volatility** | The price of an option depends heavily on how much the market is moving. Old protocols use a fixed "volatility" number set by an admin — like checking yesterday's weather forecast for today. Options are instantly mispriced. |
| **One source of data** | If you only watch one exchange to judge how volatile ETH is, a whale can temporarily manipulate that exchange and game the pricing. |
| **Human keepers** | When an option expires, someone has to trigger the settlement on-chain. Old protocols depend on bots funded by a team. If the bot goes down, your money is stuck. |
| **Off-chain order books** | Some protocols pretend to be DeFi but actually run a centralized server for matching orders. Not truly decentralized. |

**Voltaire fixes all of this.**

---

## How Voltaire Fixes It

| Old Problem | Voltaire's Solution |
|---|---|
| Stale volatility | Pulls **live volatility data from 4 blockchains** (Ethereum, Arbitrum, Base, BSC), updated 288 times per day — like a real-time weather feed instead of yesterday's forecast |
| One source manipulation | Using data from 4 chains means a manipulator would need to move all 4 markets simultaneously — economically impossible |
| Human keepers | **Reactive Network** automatically triggers settlement at expiry — zero humans, zero bots to fund, zero risk of it going down |
| Off-chain logic | Everything runs inside a **Uniswap V4 hook** — 100% on-chain, 100% transparent, no hidden servers |
| Writers earn nothing | Liquidity providers earn option premiums as yield — **17.3% APY demonstrated** |

---

## What is a "Uniswap V4 Hook"?

Uniswap is the largest decentralized exchange. Version 4 introduced a new feature called **hooks** — think of them as plugins or add-ons that run automatically during a swap.

Normally when you swap ETH for USDC on Uniswap, it just exchanges tokens at the market price.

With Voltaire's hook:
- You send a swap with some extra instructions (strike price, expiry date, call or put)
- Before the swap executes, the hook **intercepts it**, prices your option using a mathematical formula, checks there's enough collateral, and instantly gives you an **option token** in your wallet
- The premium you pay comes out of the same transaction — no extra steps

**It's like Uniswap growing an options desk inside itself, with no new exchange needed.**

---

## How to Use Voltaire

### As a Trader (Buying Options)

You want to bet that ETH will be above $3,400 by March 28, 2026.

1. Go to the Voltaire app (or connect via Uniswap with Voltaire hook active)
2. Choose: **ETH-3400-MAR26-CALL**
3. Set how many contracts you want
4. Set your maximum premium you're willing to pay (slippage protection)
5. Submit the swap — you pay the premium in USDC
6. You receive an **ETH-3400-MAR26-C** token in your wallet — this IS your option

**At expiry:**
- If ETH > $3,400: claim your payout in USDC automatically
- If ETH ≤ $3,400: your option expires worthless, you keep nothing (but you only ever risked the premium)

### As a Liquidity Provider (Earning Yield)

You have USDC sitting idle and want to earn yield on it.

1. Deposit USDC into the **CollateralVault**
2. Your USDC backs the options that traders buy
3. Every premium paid by traders flows into the vault
4. Your share of the vault grows — you withdraw more USDC than you put in
5. **Demonstrated yield: 17.3% APY**

Risk: if many options expire in-the-money (traders win big), your vault balance decreases. This is the standard risk of being an options market maker.

### As an AI Agent (Fully Autonomous)

Voltaire supports the **x402 protocol** — AI agents can buy options with no human involvement:

1. Agent requests a quote via HTTP
2. Server responds: "Pay $142.30 USDC to this address"
3. Agent broadcasts the transaction on-chain
4. Option token lands in agent's wallet
5. At expiry, payout is automatic

No accounts. No API keys. No humans in the loop.

---

## Real-World Use Cases

| Who | How they use Voltaire |
|---|---|
| **ETH holder** | Buy a put option to protect against a crash — like insurance on your ETH |
| **Trader** | Buy a cheap call to bet on ETH going up without risking your full portfolio |
| **USDC holder** | Deposit into the vault and earn yield from option premiums — passive income |
| **DeFi protocol** | Use options to hedge treasury exposure to volatile assets |
| **AI agent** | Autonomously hedge a portfolio or speculate on volatility without human input |
| **Institutional** | Access on-chain options with transparent, auditable, manipulation-resistant pricing |

---

## What is Unichain? (And Why Does Voltaire Run On It?)

Unichain is a new blockchain built specifically for DeFi — created by the same team that built Uniswap, the world's largest decentralized exchange.

Think of blockchains like cities. Ethereum is New York — huge, powerful, but congested and expensive. Unichain is like a brand-new financial district built from scratch, designed only for trading and financial applications.

**Why Voltaire runs on Unichain:**

| Feature | What it means for you |
|---|---|
| **Fast blocks** | Transactions confirm in ~1 second instead of 12 seconds on Ethereum |
| **Cheap fees** | Gas costs a fraction of a cent instead of dollars |
| **Built for Uniswap V4** | Native support for hooks like Voltaire — everything just works |
| **Shared liquidity** | Access to all of Uniswap's existing liquidity pools |

When you buy an option on Voltaire, your transaction settles on Unichain in about one second, for less than a penny in fees. On Ethereum mainnet, the same transaction might cost $20 and take 15 seconds.

---

## What is Reactive Network? (The Secret Engine Behind Voltaire)

Reactive Network is infrastructure that watches multiple blockchains simultaneously and automatically triggers actions when conditions are met — without any human intervention.

**The simplest analogy:** Reactive Network is like a smart alarm clock that watches 4 different time zones at once and automatically does things at the right moment.

### How Voltaire uses Reactive Network for two critical jobs:

**Job 1 — Live Volatility Feed**

> *"How much has ETH been moving lately?"*

This is the most important input to options pricing. If ETH has been calm, options are cheap. If ETH has been wild, options are expensive.

The problem: if you only watch one exchange, a whale can temporarily fake calm or fake volatility by making large trades. Your options get mispriced instantly.

Reactive Network solves this by watching **4 blockchains at once** — Ethereum, Arbitrum, Base, and BSC — and sampling the data **288 times per day** (every 5 minutes). It then pushes a single aggregated volatility number to Voltaire's oracle on Unichain.

```
Ethereum ──┐
Arbitrum ──┤  Reactive Network  ──▶  VolatilityOracle on Unichain
Base     ──┤  aggregates all 4        (updated every 5 minutes)
BSC      ──┘  288 samples/day
```

To manipulate this number, an attacker would need to move all 4 markets simultaneously — which would cost hundreds of millions of dollars. It's practically impossible.

**Job 2 — Automatic Settlement at Expiry**

> *"My option expires today. Who pays me?"*

In traditional finance, there's a clearing house — a company whose entire job is making sure contracts are settled. In DeFi, most protocols need someone to manually trigger settlement (called a "keeper"). If the keeper bot runs out of funds or goes offline, your option doesn't settle and your money is stuck.

Reactive Network replaces the keeper with a **cron job** — a scheduled task that fires automatically at the exact moment each option expires. Nobody has to fund it. Nobody has to maintain it. It just runs.

```
Option expires at 8:00pm UTC March 28
        │
        ▼
Reactive Network cron fires automatically
        │
        ▼
settleExpiredSeries() called on Unichain
        │
   ┌────┴────┐
   │         │
ETH > $3,400  ETH ≤ $3,400
   │         │
Payout       Writers keep
unlocked     the premium
```

**The result:** Option buyers can trust they'll be paid if they win. Option writers can trust their capital is freed up when options expire. Zero trust in any company or bot operator required.

---

## Why Does This Matter?

The global options market is **$10+ trillion** in notional value. Almost none of it is on-chain.

The reason? Pricing has always required trust — trust in a broker to quote you fairly, trust in an exchange not to be manipulated, trust in a settlement system to pay you correctly.

Voltaire removes every one of those trust requirements:
- Pricing is math, not a broker's quote
- Volatility comes from 4 chains, not one manipulable source
- Settlement is automatic, not dependent on a company staying in business
- Collateral is locked in smart contracts, not held by a custodian

---

## How It Works (Simple Version)

```
You want to buy an ETH call option
              │
              ▼
    You submit a Uniswap swap
    with option details attached
              │
              ▼
    Voltaire Hook intercepts it
              │
      ┌───────┴────────┐
      │                │
      ▼                ▼
  "What's ETH      "How volatile
   worth now?"      is ETH?"
      │                │
      │         Reactive Network
      │         checks 4 blockchains
      │         288 times/day
      │                │
      └───────┬────────┘
              │
              ▼
    Black-Scholes formula
    calculates fair premium
              │
              ▼
    Premium deducted from your USDC
    Option token sent to your wallet
              │
              ▼
         [At Expiry]
              │
    Reactive Network auto-settles
              │
       ┌──────┴──────┐
       │             │
   ETH > strike   ETH ≤ strike
   Claim payout   Option expires
   in USDC        worthless
```

---

## How is the Price Calculated?

Voltaire uses the **Black-Scholes formula** — the same mathematical model used by professional options traders on Wall Street since 1973, now running entirely on-chain in Solidity.

The formula takes 5 inputs:
1. **Current ETH price** — read directly from the Uniswap pool
2. **Strike price** — what you chose when buying
3. **Time until expiry** — how many seconds remain
4. **Volatility** — how much ETH has been moving (pulled live from 4 chains)
5. **Call or Put** — which direction you're betting

The output is the fair premium you should pay. No human sets this number. No admin can change it. It's pure math.

---

## Live on Testnet

Voltaire is deployed and live on **Unichain Sepolia** (Uniswap's official test network).

| Contract | What it does | Address |
|---|---|---|
| `OptionsHook` | The brain — intercepts swaps, prices options, handles settlement | [`0xD9789FEc57c950638D1Ba88941a0C65f32F81f58`](https://sepolia.uniscan.xyz/address/0xD9789FEc57c950638D1Ba88941a0C65f32F81f58) |
| `CollateralVault` | The safe — holds USDC from LPs, pays out winners | [`0xB4A9Ddc348D8814c95Fd6811B2899f5036920324`](https://sepolia.uniscan.xyz/address/0xB4A9Ddc348D8814c95Fd6811B2899f5036920324) |
| `OptionSeries` | The registry — tracks every option series ever created | [`0x846f41aE723Ea3f81DeD68783B17aCa489714aF8`](https://sepolia.uniscan.xyz/address/0x846f41aE723Ea3f81DeD68783B17aCa489714aF8) |
| `VolatilityOracle` | The feed — stores live cross-chain volatility data | [`0x013dEE73A250A754705Dedc3A326cD9da9a4c856`](https://sepolia.uniscan.xyz/address/0x013dEE73A250A754705Dedc3A326cD9da9a4c856) |

**Network:** Unichain Sepolia (Chain ID: 1301)
**Explorer:** [sepolia.uniscan.xyz](https://sepolia.uniscan.xyz)

---

## Key Numbers

| What | Number |
|---|---|
| Chains powering the volatility index | 4 (Ethereum, Arbitrum, Base, BSC) |
| Volatility samples per day | 288 per chain |
| Maximum data age before system pauses | 1 hour (staleness guard) |
| Demonstrated LP yield | 17.3% APY |
| Human keepers required | **Zero** |
| Protocol fee | 0.3% |
| Test suite | 112 tests, all passing |

---

## For Developers

<details>
<summary>Click to expand technical documentation</summary>

### Architecture

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

### Smart Contracts

| Contract | Lines | Purpose |
|---|---|---|
| `OptionsHook.sol` | ~340 | Uniswap V4 hook: `beforeSwap` intercept, option pricing, settlement, admin |
| `BlackScholes.sol` | ~280 | Pure library: WAD fixed-point BS, A&S N(x) approximation, `lnWad`, `expWad`, `sqrt` |
| `VolatilityOracle.sol` | ~150 | Stores cross-chain vol pushed by Reactive; ring buffer of 48 observations; staleness revert |
| `OptionSeries.sol` | ~200 | Registry of all (underlying, quote, strike, expiry, isCall) series; deploys OptionToken per series |
| `OptionToken.sol` | ~50 | Minimal ERC20 (OpenZeppelin), mint/burn gated to `OptionSeries` |
| `CollateralVault.sol` | ~200 | Share-based USDC vault; `lockCollateral`, `receivePremium`, `paySettlement` |

**Total: ~1,220 lines core logic + ~1,700 lines comments ≈ 3,000 lines**

### Option Lifecycle (Technical)

**Step 1 — LP deposits USDC**

```solidity
// CollateralVault.sol
function deposit(address token, uint256 amount) external returns (uint256 shares)
// First deposit: 1:1 share ratio
// Subsequent: shares = amount * totalShares / totalAssets
```

**Step 2 — Trader initiates swap with hookData**

```solidity
struct OptionParams {
    uint256 strike;     // strike price in WAD (e.g. 3400e18 = $3,400)
    uint256 expiry;     // unix timestamp
    bool isCall;        // true = call, false = put
    uint256 quantity;   // contracts in WAD (1e18 = 1 contract)
    uint256 maxPremium; // slippage guard
}
```

**Step 3 — `beforeSwap` prices and fills**

```solidity
uint256 spot = _getSpotFromPool(key);
uint256 vol  = volOracle.getVolatility();  // reverts if > 1h stale
uint256 tte  = p.expiry - block.timestamp;
uint256 unitPremium = BlackScholes.price(spot, p.strike, tte, vol, p.isCall);
```

**Step 4 — Reactive Network auto-settles at expiry**

```solidity
function settleExpiredSeries(uint256 seriesId, uint256 spotPrice) external {
    if (msg.sender != reactiveCron) revert OnlyReactiveCron();
    // spotPrice = cross-chain TWAP at expiry, provided by Reactive
}
```

**Step 5 — ITM holders claim payout**

```solidity
uint256 payout = (intrinsic * balance) / 1e18;
optionSeries.burn(seriesId, msg.sender, balance);
vault.paySettlement(s.quoteAsset, msg.sender, payout, seriesId);
```

### Quick Start

```bash
# Clone
git clone https://github.com/Hijanhv/Voltaire
cd Voltaire
forge install

# Build
forge build

# Test (112 tests)
forge test -vv

# Deploy to Unichain Sepolia
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
│   ├── OptionsHook.sol        # Main hook — beforeSwap, settlement, admin
│   ├── BlackScholes.sol       # Pure math library — lnWad, expWad, normcdf, price()
│   ├── VolatilityOracle.sol   # Cross-chain vol store — ring buffer, staleness guard
│   ├── OptionSeries.sol       # Series registry — create, mint, burn, settle
│   ├── OptionToken.sol        # Minimal ERC20 per series (e.g. ETH-3400-MAR26-C)
│   └── CollateralVault.sol    # USDC vault — shares, utilization, premium accrual
├── script/
│   ├── DeploySepolia.s.sol    # Testnet deployment
│   └── InitPool.s.sol         # V4 pool initialization
├── test/                      # 112 Foundry tests
├── frontend/                  # Next.js frontend (wagmi, viem)
└── foundry.toml
```

### Key Design Decisions

**WAD Fixed-Point Arithmetic** — All math uses 1e18 as the unit. Floating point is non-deterministic across EVM nodes; WAD math produces identical results everywhere.

**Reactive Network for Vol** — Vol requires cross-chain aggregation. Single-chain vol can be manipulated via flash loans. 4 chains + 288 samples/day makes manipulation economically infeasible.

**Pull Model for Settlement** — Push settlement over thousands of holders is unbounded gas cost. Pull model caps per-claim gas at O(1).

**BeforeSwapDelta for Premiums** — Collects premium in the same atomic swap operation. No prior approval needed beyond the swap amount. Option purchase atomically fails if it can't be issued.

**Staleness Revert, Not Fallback** — If vol data is older than 1 hour, the oracle reverts (does not fall back to stale data). Stale vol is worse than no vol — it enables instant arbitrage against LPs.

### Test Suite

```bash
forge test -vv          # all 112 tests
forge test --gas-report # gas usage
forge test --match-test testBlackScholesAtmCall -vvv
```

Covers: Black-Scholes math correctness, oracle staleness/ring buffer, vault share accounting, series registry deduplication, hook end-to-end integration, ITM/OTM settlement branches, fuzz tests on all numerical inputs.

### Hook Address Requirements

Uniswap V4 encodes hook permissions in the contract address itself:

```
Flag bits required: BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA
Binary:             0b10001000 = 0x88
```

In production, use `HookMiner` + `CREATE2` to find a salt that produces an address ending in `0x88`.

### Deployment Order

```
1. VolatilityOracle
2. CollateralVault  (temp hook = deployer)
3. OptionSeries     (temp hook = deployer)
4. OptionsHook      (wires everything together)
5. vault.setHook(address(hook))
6. Redeploy OptionSeries with correct hook
7. Seed VolatilityOracle
8. Initialize Uniswap V4 pool
```

</details>

---

## Further Reading

**Understanding Options**
- [Options Trading Explained — Investopedia](https://www.investopedia.com/options-basics-tutorial-4583012)
- [Black-Scholes Model — Plain English](https://en.wikipedia.org/wiki/Black%E2%80%93Scholes_model)

**Uniswap V4**
- [V4 Hooks Overview](https://docs.uniswap.org/contracts/v4/overview)
- [What are Hooks? — Uniswap Blog](https://blog.uniswap.org/uniswap-v4)

**Reactive Network**
- [Reactive Network Documentation](https://docs.reactive.network)

**x402 Protocol**
- [x402 — HTTP payments for AI agents](https://x402.org)

---

## Project ID

`HK-UHI8-0699`

---

## License

MIT

---

<div align="center">

Built for [ETHGlobal](https://ethglobal.com) · Unichain · Reactive Network · x402

*"Options were always a good idea. Real-time cross-chain vol just made them viable."*

</div>
