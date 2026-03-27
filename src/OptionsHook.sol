// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {
    BeforeSwapDelta,
    toBeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {BaseHook} from "./BaseHook.sol";
import {BlackScholes} from "./BlackScholes.sol";
import {VolatilityOracle} from "./VolatilityOracle.sol";
import {OptionSeries} from "./OptionSeries.sol";
import {CollateralVault} from "./CollateralVault.sol";

/// @title OptionsHook
/// @notice Uniswap V4 hook that enables on-chain European options trading.
///
///         Flow:
///         1. Trader calls swap() with hookData encoding (strike, expiry, isCall, qty, maxPremium)
///         2. beforeSwap intercepts — if hookData is non-empty, it's an option purchase, not a swap
///         3. Black-Scholes prices the option using realized vol × 1.15x IV premium multiplier
///         4. Premium is taken from the trader via BeforeSwapDelta (no tokens physically moved here)
///         5. OptionToken is minted to the trader; collateral is locked in the CollateralVault
///         6. At expiry, Reactive Network cron calls settleExpiredSeries() with the final spot price
///         7. ITM holders call claimSettlement() to burn tokens and receive intrinsic value payout
///
///         Inherits BaseHook (official Uniswap v4-hooks-public pattern):
///         - poolManager + onlyPoolManager come from ImmutableState (v4-periphery)
///         - Only _beforeSwap is overridden; all other hooks revert HookNotImplemented
contract OptionsHook is BaseHook {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @dev Vault does not have enough free liquidity to back the requested option contracts
    error InsufficientVaultLiquidity();
    /// @dev settleExpiredSeries() called on a series that was already settled
    error SeriesAlreadySettled();
    /// @dev settleExpiredSeries() called before the series expiry timestamp
    error SeriesNotExpired();
    /// @dev Only the Reactive Network automated settler address may call settleExpiredSeries()
    error OnlyReactiveCron();
    /// @dev hookData provided to beforeSwap is too short to decode as OptionParams
    error InvalidHookData();
    /// @dev Computed premium exceeds the trader's maxPremium slippage guard
    error PremiumTooHigh();

    // ─── Events ───────────────────────────────────────────────────────────────

    event OptionPurchased(
        address indexed buyer,
        uint256 indexed seriesId,
        uint256 quantity,
        uint256 premiumPaid,
        uint256 impliedVol
    );
    event SeriesSettled(
        uint256 indexed seriesId, uint256 settlementPrice, bool inTheMoney, uint256 totalPayout
    );
    event PriceQuoted(uint256 indexed seriesId, uint256 spot, uint256 vol, uint256 premium);

    // ─── Types ────────────────────────────────────────────────────────────────

    /// @notice ABI-encoded hookData schema for option purchase swaps.
    ///         Traders pass this in the hookData field of IPoolManager.swap().
    struct OptionParams {
        uint256 strike; // strike price in WAD (1e18 = $1)
        uint256 expiry; // unix timestamp of option expiry
        bool isCall; // true = call option, false = put option
        uint256 quantity; // number of contracts in WAD (1e18 = 1 contract)
        uint256 maxPremium; // slippage guard: revert if premium exceeds this (WAD)
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    VolatilityOracle public immutable volOracle;
    OptionSeries public immutable optionSeries;
    CollateralVault public immutable vault;

    address public owner;
    /// @notice Address of the Reactive Network cron contract authorized to settle expired series
    address public reactiveCron;

    /// @notice Protocol fee taken from each premium, in basis points (default 30 = 0.3%)
    uint256 public protocolFeeBps = 30;

    /// @dev Scale factor applied to realized vol before Black-Scholes pricing.
    ///      Realized vol (historical) typically underestimates implied vol by ~15%.
    ///      Multiplying by 1.15x (11500 bps) bridges that gap for more accurate option pricing.
    uint256 private constant IV_MULT_BPS = 11_500;

    /// @notice Accumulated protocol fees per token address, withdrawable by owner
    mapping(address => uint256) public protocolFees;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        IPoolManager _poolManager,
        VolatilityOracle _volOracle,
        OptionSeries _optionSeries,
        CollateralVault _vault,
        address _reactiveCron
    ) BaseHook(_poolManager) {
        volOracle = _volOracle;
        optionSeries = _optionSeries;
        vault = _vault;
        reactiveCron = _reactiveCron;
        owner = msg.sender;
    }

    // ─── BaseHook: permissions ────────────────────────────────────────────────

    /// @inheritdoc BaseHook
    /// @dev Only beforeSwap and beforeSwapReturnDelta are enabled.
    ///      All other hooks revert HookNotImplemented if called.
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // intercept swaps to sell options
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true, // take premium from trader via delta mechanism
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── BaseHook: _beforeSwap ────────────────────────────────────────────────

    /// @inheritdoc BaseHook
    /// @dev Called by the external BaseHook.beforeSwap() wrapper (which enforces onlyPoolManager).
    ///      If hookData is empty, this is a regular AMM swap — pass through with zero delta.
    ///      If hookData is non-empty, decode as OptionParams and execute an option purchase.
    ///      The returned BeforeSwapDelta tells the PoolManager to debit the premium from the trader.
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata, /* params — unused, option pricing uses hookData */
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // Regular swap: no hookData means the trader just wants a normal AMM swap
        if (hookData.length == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 totalPremium = _processOptionSwap(sender, key, hookData);

        // Guard against int128 truncation before casting.
        // int128 max ≈ 1.7 × 10^38 WAD — any premium this large is economically impossible.
        if (totalPremium > uint256(uint128(type(int128).max))) revert PremiumTooHigh();
        // forge-lint: disable-next-line(unsafe-typecast)
        BeforeSwapDelta delta = toBeforeSwapDelta(int128(int256(totalPremium)), 0);
        return (IHooks.beforeSwap.selector, delta, 0);
    }

    /// @dev Extracted to avoid stack-too-deep in _beforeSwap.
    ///      Prices the option, checks collateral, mints the token, and routes the premium.
    function _processOptionSwap(address sender, PoolKey calldata key, bytes calldata hookData)
        internal
        returns (uint256 totalPremium)
    {
        OptionParams memory p = _decodeParams(hookData);

        // currency0 = underlying (e.g. WETH), currency1 = quote token (e.g. USDC)
        address quoteToken = Currency.unwrap(key.currency1);
        address underlying = Currency.unwrap(key.currency0);

        uint256 spot = _getSpotFromPool(key);

        // Apply IV premium: scale realized vol by 1.15x to approximate implied vol.
        // Realized vol from the oracle is ~15% lower than what the market prices in.
        uint256 vol = (volOracle.getVolatility() * IV_MULT_BPS) / 10_000;

        // Time to expiry in seconds; clamp to 0 if already expired
        uint256 tte = p.expiry > block.timestamp ? p.expiry - block.timestamp : 0;

        // Black-Scholes unit premium for 1 contract, then scale by quantity
        uint256 unitPremium = BlackScholes.price(spot, p.strike, tte, vol, p.isCall);
        totalPremium = (unitPremium * p.quantity) / 1e18;

        // Slippage guard: revert if market price exceeds trader's maxPremium
        if (totalPremium > p.maxPremium) revert PremiumTooHigh();

        uint256 fee = (totalPremium * protocolFeeBps) / 10_000;

        // Collateral required = max possible payout × quantity
        // For calls: max payout is bounded by the spot price (full underlying value)
        // For puts: max payout is bounded by the strike price
        uint256 maxPayout = p.isCall ? spot : p.strike;
        uint256 requiredCollateral = (maxPayout * p.quantity) / 1e18;
        if (vault.availableLiquidity(quoteToken) < requiredCollateral) {
            revert InsufficientVaultLiquidity();
        }

        // Get existing series ID or create a new one for this (underlying, quote, strike, expiry, type)
        uint256 seriesId =
            optionSeries.getSeriesId(underlying, quoteToken, p.strike, p.expiry, p.isCall);
        if (seriesId == type(uint256).max) {
            // New series: deploy a fresh ERC20 option token and register it
            (seriesId,) =
                optionSeries.createSeries(underlying, quoteToken, p.strike, p.expiry, p.isCall);
        }

        // Lock collateral in the vault so writers can't withdraw while options are live
        vault.lockCollateral(seriesId, quoteToken, requiredCollateral);

        // Mint option tokens to the trader (ERC20, transferable)
        optionSeries.mint(seriesId, sender, p.quantity);

        // Route premium: protocol fee stays in hook, remainder goes to vault as yield for LPs
        protocolFees[quoteToken] += fee;
        vault.receivePremium(quoteToken, totalPremium - fee);

        emit OptionPurchased(sender, seriesId, p.quantity, totalPremium, vol);
        emit PriceQuoted(seriesId, spot, vol, unitPremium);
    }

    // ─── Settlement (called by Reactive Network cron) ─────────────────────────

    /// @notice Reactive Network cron triggers this at option expiry.
    ///         Computes intrinsic value and emits event; holders must pull via claimSettlement().
    /// @param seriesId   The series to settle
    /// @param spotPrice  Final spot price sourced from cross-chain TWAP at expiry (WAD)
    function settleExpiredSeries(uint256 seriesId, uint256 spotPrice) external {
        // Only the authorized Reactive Network cron may settle — prevents manipulation
        if (msg.sender != reactiveCron) revert OnlyReactiveCron();

        OptionSeries.Series memory s = optionSeries.getSeries(seriesId);
        if (s.settled) revert SeriesAlreadySettled();
        if (block.timestamp < s.expiry) revert SeriesNotExpired();

        // Compute intrinsic value per contract at settlement
        uint256 intrinsic;
        bool itm;
        if (s.isCall && spotPrice > s.strike) {
            // Call: in the money when spot > strike; holder profits = spot - strike
            intrinsic = spotPrice - s.strike;
            itm = true;
        } else if (!s.isCall && s.strike > spotPrice) {
            // Put: in the money when strike > spot; holder profits = strike - spot
            intrinsic = s.strike - spotPrice;
            itm = true;
        }

        // Mark the series as settled on-chain before any payouts (re-entrancy safety)
        optionSeries.settleSeries(seriesId, spotPrice);

        if (!itm) {
            // OTM: options expire worthless, unlock collateral so LPs can withdraw
            vault.unlockCollateral(seriesId, s.quoteAsset);
            emit SeriesSettled(seriesId, spotPrice, false, 0);
            return;
        }

        // ITM: use a pull model — holders call claimSettlement() to burn tokens and receive payout.
        // Iterating over all holders would be gas-intensive and could exceed block gas limits.
        uint256 totalSupply = IERC20(s.optionToken).totalSupply();
        uint256 totalPayout = (intrinsic * totalSupply) / 1e18;

        emit SeriesSettled(seriesId, spotPrice, true, totalPayout);
    }

    /// @notice Option holders call this post-settlement to claim their payout.
    ///         Burns option tokens and transfers intrinsic value from the vault.
    function claimSettlement(uint256 seriesId) external {
        OptionSeries.Series memory s = optionSeries.getSeries(seriesId);
        require(s.settled, "not settled");

        uint256 balance = IERC20(s.optionToken).balanceOf(msg.sender);
        require(balance > 0, "no options");

        // Recompute intrinsic at settlement price to determine per-token payout
        uint256 intrinsic;
        if (s.isCall && s.settlementPrice > s.strike) {
            intrinsic = s.settlementPrice - s.strike;
        } else if (!s.isCall && s.strike > s.settlementPrice) {
            intrinsic = s.strike - s.settlementPrice;
        }

        uint256 payout = (intrinsic * balance) / 1e18;

        // Burn first, then pay — prevents double-claim (checks-effects-interactions)
        optionSeries.burn(seriesId, msg.sender, balance);

        if (payout > 0) {
            vault.paySettlement(s.quoteAsset, msg.sender, payout, seriesId);
        }
    }

    // ─── View: quote premium ──────────────────────────────────────────────────

    /// @notice Get a premium quote without executing a purchase.
    ///         Useful for frontends to show pricing before the trader submits a swap.
    function quotePremium(
        PoolKey calldata key,
        uint256 strike,
        uint256 expiry,
        bool isCall,
        uint256 quantity
    ) external view returns (uint256 unitPremium, uint256 totalPremium, uint256 vol) {
        uint256 spot = _getSpotFromPool(key);
        vol = (volOracle.getVolatility() * IV_MULT_BPS) / 10_000;
        uint256 tte = expiry > block.timestamp ? expiry - block.timestamp : 0;
        unitPremium = BlackScholes.price(spot, strike, tte, vol, isCall);
        totalPremium = (unitPremium * quantity) / 1e18;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Reverts with InvalidHookData if the calldata is too short to be a valid OptionParams.
    ///      abi.encode(OptionParams) is always 160 bytes (5 × 32-byte slots).
    function _decodeParams(bytes calldata data) internal pure returns (OptionParams memory) {
        if (data.length < 160) revert InvalidHookData();
        return abi.decode(data, (OptionParams));
    }

    /// @dev Derive the current spot price from the pool's sqrtPriceX96.
    ///      Formula: spot = (sqrtPriceX96 / 2^96)^2 expressed in WAD (currency1 per currency0).
    ///      For a WETH/USDC pool: currency0=WETH, currency1=USDC → spot is USDC per WETH.
    ///      Falls back to $3,200 if the pool has not been initialized (demo/testnet safety net).
    function _getSpotFromPool(PoolKey calldata key) internal view returns (uint256 spot) {
        try this._readSqrtPrice(key) returns (uint160 sqrtPriceX96) {
            if (sqrtPriceX96 > 0) {
                // price_wad = (sqrtPriceX96)^2 / 2^192 * 1e18
                // Split into two shifts to avoid overflow: sq >> 192 then * 1e18
                uint256 sq = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
                spot = (sq * 1e18) >> 192;
            }
        } catch {
            // Pool not yet initialized or state read failed — use fallback for demo
            spot = 3200e18;
        }
        if (spot == 0) spot = 3200e18;
    }

    /// @dev External wrapper around StateLibrary.getSlot0 so we can try/catch it.
    ///      Cannot try/catch an internal call in Solidity — must be external.
    function _readSqrtPrice(PoolKey calldata key) external view returns (uint160) {
        PoolId pid = PoolId.wrap(keccak256(abi.encode(key)));
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, pid);
        return sqrtPriceX96;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update the Reactive Network cron address that is authorized to settle series
    function setReactiveCron(address _cron) external {
        require(msg.sender == owner, "only owner");
        reactiveCron = _cron;
    }

    /// @notice Update the protocol fee. Capped at 5% to protect traders.
    function setProtocolFee(uint256 _bps) external {
        require(msg.sender == owner, "only owner");
        require(_bps <= 500, "max 5%");
        protocolFeeBps = _bps;
    }

    /// @notice Withdraw accumulated protocol fees for a given token to an address
    function withdrawProtocolFees(address token, address to) external {
        require(msg.sender == owner, "only owner");
        uint256 amount = protocolFees[token];
        protocolFees[token] = 0;
        IERC20(token).safeTransfer(to, amount);
    }
}
