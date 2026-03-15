// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VolatilityOracle} from "../src/VolatilityOracle.sol";

contract VolatilityOracleTest is Test {
    VolatilityOracle oracle;

    address owner = makeAddr("owner");
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.prank(owner);
        oracle = new VolatilityOracle(relayer);
    }

    // ─── Constructor ───────────────────────────────────────────────────────

    function test_initial_state() public view {
        assertEq(oracle.owner(), owner);
        assertEq(oracle.reactiveRelayer(), relayer);
        assertEq(oracle.volatility(), 0.7e18);
        assertEq(oracle.stalenessThreshold(), 1 hours);
        assertEq(oracle.HISTORY_SIZE(), 48);
    }

    function test_seeded_vol_readable_immediately() public view {
        // Constructor seeds lastUpdated = block.timestamp, so not stale
        uint256 vol = oracle.getVolatility();
        assertEq(vol, 0.7e18);
    }

    // ─── updateVolatility: access control ─────────────────────────────────

    function test_update_reverts_non_relayer() public {
        vm.prank(stranger);
        vm.expectRevert(VolatilityOracle.OnlyReactive.selector);
        oracle.updateVolatility(0.8e18, 0xF, 100);
    }

    function test_update_reverts_zero_vol() public {
        vm.prank(relayer);
        vm.expectRevert(VolatilityOracle.InvalidVolatility.selector);
        oracle.updateVolatility(0, 0xF, 100);
    }

    function test_update_reverts_vol_above_500pct() public {
        vm.prank(relayer);
        vm.expectRevert(VolatilityOracle.InvalidVolatility.selector);
        oracle.updateVolatility(5e18 + 1, 0xF, 100);
    }

    function test_update_accepts_max_vol() public {
        vm.prank(relayer);
        oracle.updateVolatility(5e18, 0xF, 100); // 500% — boundary valid
        assertEq(oracle.volatility(), 5e18);
    }

    // ─── updateVolatility: state changes ──────────────────────────────────

    function test_update_stores_values() public {
        vm.prank(relayer);
        oracle.updateVolatility(0.9e18, 6, 200); // 6 = 0b0110 (Arbitrum + Base)

        assertEq(oracle.volatility(), 0.9e18);
        assertEq(oracle.chainsMask(), 6);
        assertEq(oracle.sampleCount(), 200);
        assertEq(oracle.lastUpdated(), block.timestamp);
    }

    function test_update_emits_event() public {
        vm.prank(relayer);
        vm.expectEmit(true, false, false, true);
        emit VolatilityOracle.VolatilityUpdated(block.timestamp, 0.8e18, 0xF, 288);
        oracle.updateVolatility(0.8e18, 0xF, 288);
    }

    // ─── Ring buffer ───────────────────────────────────────────────────────

    function test_ring_buffer_fills_sequentially() public {
        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(relayer);
            oracle.updateVolatility(i * 0.1e18, 0xF, 10);
        }
        uint256[] memory hist = oracle.getHistory(5);
        assertEq(hist.length, 5);
        // Most recent first
        assertEq(hist[0], 0.5e18);
        assertEq(hist[1], 0.4e18);
        assertEq(hist[2], 0.3e18);
    }

    function test_ring_buffer_wraps_at_48() public {
        // Fill 49 entries — first entry should be overwritten
        for (uint256 i = 1; i <= 49; i++) {
            vm.prank(relayer);
            oracle.updateVolatility(i * 0.01e18, 0xF, 1);
        }
        uint256[] memory hist = oracle.getHistory(48);
        assertEq(hist.length, 48);
        // Most recent is entry 49
        assertEq(hist[0], 49 * 0.01e18);
        // Entry 1 should be gone (overwritten by entry 49)
        for (uint256 i = 0; i < 48; i++) {
            assertGt(hist[i], 0, "no zero entries in full buffer");
        }
    }

    function test_get_history_clamps_to_history_size() public view {
        uint256[] memory hist = oracle.getHistory(100);
        assertEq(hist.length, 48);
    }

    // ─── getVolatility: staleness ──────────────────────────────────────────

    function test_stale_reverts_after_threshold() public {
        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(VolatilityOracle.StaleVolatility.selector);
        oracle.getVolatility();
    }

    function test_not_stale_at_threshold() public {
        vm.warp(block.timestamp + 1 hours);
        // Exactly at threshold: NOT stale (boundary: > threshold triggers, not >=)
        uint256 vol = oracle.getVolatility();
        assertEq(vol, 0.7e18);
    }

    function test_update_refreshes_staleness() public {
        vm.warp(block.timestamp + 1 hours + 1);
        // Update from relayer resets lastUpdated
        vm.prank(relayer);
        oracle.updateVolatility(0.65e18, 0xF, 50);
        // Now should be readable again
        assertEq(oracle.getVolatility(), 0.65e18);
    }

    // ─── getVolatilityUnsafe ───────────────────────────────────────────────

    function test_get_volatility_unsafe_no_revert_when_stale() public {
        vm.warp(block.timestamp + 99 hours);
        (uint256 vol, uint256 age) = oracle.getVolatilityUnsafe();
        assertEq(vol, 0.7e18);
        assertEq(age, 99 hours);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function test_set_relayer_only_owner() public {
        address newRelayer = makeAddr("newRelayer");
        vm.prank(owner);
        oracle.setReactiveRelayer(newRelayer);
        assertEq(oracle.reactiveRelayer(), newRelayer);
    }

    function test_set_relayer_reverts_non_owner() public {
        vm.prank(stranger);
        vm.expectRevert(VolatilityOracle.OnlyOwner.selector);
        oracle.setReactiveRelayer(stranger);
    }

    function test_set_staleness_threshold() public {
        vm.prank(owner);
        oracle.setStalenessThreshold(2 hours);
        assertEq(oracle.stalenessThreshold(), 2 hours);
    }

    function test_transfer_ownership() public {
        vm.prank(owner);
        oracle.transferOwnership(stranger);
        assertEq(oracle.owner(), stranger);
    }

    // ─── chainsInMask ─────────────────────────────────────────────────────

    function test_chains_in_mask_all() public view {
        string memory s = oracle.chainsInMask(0xF);
        assertTrue(bytes(s).length > 0);
    }

    function test_chains_in_mask_ethereum_only() public view {
        string memory s = oracle.chainsInMask(1);
        assertEq(s, "Ethereum,");
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────────

    function testFuzz_update_valid_vol(uint256 vol, uint256 mask, uint256 samples) public {
        vol = bound(vol, 1, 5e18);
        vm.prank(relayer);
        oracle.updateVolatility(vol, mask, samples);
        assertEq(oracle.volatility(), vol);
    }
}
