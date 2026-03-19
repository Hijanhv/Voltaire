// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {OptionsHook} from "../src/OptionsHook.sol";
import {VolatilityOracle} from "../src/VolatilityOracle.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {CollateralVault} from "../src/CollateralVault.sol";

/// @dev Minimal ERC20 with public mint for tests
contract TestToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Deploys OptionsHook at an address whose lower bits match the required permission flags.
///         Uniswap V4 requires BEFORE_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG in the address.
///         We use vm.etch to plant the bytecode at the correct address.
contract OptionsHookTest is Test {
    // Hook permission bits (from Hooks.sol)
    uint160 constant BEFORE_SWAP_FLAG = 1 << 7; // 0x80
    uint160 constant BEFORE_SWAP_RETURNS_DELTA_FLAG = 1 << 3; // 0x08
    uint160 constant HOOK_FLAGS = BEFORE_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG; // 0x88

    PoolManager poolManager;
    OptionsHook hook;
    VolatilityOracle volOracle;
    OptionSeries optionSeries;
    CollateralVault vault;
    TestToken weth;
    TestToken usdc;

    address deployer = makeAddr("deployer");
    address relayer = makeAddr("relayer");
    address reactiveCron = makeAddr("reactiveCron");
    address trader = makeAddr("trader");
    address lpProvider = makeAddr("lpProvider");

    PoolKey poolKey;

    uint256 constant WAD = 1e18;
    uint256 constant LARGE_COLLATERAL = 1_000_000 * WAD;

    function setUp() public {
        vm.startPrank(deployer);

        // Deploy PoolManager
        poolManager = new PoolManager(deployer);

        // Deploy tokens (currency0 < currency1 by address)
        weth = new TestToken("Wrapped Ether", "WETH");
        usdc = new TestToken("USD Coin", "USDC");

        // Sort so currency0 < currency1
        (address token0, address token1) = address(weth) < address(usdc)
            ? (address(weth), address(usdc))
            : (address(usdc), address(weth));

        // Deploy oracle
        volOracle = new VolatilityOracle(relayer);

        // Deploy hook at an address with correct permission bits
        // Use CREATE2-style: find address with flags set, deploy there via vm.etch
        OptionsHook hookImpl;
        {
            // Deploy to temp address first to get bytecode
            hookImpl = new OptionsHook(
                IPoolManager(address(poolManager)),
                volOracle,
                OptionSeries(address(0)), // placeholder
                CollateralVault(address(0)), // placeholder
                reactiveCron
            );
        }

        // Compute a hook address with the correct flags
        // Pattern: use an address with 0x88 in the lower byte
        address hookAddr = address(
            uint160(uint256(keccak256(abi.encode("voltaire.hook"))) & ~uint160(0xFF) | HOOK_FLAGS)
        );

        // Plant hookImpl bytecode at hookAddr
        vm.etch(hookAddr, address(hookImpl).code);

        // Now deploy vault and series pointing to the real hook address
        vault = new CollateralVault(deployer); // temp hook = deployer
        optionSeries = new OptionSeries(deployer); // temp hook = deployer

        // Re-initialize hook at hookAddr with proper deps
        // Since we etched the code, we need to re-deploy properly.
        // Instead, deploy the hook normally (without address constraint for unit tests)
        // and test functions that don't require pool manager to enforce address bits.

        hook = new OptionsHook(
            IPoolManager(address(poolManager)), volOracle, optionSeries, vault, reactiveCron
        );

        // Wire up vault and series to the real hook
        vault.setHook(address(hook));
        // Redeploy series with real hook
        optionSeries = new OptionSeries(address(hook));

        // Re-create hook with final series (chicken-egg resolved in 2 steps like Deploy.s.sol)
        hook = new OptionsHook(
            IPoolManager(address(poolManager)), volOracle, optionSeries, vault, reactiveCron
        );
        vault.setHook(address(hook));

        // Pool key: currency0/currency1 pair, fee=3000, tickSpacing=60, hooks=hook
        poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        // Seed oracle with 70% vol
        vm.stopPrank();
        vm.prank(relayer);
        volOracle.updateVolatility(0.7e18, 0xF, 288);

        // Deposit collateral into vault so options can be sold
        usdc.mint(lpProvider, LARGE_COLLATERAL);
        vm.startPrank(lpProvider);
        usdc.approve(address(vault), LARGE_COLLATERAL);
        vault.deposit(address(usdc), LARGE_COLLATERAL);
        vm.stopPrank();

        // Mint USDC to trader (for premium payments)
        usdc.mint(trader, 100_000 * WAD);
    }

    // ─── getHookPermissions ────────────────────────────────────────────────

    function test_hook_permissions() public view {
        Hooks.Permissions memory perms = hook.getHookPermissions();
        assertTrue(perms.beforeSwap);
        assertTrue(perms.beforeSwapReturnDelta);
        assertFalse(perms.afterSwap);
        assertFalse(perms.beforeAddLiquidity);
        assertFalse(perms.afterAddLiquidity);
        assertFalse(perms.beforeInitialize);
        assertFalse(perms.afterInitialize);
    }

    // ─── beforeSwap: passthrough when no hookData ─────────────────────────

    function test_before_swap_no_hook_data_returns_zero_delta() public {
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        vm.prank(address(poolManager));
        (bytes4 selector, BeforeSwapDelta delta, uint24 fee) =
            hook.beforeSwap(trader, poolKey, params, "");

        assertEq(selector, IHooks.beforeSwap.selector);
        assertEq(BeforeSwapDelta.unwrap(delta), 0);
        assertEq(fee, 0);
    }

    // ─── beforeSwap: only pool manager can call ────────────────────────────

    function test_before_swap_reverts_non_pool_manager() public {
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        vm.prank(trader);
        vm.expectRevert(OptionsHook.OnlyPoolManager.selector);
        hook.beforeSwap(trader, poolKey, params, "");
    }

    // ─── quotePremium ──────────────────────────────────────────────────────

    function test_quote_premium_returns_nonzero() public view {
        uint256 strike = 3200e18;
        uint256 exp = block.timestamp + 30 days;

        (uint256 unitPremium, uint256 totalPremium, uint256 vol) =
            hook.quotePremium(poolKey, strike, exp, true, WAD);

        assertGt(unitPremium, 0, "unit premium > 0");
        assertEq(totalPremium, unitPremium, "1 contract: total = unit");
        // vol returned is oracle vol × 1.15 (IV premium multiplier)
        assertEq(vol, (0.7e18 * 11_500) / 10_000, "vol is IV-adjusted (1.15x oracle)");
    }

    function test_quote_premium_scales_with_quantity() public view {
        uint256 strike = 3200e18;
        uint256 exp = block.timestamp + 30 days;

        (, uint256 total1,) = hook.quotePremium(poolKey, strike, exp, true, WAD);
        (, uint256 total5,) = hook.quotePremium(poolKey, strike, exp, true, 5 * WAD);

        assertEq(total5, total1 * 5, "premium scales linearly with quantity");
    }

    function test_quote_put_vs_call_atm() public view {
        uint256 strike = 3200e18; // approximately ATM at demo spot
        uint256 exp = block.timestamp + 30 days;

        (uint256 callPremium,,) = hook.quotePremium(poolKey, strike, exp, true, WAD);
        (uint256 putPremium,,) = hook.quotePremium(poolKey, strike, exp, false, WAD);

        // Both should be positive for ATM options
        assertGt(callPremium, 0, "call premium > 0");
        assertGt(putPremium, 0, "put premium > 0");
    }

    function test_quote_expired_option_returns_intrinsic() public {
        uint256 strike = 3200e18;
        // Pass 0 TTE (already expired)
        (uint256 unitPremium,,) = hook.quotePremium(poolKey, strike, block.timestamp - 1, true, WAD);
        // At expiry: intrinsic = spot - strike. Demo spot = 3200, strike = 3200 → 0
        assertEq(unitPremium, 0, "expired ATM call has 0 intrinsic");
    }

    // ─── Settlement ────────────────────────────────────────────────────────

    function _createAndFundSeries(uint256 strike, bool isCall) internal returns (uint256 seriesId) {
        // Create series directly via the hook-only path by becoming the hook
        // In real flow, series are created via beforeSwap.
        // Here we directly call optionSeries as the hook for test setup.
        address hookAddr = address(hook);

        // Temporarily make this test contract act as hook
        vm.prank(deployer);
        vault.setHook(address(this));

        // Create series as "hook"
        (seriesId,) = optionSeries.createSeries(
            address(weth), address(usdc), strike, block.timestamp + 30 days, isCall
        );

        // Mint option tokens to trader
        optionSeries.mint(seriesId, trader, 2 * WAD);

        // Lock collateral
        uint256 maxPayout = isCall ? 3200e18 : strike;
        uint256 required = (maxPayout * 2 * WAD) / WAD;
        vault.lockCollateral(seriesId, address(usdc), required);

        // Restore hook
        vm.prank(deployer);
        vault.setHook(hookAddr);
    }

    function test_settle_reverts_non_reactive_cron() public {
        vm.prank(trader);
        vm.expectRevert(OptionsHook.OnlyReactiveCron.selector);
        hook.settleExpiredSeries(0, 3500e18);
    }

    function test_settle_reverts_not_expired() public {
        // Deploy series with test contract as hook so we can create a series without auth issues.
        // settleExpiredSeries only calls getSeries() (view, no auth) before hitting SeriesNotExpired —
        // the revert fires before reaching the onlyHook settleSeries() call.
        OptionSeries ourSeries = new OptionSeries(address(this));
        CollateralVault ourVault = new CollateralVault(address(this));
        OptionsHook ourHook = new OptionsHook(
            IPoolManager(address(poolManager)), volOracle, ourSeries, ourVault, reactiveCron
        );
        ourVault.setHook(address(ourHook));

        // Test contract is hook of ourSeries — create a series with future expiry
        (uint256 id,) = ourSeries.createSeries(
            address(weth), address(usdc), 3000e18, block.timestamp + 30 days, true
        );

        // settleExpiredSeries: reads series (view) → expiry in future → SeriesNotExpired
        vm.prank(reactiveCron);
        vm.expectRevert(OptionsHook.SeriesNotExpired.selector);
        ourHook.settleExpiredSeries(id, 3500e18);
    }

    // ─── claimSettlement ───────────────────────────────────────────────────

    function test_claim_settlement_reverts_not_settled() public {
        // Deploy series with test contract as hook so we can create a series without auth issues.
        // claimSettlement only calls getSeries() (view, no auth) then checks s.settled —
        // the revert fires before reaching any onlyHook function.
        OptionSeries ourSeries = new OptionSeries(address(this));
        CollateralVault ourVault = new CollateralVault(address(this));
        OptionsHook ourHook = new OptionsHook(
            IPoolManager(address(poolManager)), volOracle, ourSeries, ourVault, reactiveCron
        );
        ourVault.setHook(address(ourHook));

        // Test contract is hook of ourSeries — create an unsettled series
        (uint256 id,) = ourSeries.createSeries(
            address(weth), address(usdc), 3000e18, block.timestamp + 30 days, true
        );

        // claimSettlement: reads series (view) → settled==false → revert "not settled"
        vm.prank(trader);
        vm.expectRevert("not settled");
        ourHook.claimSettlement(id);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function test_set_reactive_cron_only_owner() public {
        address newCron = makeAddr("newCron");
        vm.prank(deployer);
        hook.setReactiveCron(newCron);
        assertEq(hook.reactiveCron(), newCron);
    }

    function test_set_reactive_cron_reverts_non_owner() public {
        vm.prank(trader);
        vm.expectRevert("only owner");
        hook.setReactiveCron(trader);
    }

    function test_set_protocol_fee_only_owner() public {
        vm.prank(deployer);
        hook.setProtocolFee(50); // 0.5%
        assertEq(hook.protocolFeeBps(), 50);
    }

    function test_set_protocol_fee_max_5pct() public {
        vm.prank(deployer);
        vm.expectRevert("max 5%");
        hook.setProtocolFee(501);
    }

    function test_set_protocol_fee_reverts_non_owner() public {
        vm.prank(trader);
        vm.expectRevert("only owner");
        hook.setProtocolFee(10);
    }

    function test_withdraw_protocol_fees() public {
        // Manually credit some fees
        // (In real flow, fees accumulate from premium collection via beforeSwap)
        // We'll just verify the function reverts for non-owner
        vm.prank(trader);
        vm.expectRevert("only owner");
        hook.withdrawProtocolFees(address(usdc), trader);
    }

    // ─── IHooks stubs ─────────────────────────────────────────────────────

    function test_before_initialize_returns_selector() public {
        uint160 sqrtPrice = 79228162514264337593543950336; // 1:1
        bytes4 sel = hook.beforeInitialize(address(0), poolKey, sqrtPrice);
        assertEq(sel, IHooks.beforeInitialize.selector);
    }

    function test_after_initialize_returns_selector() public {
        bytes4 sel = hook.afterInitialize(address(0), poolKey, 0, 0);
        assertEq(sel, IHooks.afterInitialize.selector);
    }

    function test_before_add_liquidity_returns_selector() public {
        IPoolManager.ModifyLiquidityParams memory p = IPoolManager.ModifyLiquidityParams({
            tickLower: -60, tickUpper: 60, liquidityDelta: 0, salt: 0
        });
        bytes4 sel = hook.beforeAddLiquidity(address(0), poolKey, p, "");
        assertEq(sel, IHooks.beforeAddLiquidity.selector);
    }

    function test_before_remove_liquidity_returns_selector() public {
        IPoolManager.ModifyLiquidityParams memory p = IPoolManager.ModifyLiquidityParams({
            tickLower: -60, tickUpper: 60, liquidityDelta: 0, salt: 0
        });
        bytes4 sel = hook.beforeRemoveLiquidity(address(0), poolKey, p, "");
        assertEq(sel, IHooks.beforeRemoveLiquidity.selector);
    }

    function test_after_swap_returns_selector_and_zero() public {
        IPoolManager.SwapParams memory p =
            IPoolManager.SwapParams({zeroForOne: true, amountSpecified: 0, sqrtPriceLimitX96: 0});
        BalanceDelta delta = BalanceDelta.wrap(0);
        (bytes4 sel, int128 hookDelta) = hook.afterSwap(address(0), poolKey, p, delta, "");
        assertEq(sel, IHooks.afterSwap.selector);
        assertEq(hookDelta, 0);
    }

    function test_before_donate_returns_selector() public {
        bytes4 sel = hook.beforeDonate(address(0), poolKey, 0, 0, "");
        assertEq(sel, IHooks.beforeDonate.selector);
    }

    function test_after_donate_returns_selector() public {
        bytes4 sel = hook.afterDonate(address(0), poolKey, 0, 0, "");
        assertEq(sel, IHooks.afterDonate.selector);
    }

    // ─── beforeSwap with hookData: option purchase simulation ─────────────

    function _encodeOptionParams(
        uint256 strike,
        uint256 exp,
        bool isCall,
        uint256 qty,
        uint256 maxPremium
    ) internal pure returns (bytes memory) {
        return abi.encode(
            OptionsHook.OptionParams({
                strike: strike, expiry: exp, isCall: isCall, quantity: qty, maxPremium: maxPremium
            })
        );
    }

    function test_before_swap_with_hook_data_requires_pool_manager() public {
        bytes memory data =
            _encodeOptionParams(3200e18, block.timestamp + 30 days, true, WAD, type(uint256).max);
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        // Only poolManager can call
        vm.prank(trader);
        vm.expectRevert(OptionsHook.OnlyPoolManager.selector);
        hook.beforeSwap(trader, poolKey, params, data);
    }

    function test_before_swap_invalid_hook_data_too_short_reverts() public {
        bytes memory shortData = new bytes(10); // < 160 bytes
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        vm.prank(address(poolManager));
        vm.expectRevert(OptionsHook.InvalidHookData.selector);
        hook.beforeSwap(trader, poolKey, params, shortData);
    }

    function test_before_swap_premium_too_high_reverts() public {
        bytes memory data = _encodeOptionParams(
            3200e18,
            block.timestamp + 30 days,
            true,
            WAD,
            1 // maxPremium = 1 wei — way too low
        );
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        vm.prank(address(poolManager));
        vm.expectRevert(OptionsHook.PremiumTooHigh.selector);
        hook.beforeSwap(trader, poolKey, params, data);
    }

    function test_before_swap_insufficient_vault_liquidity_reverts() public {
        // Empty the vault first
        vm.prank(deployer);
        vault.setHook(address(this));
        // Drain vault by locking all collateral
        (uint256 totalShares, uint256 totalAssets,) = vault.vaultState(address(usdc));
        if (totalAssets > 0) {
            vault.lockCollateral(9999, address(usdc), totalAssets);
        }
        vm.prank(deployer);
        vault.setHook(address(hook));

        bytes memory data =
            _encodeOptionParams(3200e18, block.timestamp + 30 days, true, WAD, type(uint256).max);
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 0
        });

        vm.prank(address(poolManager));
        vm.expectRevert(OptionsHook.InsufficientVaultLiquidity.selector);
        hook.beforeSwap(trader, poolKey, params, data);
    }
}
