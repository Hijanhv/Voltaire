// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReactive, ISubscriptionService} from "./IReactive.sol";

/// @title ReactiveVolatilityRelayer
/// @notice Reactive Smart Contract (RSC) deployed on Reactive Network.
///
///         WHAT IT DOES:
///         1. Subscribes to Uniswap V3 Swap events on 4 chains simultaneously:
///            Ethereum (1), Arbitrum (42161), Base (8453), BSC (56)
///         2. Tracks price samples to compute realized volatility (annualized)
///         3. Every N samples, emits a Callback to call updateVolatility()
///            on Voltaire's VolatilityOracle on Unichain
///
///         CHAIN WEIGHTS:
///         Ethereum 35% · Arbitrum 30% · Base 20% · BSC 15%
///
///         DEPLOYMENT:
///         Deploy this contract on Reactive Network.
///         Set VOLATILITY_ORACLE to Voltaire's VolatilityOracle on Unichain.
contract ReactiveVolatilityRelayer is IReactive {
    // ─── Reactive Network constants ───────────────────────────────────────────

    /// @dev Reactive Network subscription service (pre-deployed system contract)
    address private constant SUBSCRIPTION_SERVICE = 0x0000000000000000000000000000000000fffFfF;

    /// @dev Uniswap V3 Swap event: Swap(address,address,int256,int256,uint160,uint128,int24)
    uint256 private constant UNISWAP_V3_SWAP_TOPIC =
        0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67;

    // ─── Source chains ────────────────────────────────────────────────────────

    uint256 private constant CHAIN_ETHEREUM = 1;
    uint256 private constant CHAIN_ARBITRUM = 42_161;
    uint256 private constant CHAIN_BASE = 8453;
    uint256 private constant CHAIN_BSC = 56;

    /// @dev chainsMask bits: Ethereum=1, Arbitrum=2, Base=4, BSC=8
    uint256 private constant CHAINS_MASK = 0xF;

    // ─── Destination: Unichain ────────────────────────────────────────────────

    /// @dev Unichain chain ID (130 = mainnet, 1301 = Sepolia testnet)
    uint256 public immutable unichainId;

    /// @dev Gas limit for updateVolatility() call on Unichain
    uint64 private constant CALLBACK_GAS = 200_000;

    // ─── Voltaire contracts ───────────────────────────────────────────────────

    /// @notice Voltaire VolatilityOracle on Unichain — receives updateVolatility() calls
    address public immutable volatilityOracle;

    // ─── Volatility tracking ─────────────────────────────────────────────────

    /// @dev Price sample per chain [chainIndex][sampleIndex]
    ///      chainIndex: 0=Ethereum, 1=Arbitrum, 2=Base, 3=BSC
    mapping(uint256 => uint256[288]) private _priceSamples;
    mapping(uint256 => uint256) private _sampleCount;
    mapping(uint256 => uint256) private _lastPrice;

    /// @dev Chain weights in basis points (must sum to 10000)
    uint256[4] private _weights = [3500, 3000, 2000, 1500];

    /// @dev How many new samples to accumulate before pushing vol update
    uint256 private constant SAMPLES_PER_UPDATE = 12; // ~1 hour at 5min intervals

    /// @dev Total samples since last vol push
    uint256 private _samplesUntilUpdate;

    // ─── Owner ────────────────────────────────────────────────────────────────

    address public owner;

    // ─── Uniswap V3 pool addresses to subscribe to ────────────────────────────
    // ETH/USDC 0.05% pools (most liquid on each chain)

    address private constant ETH_USDC_ETHEREUM = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;
    address private constant ETH_USDC_ARBITRUM = 0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443;
    address private constant ETH_USDC_BASE = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address private constant ETH_USDC_BSC = 0x6fe9E9de56356F7eDBfcBB29FAB7cd69471a4869;

    // ─── Constructor ──────────────────────────────────────────────────────────

    receive() external payable {}

    constructor(address _volatilityOracle, uint256 _unichainId) payable {
        volatilityOracle = _volatilityOracle;
        unichainId = _unichainId;
        owner = msg.sender;
    }

    /// @notice Subscribe to all source chain Swap events.
    ///         Must be called after deployment (requires on-chain precompile at 0xfffFfF).
    function subscribeAll() external {
        require(msg.sender == owner, "only owner");
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(CHAIN_ETHEREUM, ETH_USDC_ETHEREUM, UNISWAP_V3_SWAP_TOPIC, 0, 0, 0);
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(CHAIN_ARBITRUM, ETH_USDC_ARBITRUM, UNISWAP_V3_SWAP_TOPIC, 0, 0, 0);
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(CHAIN_BASE, ETH_USDC_BASE, UNISWAP_V3_SWAP_TOPIC, 0, 0, 0);
        ISubscriptionService(SUBSCRIPTION_SERVICE)
            .subscribe(CHAIN_BSC, ETH_USDC_BSC, UNISWAP_V3_SWAP_TOPIC, 0, 0, 0);
    }

    // ─── IReactive ────────────────────────────────────────────────────────────

    /// @inheritdoc IReactive
    /// @dev Called by Reactive Network each time a subscribed Swap event fires.
    ///      Extracts sqrtPriceX96 from the swap event, derives spot price,
    ///      updates the sample buffer, and triggers a vol update if enough
    ///      samples have accumulated.
    function react(
        uint256 chain_id,
        address, /* _contract */
        uint256, /* topic_0 — already filtered to Swap */
        uint256, /* topic_1 — sender (indexed) */
        uint256, /* topic_2 — recipient (indexed) */
        uint256, /* topic_3 */
        bytes calldata data,
        uint256, /* block_number */
        uint256 /* op_code */
    ) external override {
        // Decode Uniswap V3 Swap event data:
        // Swap(address sender, address recipient,
        //      int256 amount0, int256 amount1,
        //      uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        (,,,, uint160 sqrtPriceX96,,) =
            abi.decode(data, (address, address, int256, int256, uint160, uint128, int24));

        if (sqrtPriceX96 == 0) return;

        // Derive spot price: price = (sqrtP / 2^96)^2 * 1e18
        uint256 spotWad = _sqrtToSpot(sqrtPriceX96);
        if (spotWad == 0) return;

        uint256 chainIdx = _chainIndex(chain_id);
        if (chainIdx == type(uint256).max) return;

        // Store sample and compute log return
        uint256 lastPrice = _lastPrice[chainIdx];
        if (lastPrice > 0 && spotWad > 0) {
            uint256 sampleSlot = _sampleCount[chainIdx] % 288;
            // Store log return * 1e18 approximation: |ln(p1/p0)| ≈ |p1-p0|/p0
            uint256 logReturn = spotWad > lastPrice
                ? ((spotWad - lastPrice) * 1e18) / lastPrice
                : ((lastPrice - spotWad) * 1e18) / lastPrice;
            _priceSamples[chainIdx][sampleSlot] = logReturn;
            _sampleCount[chainIdx]++;
        }
        _lastPrice[chainIdx] = spotWad;

        // Increment global update counter
        _samplesUntilUpdate++;

        // Push vol update every SAMPLES_PER_UPDATE samples
        if (_samplesUntilUpdate >= SAMPLES_PER_UPDATE) {
            _samplesUntilUpdate = 0;
            _pushVolatilityUpdate();
        }
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Compute cross-chain weighted volatility and emit Callback to Unichain.
    function _pushVolatilityUpdate() internal {
        uint256 weightedVolWad = _computeWeightedVol();
        if (weightedVolWad == 0) return;

        uint256 totalSamples = _sampleCount[0] + _sampleCount[1] + _sampleCount[2] + _sampleCount[3];

        // Emit Callback — Reactive Network relays this as a call to Unichain
        emit Callback(
            unichainId,
            volatilityOracle,
            CALLBACK_GAS,
            abi.encodeWithSignature(
                "updateVolatility(uint256,uint256,uint256)",
                weightedVolWad,
                CHAINS_MASK,
                totalSamples
            )
        );
    }

    /// @dev Compute weighted realized annualized volatility across all 4 chains.
    ///      σ_annualized = σ_5min * sqrt(365 * 24 * 12) = σ_5min * sqrt(105120)
    function _computeWeightedVol() internal view returns (uint256 weightedVol) {
        uint256 totalWeight;
        for (uint256 c = 0; c < 4; c++) {
            uint256 n = _sampleCount[c] < 288 ? _sampleCount[c] : 288;
            if (n < 2) continue;

            // Compute mean of log returns
            uint256 sum;
            for (uint256 i = 0; i < n; i++) {
                sum += _priceSamples[c][i];
            }
            uint256 mean = sum / n;

            // Compute variance
            uint256 variance;
            for (uint256 i = 0; i < n; i++) {
                uint256 diff = _priceSamples[c][i] > mean
                    ? _priceSamples[c][i] - mean
                    : mean - _priceSamples[c][i];
                variance += (diff * diff) / 1e18;
            }
            variance = variance / n;

            // Annualize: σ_annual = sqrt(variance * 105120) where 105120 = 365d * 24h * 12 samples/h
            uint256 annualized = _sqrt(variance * 105_120);

            weightedVol += (annualized * _weights[c]) / 10_000;
            totalWeight += _weights[c];
        }
        if (totalWeight == 0) return 0;
        weightedVol = (weightedVol * 10_000) / totalWeight;
    }

    /// @dev Map chain_id to array index.
    function _chainIndex(uint256 chain_id) internal pure returns (uint256) {
        if (chain_id == CHAIN_ETHEREUM) return 0;
        if (chain_id == CHAIN_ARBITRUM) return 1;
        if (chain_id == CHAIN_BASE) return 2;
        if (chain_id == CHAIN_BSC) return 3;
        return type(uint256).max;
    }

    /// @dev Derive WAD spot price from Uniswap V3 sqrtPriceX96.
    function _sqrtToSpot(uint160 sqrtPriceX96) internal pure returns (uint256) {
        uint256 sq = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        return (sq * 1e18) >> 192;
    }

    /// @dev Integer square root (Babylonian method).
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Manually trigger a vol push (for testing / emergency).
    function forcePushVolatility() external {
        require(msg.sender == owner, "only owner");
        _pushVolatilityUpdate();
    }
}
