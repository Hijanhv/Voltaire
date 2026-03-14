# Voltaire — Pitch Assets

## One-Line Pitch

> **"The first options AMM where volatility is a live fact, not an assumption — priced on-chain via Black-Scholes, fuelled by a four-chain realised vol index from Reactive Network."**

---

## Elevator Pitch (30 seconds)

Voltaire is a Uniswap V4 hook that turns any pool into a European options market.
When you swap, the hook intercepts and — using a live cross-chain volatility index
aggregated from Ethereum, Arbitrum, Base, and BSC by Reactive Network —
computes a Black-Scholes price entirely on-chain.
Option tokens are minted JIT. Settlement is automated by Reactive cron at expiry.
No keepers. No stale vol. No order book.

---

## Why It Wins

| Problem | Voltaire Solution |
|---------|-------------------|
| On-chain options use stale or manipulable vol | **Reactive Network aggregates 4-chain realised vol — live, tamper-resistant** |
| Options require keeper bots for settlement | **Reactive cron triggers settlement automatically at expiry** |
| Option writers lock capital with zero yield | **CollateralVault earns premiums, ~17% APY for writers** |
| DeFi options need off-chain order books | **Uniswap V4 hook = any swap can be an option purchase** |
| MEV extracts value from options arb | **Unichain MEV tax routes arbitrage back to protocol** |

---

## Sponsor Integrations

### Reactive Network (Primary)
- **Cross-chain vol oracle**: Reactive subscribes to TWAP price events on Ethereum, Arbitrum, Base, BSC → computes realised vol → pushes to `VolatilityOracle.sol`
- **Automated settlement**: Reactive cron job scheduled per option expiry triggers `settleExpiredSeries()` with the final cross-chain TWAP spot price
- **No keeper infrastructure needed** — Reactive is the keeper

### Unichain (Primary)
- All contracts deployed on Unichain
- **MEV tax**: Unichain's MEV capture mechanism channels options arbitrage value back to the protocol, improving capital efficiency
- Low fees make per-option-purchase gas costs viable

---

## Architecture (key insight)

```
[4 chains: Eth / Arb / Base / BSC]
         ↓  TWAP prices
    [Reactive Network]
    ├── Computes realised vol (weighted avg)
    ├── Pushes → VolatilityOracle.sol
    └── Cron: triggers settlement at each expiry

[Trader on Unichain]
    └── swap(hookData: {strike, expiry, isCall, qty})
              ↓
        [OptionsHook.beforeSwap]
        ├── reads vol from VolatilityOracle
        ├── prices via BlackScholes.sol
        ├── checks CollateralVault liquidity
        ├── mints OptionToken (ERC20)
        └── returns BeforeSwapDelta (premium)
```

---

## Numbers That Impress Judges

- **~3,000 lines** of Solidity across 6 contracts
- **4 chains** feeding the vol index (Ethereum, Arbitrum, Base, BSC)
- **288 samples/24h** for volatility computation
- **0 keepers** required — fully automated via Reactive Network
- **17.3% APY** demonstrated for vault depositors
- **0 external oracle dependencies** — BS pricing is pure on-chain math
