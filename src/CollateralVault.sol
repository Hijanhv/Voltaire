// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CollateralVault
/// @notice Option writers (LPs) deposit collateral here.
///         The hook draws from this vault to pay ITM settlements.
///         Writers earn premiums collected during option sales.
///
///         Yield-generating: idle collateral is tracked per-share,
///         and premiums are distributed pro-rata to depositors.
contract CollateralVault {
    using SafeERC20 for IERC20;

    // ─── Errors ───────────────────────────────────────────────────────────────
    error OnlyHook();
    error InsufficientBalance();
    error InsufficientCollateral();
    error ZeroAmount();
    error TransferFailed();

    // ─── Events ───────────────────────────────────────────────────────────────
    event Deposited(address indexed writer, address indexed token, uint256 amount, uint256 shares);
    event Withdrawn(address indexed writer, address indexed token, uint256 amount, uint256 shares);
    event PremiumDistributed(address indexed token, uint256 amount);
    event SettlementPaid(address indexed token, uint256 amount, uint256 seriesId);
    event UtilizationUpdated(address indexed token, uint256 utilized, uint256 total);

    // ─── Types ────────────────────────────────────────────────────────────────

    struct VaultState {
        uint256 totalShares; // total share units outstanding
        uint256 totalAssets; // total tokens in vault (collateral + accumulated premiums)
        uint256 utilizedAssets; // amount locked for open option series
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public hook;
    address public owner;

    // token → VaultState
    mapping(address => VaultState) public vaultState;
    // writer → token → shares
    mapping(address => mapping(address => uint256)) public writerShares;
    // seriesId → token → locked amount
    mapping(uint256 => mapping(address => uint256)) public seriesLock;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _hook) {
        hook = _hook;
        owner = msg.sender;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyHook() {
        if (msg.sender != hook) revert OnlyHook();
        _;
    }

    // ─── Writer functions ─────────────────────────────────────────────────────

    /// @notice Deposit collateral to underwrite options.
    ///         Depositor receives vault shares proportional to their contribution.
    function deposit(address token, uint256 amount) external returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        VaultState storage v = vaultState[token];
        if (v.totalShares == 0 || v.totalAssets == 0) {
            shares = amount; // 1:1 on first deposit
        } else {
            shares = (amount * v.totalShares) / v.totalAssets;
        }
        v.totalShares += shares;
        v.totalAssets += amount;
        writerShares[msg.sender][token] += shares;

        emit Deposited(msg.sender, token, amount, shares);
    }

    /// @notice Withdraw collateral and accrued premiums.
    function withdraw(address token, uint256 shares) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        VaultState storage v = vaultState[token];
        uint256 userShares = writerShares[msg.sender][token];
        if (userShares < shares) revert InsufficientBalance();

        amount = (shares * v.totalAssets) / v.totalShares;

        // Check available (non-utilized) liquidity
        uint256 available = v.totalAssets - v.utilizedAssets;
        if (amount > available) revert InsufficientCollateral();

        v.totalShares -= shares;
        v.totalAssets -= amount;
        writerShares[msg.sender][token] -= shares;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount, shares);
    }

    // ─── Hook functions ───────────────────────────────────────────────────────

    /// @notice Receive premium from an option sale and distribute to writers.
    ///         Premium is added to totalAssets (increasing share value).
    function receivePremium(address token, uint256 amount) external onlyHook {
        // Premium stays in vault, increasing NAV per share
        vaultState[token].totalAssets += amount;
        emit PremiumDistributed(token, amount);
    }

    /// @notice Lock collateral when a new option series is opened.
    ///         Prevents over-utilization.
    function lockCollateral(uint256 seriesId, address token, uint256 amount) external onlyHook {
        VaultState storage v = vaultState[token];
        uint256 available = v.totalAssets - v.utilizedAssets;
        if (amount > available) revert InsufficientCollateral();
        v.utilizedAssets += amount;
        seriesLock[seriesId][token] += amount;
        emit UtilizationUpdated(token, v.utilizedAssets, v.totalAssets);
    }

    /// @notice Unlock collateral when a series expires OTM.
    function unlockCollateral(uint256 seriesId, address token) external onlyHook {
        uint256 locked = seriesLock[seriesId][token];
        if (locked == 0) return;
        vaultState[token].utilizedAssets -= locked;
        seriesLock[seriesId][token] = 0;
        emit UtilizationUpdated(
            token, vaultState[token].utilizedAssets, vaultState[token].totalAssets
        );
    }

    /// @notice Pay settlement to an ITM option holder.
    ///         Called by hook after Reactive cron triggers exercise.
    function paySettlement(address token, address recipient, uint256 amount, uint256 seriesId)
        external
        onlyHook
    {
        VaultState storage v = vaultState[token];
        uint256 locked = seriesLock[seriesId][token];

        // Reduce locked and total assets
        uint256 deduct = amount < locked ? amount : locked;
        v.utilizedAssets -= deduct;
        v.totalAssets = v.totalAssets > amount ? v.totalAssets - amount : 0;
        seriesLock[seriesId][token] -= deduct;

        IERC20(token).safeTransfer(recipient, amount);
        emit SettlementPaid(token, amount, seriesId);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Total collateral deposited (excludes premiums to show clean TVL)
    function totalCollateral(address token) external view returns (uint256) {
        return vaultState[token].totalAssets;
    }

    /// @notice Vault utilization ratio (WAD)
    function utilizationRatio(address token) external view returns (uint256) {
        VaultState storage v = vaultState[token];
        if (v.totalAssets == 0) return 0;
        return (v.utilizedAssets * 1e18) / v.totalAssets;
    }

    /// @notice Current value of a writer's position (collateral + earned premiums)
    function positionValue(address writer, address token) external view returns (uint256) {
        VaultState storage v = vaultState[token];
        uint256 shares = writerShares[writer][token];
        if (v.totalShares == 0) return 0;
        return (shares * v.totalAssets) / v.totalShares;
    }

    /// @notice Available (non-utilized) liquidity
    function availableLiquidity(address token) external view returns (uint256) {
        VaultState storage v = vaultState[token];
        return v.totalAssets > v.utilizedAssets ? v.totalAssets - v.utilizedAssets : 0;
    }

    /// @notice Reduce the lock for a series by a specific amount (used when excess collateral
    ///         is freed after ITM settlement — actual claim needs are less than max locked).
    function reduceSeriesLock(uint256 seriesId, address token, uint256 amount) external onlyHook {
        uint256 locked = seriesLock[seriesId][token];
        uint256 deduct = amount < locked ? amount : locked;
        if (deduct == 0) return;
        vaultState[token].utilizedAssets -= deduct;
        seriesLock[seriesId][token] -= deduct;
        emit UtilizationUpdated(
            token, vaultState[token].utilizedAssets, vaultState[token].totalAssets
        );
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setHook(address _hook) external {
        require(msg.sender == owner, "only owner");
        require(_hook != address(0), "zero address");
        hook = _hook;
    }

    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "only owner");
        require(_newOwner != address(0), "zero address");
        owner = _newOwner;
    }
}
