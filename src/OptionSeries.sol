// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OptionToken} from "./OptionToken.sol";

/// @title OptionSeries
/// @notice Registry for all active option series (strike × expiry × call/put).
///         Each series gets a unique ID and a corresponding ERC20 OptionToken.
contract OptionSeries {
    // ─── Errors ───────────────────────────────────────────────────────────────
    error OnlyHook();
    error SeriesAlreadyExists();
    error SeriesNotFound();
    error ExpiryInPast();

    // ─── Events ───────────────────────────────────────────────────────────────
    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed optionToken,
        address underlying,
        uint256 strike,
        uint256 expiry,
        bool isCall
    );

    // ─── Types ────────────────────────────────────────────────────────────────

    struct Series {
        address underlying; // e.g. WETH
        address quoteAsset; // e.g. USDC
        uint256 strike; // in WAD (quoteAsset per underlying)
        uint256 expiry; // unix timestamp
        bool isCall;
        address optionToken; // ERC20 representing 1 option
        bool settled;
        uint256 settlementPrice; // final spot at expiry
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public hook;
    uint256 public nextSeriesId;
    mapping(uint256 => Series) public series;

    // Lookup: keccak(underlying, quoteAsset, strike, expiry, isCall) → seriesId+1 (0 = not exists)
    mapping(bytes32 => uint256) private _seriesIndex;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _hook) {
        hook = _hook;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyHook() {
        if (msg.sender != hook) revert OnlyHook();
        _;
    }

    // ─── Core functions ───────────────────────────────────────────────────────

    /// @notice Creates a new option series. Called by the hook on first purchase.
    function createSeries(
        address underlying,
        address quoteAsset,
        uint256 strike,
        uint256 expiry,
        bool isCall
    ) external onlyHook returns (uint256 seriesId, address optionToken) {
        if (expiry <= block.timestamp) revert ExpiryInPast();

        bytes32 key = _key(underlying, quoteAsset, strike, expiry, isCall);
        if (_seriesIndex[key] != 0) revert SeriesAlreadyExists();

        seriesId = nextSeriesId++;

        // Construct ticker, e.g. "ETH-4000-JUN25-C"
        string memory ticker = _buildTicker(underlying, strike, expiry, isCall);
        string memory name = string(abi.encodePacked("Voltaire Option: ", ticker));

        optionToken = address(new OptionToken(name, ticker, address(this)));

        series[seriesId] = Series({
            underlying: underlying,
            quoteAsset: quoteAsset,
            strike: strike,
            expiry: expiry,
            isCall: isCall,
            optionToken: optionToken,
            settled: false,
            settlementPrice: 0
        });

        _seriesIndex[key] = seriesId + 1;

        emit SeriesCreated(seriesId, optionToken, underlying, strike, expiry, isCall);
    }

    /// @notice Returns existing seriesId or type(uint256).max if not found
    function getSeriesId(
        address underlying,
        address quoteAsset,
        uint256 strike,
        uint256 expiry,
        bool isCall
    ) external view returns (uint256) {
        bytes32 key = _key(underlying, quoteAsset, strike, expiry, isCall);
        uint256 idx = _seriesIndex[key];
        return idx == 0 ? type(uint256).max : idx - 1;
    }

    /// @notice Mark a series as settled with the final price (called by hook after Reactive cron)
    function settleSeries(uint256 seriesId, uint256 settlementPrice) external onlyHook {
        Series storage s = series[seriesId];
        if (s.optionToken == address(0)) revert SeriesNotFound();
        s.settled = true;
        s.settlementPrice = settlementPrice;
    }

    /// @notice Mint option tokens (called by hook when a trade occurs)
    function mint(uint256 seriesId, address to, uint256 amount) external onlyHook {
        Series storage s = series[seriesId];
        if (s.optionToken == address(0)) revert SeriesNotFound();
        OptionToken(s.optionToken).mint(to, amount);
    }

    /// @notice Burn option tokens during settlement
    function burn(uint256 seriesId, address from, uint256 amount) external onlyHook {
        Series storage s = series[seriesId];
        if (s.optionToken == address(0)) revert SeriesNotFound();
        OptionToken(s.optionToken).burn(from, amount);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getSeries(uint256 seriesId) external view returns (Series memory) {
        return series[seriesId];
    }

    function isExpired(uint256 seriesId) external view returns (bool) {
        return block.timestamp >= series[seriesId].expiry;
    }

    function getOptionToken(uint256 seriesId) external view returns (address) {
        return series[seriesId].optionToken;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _key(
        address underlying,
        address quoteAsset,
        uint256 strike,
        uint256 expiry,
        bool isCall
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(underlying, quoteAsset, strike, expiry, isCall));
    }

    /// @dev Builds a human-readable ticker like "ETH-4000-JUN25-C"
    function _buildTicker(
        address, /* underlying — symbol lookup omitted for brevity */
        uint256 strike,
        uint256 expiry,
        bool isCall
    )
        internal
        pure
        returns (string memory)
    {
        string memory strikeStr = _uint2str(strike / 1e18);
        string memory expiryStr = _monthYear(expiry);
        string memory cp = isCall ? "C" : "P";
        return string(abi.encodePacked("ETH-", strikeStr, "-", expiryStr, "-", cp));
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 digits;
        while (tmp != 0) {
            digits++;
            tmp /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            buf[--digits] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buf);
    }

    function _monthYear(uint256 ts) internal pure returns (string memory) {
        // Simplified: return MMYY string
        uint256 secondsPerYear = 365 days;
        uint256 year = 1970 + ts / secondsPerYear;
        uint256 month = ((ts % secondsPerYear) * 12) / secondsPerYear + 1;
        string[12] memory months =
            ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        string memory yy = _uint2str(year % 100);
        return string(abi.encodePacked(months[month - 1], yy));
    }
}
