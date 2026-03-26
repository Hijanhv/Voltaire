// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
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
///         1. Trader calls swap with hookData encoding (strike, expiry, isCall, qty)
///         2. beforeSwap intercepts, prices option via Black-Scholes + VolatilityOracle
///         3. Premium is taken from trader via BeforeSwapDelta
///         4. OptionToken is minted to trader
///         5. At expiry, Reactive Network cron calls settleExpiredSeries()
///
///         MEV tax on Unichain: options arb captured via hook fees, improving protocol sustainability.
contract OptionsHook is BaseHook {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    // ─── Errors ───────────────────────────────────────────────────────────────
    error InsufficientVaultLiquidity();
    error SeriesAlreadySettled();
    error SeriesNotExpired();
    error OnlyReactiveCron();
    error InvalidHookData();
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

    /// @notice hookData schema for option purchase swaps
    struct OptionParams {
        uint256 strike; // strike price in WAD
        uint256 expiry; // unix timestamp of expiry
        bool isCall; // true = call, false = put
        uint256 quantity; // number of option contracts (WAD = 1 contract)
        uint256 maxPremium; // slippage guard: max premium willing to pay (WAD)
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    VolatilityOracle public immutable volOracle;
    OptionSeries public immutable optionSeries;
    CollateralVault public immutable vault;

    address public owner;
    address public reactiveCron; // Reactive Network automated settler

    /// @notice Protocol fee taken from each premium (in bps, default 30 = 0.3%)
    uint256 public protocolFeeBps = 30;
    /// @dev IV premium multiplier applied to realized vol before pricing (1.15x = 11500 bps).
    ///      Bridges the ~15% gap between realized vol and implied vol observed in the market.
    uint256 private constant IV_MULT_BPS = 11_500;
    /// @notice Collected protocol fees per token
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
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── BaseHook: beforeSwap ─────────────────────────────────────────────────

    /// @inheritdoc BaseHook
    /// @dev Intercepts swaps with hookData to sell options instead of AMM swaps.
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata, /* params */
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        if (hookData.length == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 totalPremium = _processOptionSwap(sender, key, hookData);

        BeforeSwapDelta delta = toBeforeSwapDelta(int128(int256(totalPremium)), 0);
        return (IHooks.beforeSwap.selector, delta, 0);
    }

    /// @dev Extracted to avoid stack-too-deep in beforeSwap.
    function _processOptionSwap(address sender, PoolKey calldata key, bytes calldata hookData)
        internal
        returns (uint256 totalPremium)
    {
        OptionParams memory p = _decodeParams(hookData);
        address quoteToken = Currency.unwrap(key.currency1);
        address underlying = Currency.unwrap(key.currency0);

        uint256 spot = _getSpotFromPool(key);
        // Apply IV premium: scale realized vol by 1.15x to approximate implied vol
        uint256 vol = (volOracle.getVolatility() * IV_MULT_BPS) / 10_000;
        uint256 tte = p.expiry > block.timestamp ? p.expiry - block.timestamp : 0;

        uint256 unitPremium = BlackScholes.price(spot, p.strike, tte, vol, p.isCall);
        totalPremium = (unitPremium * p.quantity) / 1e18;
        if (totalPremium > p.maxPremium) revert PremiumTooHigh();

        uint256 fee = (totalPremium * protocolFeeBps) / 10_000;

        // Collateral check
        uint256 maxPayout = p.isCall ? spot : p.strike;
        uint256 requiredCollateral = (maxPayout * p.quantity) / 1e18;
        if (vault.availableLiquidity(quoteToken) < requiredCollateral) {
            revert InsufficientVaultLiquidity();
        }

        // Get or create series
        uint256 seriesId =
            optionSeries.getSeriesId(underlying, quoteToken, p.strike, p.expiry, p.isCall);
        if (seriesId == type(uint256).max) {
            (seriesId,) =
                optionSeries.createSeries(underlying, quoteToken, p.strike, p.expiry, p.isCall);
        }

        vault.lockCollateral(seriesId, quoteToken, requiredCollateral);
        optionSeries.mint(seriesId, sender, p.quantity);

        protocolFees[quoteToken] += fee;
        vault.receivePremium(quoteToken, totalPremium - fee);

        emit OptionPurchased(sender, seriesId, p.quantity, totalPremium, vol);
        emit PriceQuoted(seriesId, spot, vol, unitPremium);
    }

    // ─── Settlement (called by Reactive Network cron) ─────────────────────────

    /// @notice Reactive Network cron triggers this at option expiry.
    ///         Computes intrinsic value and pays ITM option holders.
    /// @param seriesId   The series to settle
    /// @param spotPrice  Final spot price from cross-chain TWAP at expiry
    function settleExpiredSeries(uint256 seriesId, uint256 spotPrice) external {
        if (msg.sender != reactiveCron) revert OnlyReactiveCron();

        OptionSeries.Series memory s = optionSeries.getSeries(seriesId);
        if (s.settled) revert SeriesAlreadySettled();
        if (block.timestamp < s.expiry) revert SeriesNotExpired();

        // Compute intrinsic value per contract
        uint256 intrinsic;
        bool itm;
        if (s.isCall && spotPrice > s.strike) {
            intrinsic = spotPrice - s.strike;
            itm = true;
        } else if (!s.isCall && s.strike > spotPrice) {
            intrinsic = s.strike - spotPrice;
            itm = true;
        }

        // Mark settled
        optionSeries.settleSeries(seriesId, spotPrice);

        if (!itm) {
            // OTM: unlock collateral, writers keep everything
            vault.unlockCollateral(seriesId, s.quoteAsset);
            emit SeriesSettled(seriesId, spotPrice, false, 0);
            return;
        }

        // ITM: pay out intrinsic value per token held
        // Token holders must call claimSettlement() to pull funds
        // (or hook can iterate, but that's gas-intensive; pull model preferred)
        uint256 totalSupply = IERC20(s.optionToken).totalSupply();
        uint256 totalPayout = (intrinsic * totalSupply) / 1e18;

        emit SeriesSettled(seriesId, spotPrice, true, totalPayout);
    }

    /// @notice Option holders call this post-settlement to claim payout.
    ///         Burns their option tokens and pays intrinsic value.
    function claimSettlement(uint256 seriesId) external {
        OptionSeries.Series memory s = optionSeries.getSeries(seriesId);
        require(s.settled, "not settled");

        uint256 balance = IERC20(s.optionToken).balanceOf(msg.sender);
        require(balance > 0, "no options");

        uint256 intrinsic;
        if (s.isCall && s.settlementPrice > s.strike) {
            intrinsic = s.settlementPrice - s.strike;
        } else if (!s.isCall && s.strike > s.settlementPrice) {
            intrinsic = s.strike - s.settlementPrice;
        }

        uint256 payout = (intrinsic * balance) / 1e18;

        // Burn option tokens
        optionSeries.burn(seriesId, msg.sender, balance);

        // Pay from vault
        if (payout > 0) {
            vault.paySettlement(s.quoteAsset, msg.sender, payout, seriesId);
        }
    }

    // ─── View: quote premium ──────────────────────────────────────────────────

    /// @notice Get a premium quote without executing
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

    function _decodeParams(bytes calldata data) internal pure returns (OptionParams memory) {
        if (data.length < 160) revert InvalidHookData();
        return abi.decode(data, (OptionParams));
    }

    /// @dev Derive spot price from pool's sqrtPriceX96.
    ///      spot = (sqrtPriceX96 / 2^96)^2  (in currency1 per currency0)
    ///      For a WETH/USDC pool: currency0=WETH, currency1=USDC
    function _getSpotFromPool(PoolKey calldata key) internal view returns (uint256 spot) {
        // Read sqrtPriceX96 via StateLibrary — for hackathon we use a simplified approach
        // In production: use StateLibrary.getSqrtPriceX96(poolManager, key.toId())
        // Hardcoded demo price for hackathon UI: $3,200 ETH (overrideable via oracle)
        // Real implementation below:
        try this._readSqrtPrice(key) returns (uint160 sqrtPriceX96) {
            if (sqrtPriceX96 > 0) {
                // price = (sqrtPriceX96)^2 / 2^192 * 1e18
                // Use 96-bit fixed point: price_wad = sqrtP^2 >> 192 * 1e18
                uint256 sq = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
                spot = (sq * 1e18) >> 192;
            }
        } catch {
            spot = 3200e18; // fallback for demo
        }
        if (spot == 0) spot = 3200e18;
    }

    /// @dev External call wrapper so we can try/catch it.
    ///      Reads sqrtPriceX96 from the V4 PoolManager via StateLibrary.
    function _readSqrtPrice(PoolKey calldata key) external view returns (uint160) {
        PoolId pid = PoolId.wrap(keccak256(abi.encode(key)));
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, pid);
        return sqrtPriceX96;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setReactiveCron(address _cron) external {
        require(msg.sender == owner, "only owner");
        reactiveCron = _cron;
    }

    function setProtocolFee(uint256 _bps) external {
        require(msg.sender == owner, "only owner");
        require(_bps <= 500, "max 5%");
        protocolFeeBps = _bps;
    }

    function withdrawProtocolFees(address token, address to) external {
        require(msg.sender == owner, "only owner");
        uint256 amount = protocolFees[token];
        protocolFees[token] = 0;
        IERC20(token).safeTransfer(to, amount);
    }
}
