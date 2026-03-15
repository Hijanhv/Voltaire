// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title VolatilityOracle
/// @notice Stores the cross-chain realized volatility index pushed by Reactive Network.
///         Reactive Network aggregates TWAP prices from Ethereum, Arbitrum, Base, and BSC
///         to compute realized volatility, then calls `updateVolatility` on this contract.
contract VolatilityOracle {
    // ─── Errors ───────────────────────────────────────────────────────────────
    error OnlyReactive();
    error OnlyOwner();
    error StaleVolatility();
    error InvalidVolatility();

    // ─── Events ───────────────────────────────────────────────────────────────
    event VolatilityUpdated(
        uint256 indexed timestamp, uint256 volatility, uint256 chainsMask, uint256 sampleCount
    );
    event ReactiveRelayerSet(address indexed relayer);
    event StalenessThresholdSet(uint256 threshold);

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public owner;
    /// @notice The Reactive Network relayer authorised to push volatility
    address public reactiveRelayer;

    /// @notice Current annualised volatility in WAD (e.g. 0.8e18 = 80%)
    uint256 public volatility;
    /// @notice Timestamp of the last update
    uint256 public lastUpdated;
    /// @notice Bitmask of chains that contributed (1=Eth, 2=Arb, 4=Base, 8=BSC)
    uint256 public chainsMask;
    /// @notice Number of price samples used in the last computation
    uint256 public sampleCount;

    /// @notice Maximum age before volatility is considered stale (default 1 hour)
    uint256 public stalenessThreshold = 1 hours;

    /// @notice Rolling history of volatility observations (ring buffer, max 48 entries)
    uint256 public constant HISTORY_SIZE = 48;
    uint256[48] public history;
    uint256 public historyHead;

    // Chain identifiers
    uint256 public constant CHAIN_ETHEREUM = 1;
    uint256 public constant CHAIN_ARBITRUM = 2;
    uint256 public constant CHAIN_BASE = 4;
    uint256 public constant CHAIN_BSC = 8;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _reactiveRelayer) {
        owner = msg.sender;
        reactiveRelayer = _reactiveRelayer;
        // Seed with a reasonable default (70% annualised vol)
        volatility = 0.7e18;
        lastUpdated = block.timestamp;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyReactive() {
        if (msg.sender != reactiveRelayer) revert OnlyReactive();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Core functions ───────────────────────────────────────────────────────

    /// @notice Called by Reactive Network relayer to update the volatility index
    /// @param _volatility  New annualised volatility in WAD
    /// @param _chainsMask  Bitmask of chains included in this computation
    /// @param _sampleCount Number of price samples used
    function updateVolatility(uint256 _volatility, uint256 _chainsMask, uint256 _sampleCount)
        external
        onlyReactive
    {
        if (_volatility == 0 || _volatility > 5e18) revert InvalidVolatility(); // 0–500%

        volatility = _volatility;
        lastUpdated = block.timestamp;
        chainsMask = _chainsMask;
        sampleCount = _sampleCount;

        // Store in ring buffer
        history[historyHead % HISTORY_SIZE] = _volatility;
        historyHead++;

        emit VolatilityUpdated(block.timestamp, _volatility, _chainsMask, _sampleCount);
    }

    /// @notice Returns the current volatility; reverts if stale
    function getVolatility() external view returns (uint256) {
        if (block.timestamp - lastUpdated > stalenessThreshold) revert StaleVolatility();
        return volatility;
    }

    /// @notice Returns the current volatility without staleness check (for display)
    function getVolatilityUnsafe() external view returns (uint256 vol, uint256 age) {
        vol = volatility;
        age = block.timestamp - lastUpdated;
    }

    /// @notice Returns the last N observations from the ring buffer
    function getHistory(uint256 n) external view returns (uint256[] memory obs) {
        uint256 count = n < HISTORY_SIZE ? n : HISTORY_SIZE;
        obs = new uint256[](count);
        uint256 head = historyHead;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = (head + HISTORY_SIZE - 1 - i) % HISTORY_SIZE;
            obs[i] = history[idx];
        }
    }

    /// @notice Returns human-readable chain names for a bitmask
    function chainsInMask(uint256 mask) external pure returns (string memory) {
        bytes memory result;
        if (mask & CHAIN_ETHEREUM != 0) result = abi.encodePacked(result, "Ethereum,");
        if (mask & CHAIN_ARBITRUM != 0) result = abi.encodePacked(result, "Arbitrum,");
        if (mask & CHAIN_BASE != 0) result = abi.encodePacked(result, "Base,");
        if (mask & CHAIN_BSC != 0) result = abi.encodePacked(result, "BSC,");
        return string(result);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setReactiveRelayer(address _relayer) external onlyOwner {
        reactiveRelayer = _relayer;
        emit ReactiveRelayerSet(_relayer);
    }

    function setStalenessThreshold(uint256 _threshold) external onlyOwner {
        stalenessThreshold = _threshold;
        emit StalenessThresholdSet(_threshold);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        owner = _newOwner;
    }
}
