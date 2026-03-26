// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OptionSeriesTest is Test {
    OptionSeries registry;

    address hook = makeAddr("hook");
    address stranger = makeAddr("stranger");
    address underlying = makeAddr("weth");
    address quoteAsset = makeAddr("usdc");
    address trader = makeAddr("trader");

    uint256 constant STRIKE = 3000e18;
    uint256 constant WAD = 1e18;

    uint256 expiry;

    function setUp() public {
        registry = new OptionSeries(hook);
        expiry = block.timestamp + 30 days;
    }

    // ─── Constructor ───────────────────────────────────────────────────────

    function test_hook_address_set() public view {
        assertEq(registry.hook(), hook);
    }

    function test_next_series_id_starts_at_zero() public view {
        assertEq(registry.nextSeriesId(), 0);
    }

    // ─── createSeries ─────────────────────────────────────────────────────

    function test_create_series_only_hook() public {
        vm.prank(stranger);
        vm.expectRevert(OptionSeries.OnlyHook.selector);
        registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
    }

    function test_create_series_returns_id_and_token() public {
        vm.prank(hook);
        (uint256 id, address token) =
            registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);

        assertEq(id, 0, "first series has id 0");
        assertTrue(token != address(0), "option token deployed");
    }

    function test_create_series_increments_id() public {
        vm.startPrank(hook);
        (uint256 id0,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        (uint256 id1,) =
            registry.createSeries(underlying, quoteAsset, STRIKE + 500e18, expiry, true);
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_create_series_stores_data() public {
        vm.prank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);

        OptionSeries.Series memory s = registry.getSeries(id);
        assertEq(s.underlying, underlying);
        assertEq(s.quoteAsset, quoteAsset);
        assertEq(s.strike, STRIKE);
        assertEq(s.expiry, expiry);
        assertTrue(s.isCall);
        assertFalse(s.settled);
        assertEq(s.settlementPrice, 0);
        assertTrue(s.optionToken != address(0));
    }

    function test_create_series_reverts_past_expiry() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(hook);
        vm.expectRevert(OptionSeries.ExpiryInPast.selector);
        registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
    }

    function test_create_duplicate_series_reverts() public {
        vm.startPrank(hook);
        registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        vm.expectRevert(OptionSeries.SeriesAlreadyExists.selector);
        registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        vm.stopPrank();
    }

    function test_create_series_emits_event() public {
        vm.prank(hook);
        vm.expectEmit(true, false, false, true);
        emit OptionSeries.SeriesCreated(0, address(0), underlying, STRIKE, expiry, true);
        registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
    }

    // ─── getSeriesId ───────────────────────────────────────────────────────

    function test_get_series_id_not_found_returns_max() public view {
        uint256 id = registry.getSeriesId(underlying, quoteAsset, STRIKE, expiry, true);
        assertEq(id, type(uint256).max, "not found returns max");
    }

    function test_get_series_id_found_after_create() public {
        vm.prank(hook);
        (uint256 created,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);

        uint256 found = registry.getSeriesId(underlying, quoteAsset, STRIKE, expiry, true);
        assertEq(found, created);
    }

    function test_get_series_id_differentiates_call_put() public {
        vm.startPrank(hook);
        (uint256 callId,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        (uint256 putId,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, false);
        vm.stopPrank();

        assertNotEq(callId, putId);
        assertEq(registry.getSeriesId(underlying, quoteAsset, STRIKE, expiry, true), callId);
        assertEq(registry.getSeriesId(underlying, quoteAsset, STRIKE, expiry, false), putId);
    }

    // ─── mint / burn ───────────────────────────────────────────────────────

    function test_mint_only_hook() public {
        vm.prank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);

        vm.prank(stranger);
        vm.expectRevert(OptionSeries.OnlyHook.selector);
        registry.mint(id, trader, WAD);
    }

    function test_mint_increases_balance() public {
        vm.startPrank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        registry.mint(id, trader, 5 * WAD);
        vm.stopPrank();

        address token = registry.getOptionToken(id);
        assertEq(IERC20(token).balanceOf(trader), 5 * WAD);
    }

    function test_burn_decreases_balance() public {
        vm.startPrank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        registry.mint(id, trader, 5 * WAD);
        registry.burn(id, trader, 2 * WAD);
        vm.stopPrank();

        address token = registry.getOptionToken(id);
        assertEq(IERC20(token).balanceOf(trader), 3 * WAD);
    }

    function test_mint_reverts_series_not_found() public {
        vm.prank(hook);
        vm.expectRevert(OptionSeries.SeriesNotFound.selector);
        registry.mint(999, trader, WAD);
    }

    // ─── settleSeries ──────────────────────────────────────────────────────

    function test_settle_marks_settled_with_price() public {
        vm.startPrank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        registry.settleSeries(id, 3500e18);
        vm.stopPrank();

        OptionSeries.Series memory s = registry.getSeries(id);
        assertTrue(s.settled);
        assertEq(s.settlementPrice, 3500e18);
    }

    function test_settle_only_hook() public {
        vm.prank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);

        vm.prank(stranger);
        vm.expectRevert(OptionSeries.OnlyHook.selector);
        registry.settleSeries(id, 3500e18);
    }

    function test_settle_reverts_not_found() public {
        vm.prank(hook);
        vm.expectRevert(OptionSeries.SeriesNotFound.selector);
        registry.settleSeries(999, 3500e18);
    }

    // ─── isExpired ─────────────────────────────────────────────────────────

    function test_is_expired_false_before_expiry() public {
        vm.prank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        assertFalse(registry.isExpired(id));
    }

    function test_is_expired_true_after_expiry() public {
        vm.prank(hook);
        (uint256 id,) = registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        vm.warp(expiry);
        assertTrue(registry.isExpired(id));
    }

    // ─── Call vs Put separate series ───────────────────────────────────────

    function test_call_put_same_params_different_series() public {
        vm.startPrank(hook);
        (uint256 callId, address callToken) =
            registry.createSeries(underlying, quoteAsset, STRIKE, expiry, true);
        (uint256 putId, address putToken) =
            registry.createSeries(underlying, quoteAsset, STRIKE, expiry, false);
        vm.stopPrank();

        assertNotEq(callToken, putToken);
        assertNotEq(callId, putId);
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────────

    function testFuzz_create_unique_series_per_strike(uint256 strike) public {
        strike = bound(strike, 1e18, 100_000e18);
        vm.prank(hook);
        (uint256 id, address token) =
            registry.createSeries(underlying, quoteAsset, strike, expiry, true);

        assertEq(registry.getSeriesId(underlying, quoteAsset, strike, expiry, true), id);
        assertTrue(token != address(0));
    }
}
