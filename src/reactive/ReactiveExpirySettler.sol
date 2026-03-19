// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReactive, ISubscriptionService} from "./IReactive.sol";

/// @title ReactiveExpirySettler
/// @notice Reactive Smart Contract (RSC) deployed on Reactive Network.
///
///         WHAT IT DOES:
///         1. Subscribes to SeriesCreated events from OptionSeries on Unichain
///         2. Tracks each series expiry timestamp
///         3. When block.timestamp >= expiry, emits a Callback to call
///            settleExpiredSeries() on OptionsHook on Unichain
///         4. Also subscribes to Uniswap V3 Swap on Ethereum to read
///            cross-chain TWAP spot price at expiry for settlement
///
///         DEPLOYMENT:
///         Deploy this contract on Reactive Network.
///         Set OPTIONS_HOOK and OPTION_SERIES to Voltaire addresses on Unichain.
contract ReactiveExpirySettler is IReactive {
    // ─── Reactive Network constants ───────────────────────────────────────────

    address private constant SUBSCRIPTION_SERVICE = 0x0000000000000000000000000000000000fffFfF;

    // ─── Source chain: Unichain ───────────────────────────────────────────────

    /// @dev Unichain chain ID (mainnet=130, testnet=1301)
    uint256 public immutable unichainId;

    /// @dev SeriesCreated(uint256 indexed seriesId, address indexed optionToken,
    ///                    address underlying, uint256 strike, uint256 expiry, bool isCall)
    // keccak256("SeriesCreated(uint256,address,address,uint256,uint256,bool)")
    uint256 private constant SERIES_CREATED_TOPIC =
        0x951a4eed933835e79958d7f70f0655d994f796ed4601180cf93ab5d135c19397;

    /// @dev Uniswap V3 Swap on Ethereum for spot price reads
    uint256 private constant CHAIN_ETHEREUM = 1;
    address private constant ETH_USDC_ETHEREUM = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;
    uint256 private constant UNISWAP_V3_SWAP_TOPIC =
        0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67;

    // ─── Destination: Unichain ────────────────────────────────────────────────

    uint64 private constant CALLBACK_GAS = 300_000;

    // ─── Voltaire contracts (on Unichain) ─────────────────────────────────────

    address public immutable optionsHook;
    address public immutable optionSeries;

    // ─── Series tracking ─────────────────────────────────────────────────────

    struct SeriesInfo {
        uint256 expiry;
        bool settled;
    }

    mapping(uint256 => SeriesInfo) public series;
    uint256[] public pendingSeriesIds;

    /// @dev Latest spot price from Ethereum Uniswap V3 (WAD)
    uint256 public latestSpotPrice;

    // ─── Owner ────────────────────────────────────────────────────────────────

    address public owner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event SettlementTriggered(uint256 indexed seriesId, uint256 spotPrice, uint256 timestamp);

    // ─── Constructor ──────────────────────────────────────────────────────────

    receive() external payable {}

    constructor(address _optionsHook, address _optionSeries, uint256 _unichainId) payable {
        optionsHook = _optionsHook;
        optionSeries = _optionSeries;
        unichainId = _unichainId;
        owner = msg.sender;
    }

    /// @notice Subscribe to all source chain events.
    ///         Must be called after deployment (requires on-chain precompile at 0xfffFfF).
    function subscribeAll() external {
        require(msg.sender == owner, "only owner");
        // Subscribe to SeriesCreated events from OptionSeries on Unichain
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(unichainId, optionSeries, SERIES_CREATED_TOPIC, 0, 0, 0);
        // Subscribe to Uniswap V3 Swap on Ethereum for live spot price
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(CHAIN_ETHEREUM, ETH_USDC_ETHEREUM, UNISWAP_V3_SWAP_TOPIC, 0, 0, 0);
    }

    // ─── IReactive ────────────────────────────────────────────────────────────

    /// @inheritdoc IReactive
    /// @dev Two event types are handled:
    ///      1. SeriesCreated from Unichain — register series + expiry
    ///      2. Uniswap V3 Swap from Ethereum — update spot price + check expirations
    function react(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256, /* topic_2 */
        uint256, /* topic_3 */
        bytes calldata data,
        uint256, /* block_number */
        uint256 /* op_code */
    ) external override {
        if (chain_id == unichainId && _contract == optionSeries) {
            // SeriesCreated event — register the new series
            _handleSeriesCreated(topic_1, data);
        } else if (chain_id == CHAIN_ETHEREUM && topic_0 == UNISWAP_V3_SWAP_TOPIC) {
            // Swap event — update spot price and check for expired series
            _handleSwap(data);
        }
    }

    // ─── Internal handlers ────────────────────────────────────────────────────

    /// @dev Register a new series from SeriesCreated event.
    ///      topic_1 = seriesId (indexed)
    ///      data contains (underlying, strike, expiry, isCall)
    function _handleSeriesCreated(uint256 seriesId, bytes calldata data) internal {
        // Decode: SeriesCreated non-indexed fields = (address underlying, uint256 strike, uint256 expiry, bool isCall)
        (, uint256 strike, uint256 expiry,) = abi.decode(data, (address, uint256, uint256, bool));
        if (expiry == 0 || strike == 0) return;

        series[seriesId] = SeriesInfo({expiry: expiry, settled: false});
        pendingSeriesIds.push(seriesId);
    }

    /// @dev Update spot price from Uniswap V3 Swap event and trigger settlements.
    function _handleSwap(bytes calldata data) internal {
        (,,,, uint160 sqrtPriceX96,,) =
            abi.decode(data, (address, address, int256, int256, uint160, uint128, int24));

        if (sqrtPriceX96 == 0) return;

        // Update spot price
        uint256 sq = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 spotWad = (sq * 1e18) >> 192;
        if (spotWad > 0) latestSpotPrice = spotWad;

        // Check all pending series for expiry
        _checkAndSettleExpired();
    }

    /// @dev Iterate pending series and emit settlement callbacks for expired ones.
    ///      Uses swap-and-pop to remove settled entries, keeping the array bounded.
    function _checkAndSettleExpired() internal {
        if (latestSpotPrice == 0) return;

        uint256 i = 0;
        while (i < pendingSeriesIds.length) {
            uint256 sid = pendingSeriesIds[i];
            SeriesInfo storage s = series[sid];

            // Remove already-settled or invalid entries
            if (s.settled || s.expiry == 0) {
                _swapAndPop(i);
                continue; // re-check swapped element at same index
            }

            if (block.timestamp >= s.expiry) {
                // Mark settled and remove from pending array
                s.settled = true;
                _swapAndPop(i);

                // Emit Callback — Reactive Network relays this to Unichain
                emit Callback(
                    unichainId,
                    optionsHook,
                    CALLBACK_GAS,
                    abi.encodeWithSignature(
                        "settleExpiredSeries(uint256,uint256)", sid, latestSpotPrice
                    )
                );
                emit SettlementTriggered(sid, latestSpotPrice, block.timestamp);
                continue; // re-check swapped element at same index
            }

            i++;
        }
    }

    /// @dev Remove element at index i via swap-with-last and pop. O(1).
    function _swapAndPop(uint256 i) internal {
        uint256 last = pendingSeriesIds.length - 1;
        if (i != last) {
            pendingSeriesIds[i] = pendingSeriesIds[last];
        }
        pendingSeriesIds.pop();
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Manually trigger settlement for a specific series (emergency use).
    function manualSettle(uint256 seriesId, uint256 spotPrice) external {
        require(msg.sender == owner, "only owner");
        require(!series[seriesId].settled, "already settled");
        require(block.timestamp >= series[seriesId].expiry, "not expired");

        series[seriesId].settled = true;

        emit Callback(
            unichainId,
            optionsHook,
            CALLBACK_GAS,
            abi.encodeWithSignature("settleExpiredSeries(uint256,uint256)", seriesId, spotPrice)
        );
    }

    /// @notice Register a series manually (for series created before this RSC was deployed).
    function registerSeries(uint256 seriesId, uint256 expiry) external {
        require(msg.sender == owner, "only owner");
        series[seriesId] = SeriesInfo({expiry: expiry, settled: false});
        pendingSeriesIds.push(seriesId);
    }

    /// @notice Returns count of pending (unsettled) series.
    function pendingCount() external view returns (uint256) {
        return pendingSeriesIds.length;
    }
}
