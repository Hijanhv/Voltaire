// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {ImmutableState} from "@uniswap/v4-periphery/src/base/ImmutableState.sol";

/// @title BaseHook
/// @notice Abstract base for Uniswap V4 hooks. Matches the official Uniswap v4-hooks-public
///         pattern: each IHooks callback is split into two layers:
///           - external `beforeSwap(...)` — enforces onlyPoolManager, then delegates to
///           - internal `_beforeSwap(...)` — virtual, override this in your hook implementation
///
///         This separation guarantees subclasses can never accidentally bypass the pool manager
///         check, and keeps the access-control logic in one place.
///
///         poolManager + onlyPoolManager + NotPoolManager come from ImmutableState (v4-periphery).
///
///         Address validation: V4 encodes hook permissions in the deployed address's lower bits.
///         validateHookAddress is virtual so tests can override it with a no-op, allowing
///         deployment to arbitrary addresses without HookMiner. Production deployments must
///         use HookMiner + CREATE2 to land at an address with the correct permission bits.
abstract contract BaseHook is IHooks, ImmutableState {
    error HookNotImplemented();

    constructor(IPoolManager _manager) ImmutableState(_manager) {
        // Validates address(this) lower bits match getHookPermissions().
        // Test subclasses override validateHookAddress() to skip this check.
        validateHookAddress(this);
    }

    /// @notice Returns the hook permission flags. Must be overridden by each hook.
    function getHookPermissions() public pure virtual returns (Hooks.Permissions memory);

    /// @notice Validates the deployed hook address matches declared permissions.
    /// @dev    Virtual so test contracts can override with a no-op to deploy at any address.
    ///         See: https://github.com/Uniswap/v4-hooks-public/blob/main/src/base/BaseHook.sol
    function validateHookAddress(BaseHook _this) internal pure virtual {
        Hooks.validateHookPermissions(_this, getHookPermissions());
    }

    // ─── IHooks entry points ──────────────────────────────────────────────────
    // Each external function enforces onlyPoolManager and delegates to the
    // corresponding internal virtual function. Override only the _internal_ version.

    /// @inheritdoc IHooks
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        onlyPoolManager
        returns (bytes4)
    {
        return _beforeInitialize(sender, key, sqrtPriceX96);
    }

    function _beforeInitialize(address, PoolKey calldata, uint160)
        internal
        virtual
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick)
        external
        onlyPoolManager
        returns (bytes4)
    {
        return _afterInitialize(sender, key, sqrtPriceX96, tick);
    }

    function _afterInitialize(address, PoolKey calldata, uint160, int24)
        internal
        virtual
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4) {
        return _beforeAddLiquidity(sender, key, params, hookData);
    }

    function _beforeAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal virtual returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        return _afterAddLiquidity(sender, key, params, delta, feesAccrued, hookData);
    }

    function _afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) internal virtual returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4) {
        return _beforeRemoveLiquidity(sender, key, params, hookData);
    }

    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal virtual returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        return _afterRemoveLiquidity(sender, key, params, delta, feesAccrued, hookData);
    }

    function _afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) internal virtual returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        return _beforeSwap(sender, key, params, hookData);
    }

    function _beforeSwap(
        address,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) internal virtual returns (bytes4, BeforeSwapDelta, uint24) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, int128) {
        return _afterSwap(sender, key, params, delta, hookData);
    }

    function _afterSwap(
        address,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal virtual returns (bytes4, int128) {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function beforeDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4) {
        return _beforeDonate(sender, key, amount0, amount1, hookData);
    }

    function _beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        internal
        virtual
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    /// @inheritdoc IHooks
    function afterDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4) {
        return _afterDonate(sender, key, amount0, amount1, hookData);
    }

    function _afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        internal
        virtual
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
