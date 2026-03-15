// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BlackScholes} from "../src/BlackScholes.sol";

/// @dev External harness so vm.expectRevert can catch library reverts
contract BSHarness {
    function price(uint256 spot, uint256 strike, uint256 expiry, uint256 vol, bool isCall)
        external
        pure
        returns (uint256)
    {
        return BlackScholes.price(spot, strike, expiry, vol, isCall);
    }
}

/// @notice Unit tests for the BlackScholes library
contract BlackScholesTest is Test {
    uint256 constant WAD = 1e18;

    BSHarness harness;

    function setUp() public {
        harness = new BSHarness();
    }

    // ─── Helper to call library (wrap in a harness) ────────────────────────

    function bsPrice(uint256 spot, uint256 strike, uint256 expiry, uint256 vol, bool isCall)
        internal
        view
        returns (uint256)
    {
        return harness.price(spot, strike, expiry, vol, isCall);
    }

    // ─── Intrinsic value at expiry ─────────────────────────────────────────

    function test_call_intrinsic_itm() public view {
        // Call ITM: spot=4000, strike=3000, expiry=0 → 1000
        uint256 p = bsPrice(4000e18, 3000e18, 0, 0.8e18, true);
        assertEq(p, 1000e18, "ITM call intrinsic");
    }

    function test_call_intrinsic_otm() public view {
        // Call OTM: spot=3000, strike=4000, expiry=0 → 0
        uint256 p = bsPrice(3000e18, 4000e18, 0, 0.8e18, true);
        assertEq(p, 0, "OTM call intrinsic");
    }

    function test_put_intrinsic_itm() public view {
        // Put ITM: spot=2500, strike=3000, expiry=0 → 500
        uint256 p = bsPrice(2500e18, 3000e18, 0, 0.8e18, false);
        assertEq(p, 500e18, "ITM put intrinsic");
    }

    function test_put_intrinsic_otm() public view {
        // Put OTM: spot=4000, strike=3000, expiry=0 → 0
        uint256 p = bsPrice(4000e18, 3000e18, 0, 0.8e18, false);
        assertEq(p, 0, "OTM put intrinsic");
    }

    function test_atm_intrinsic_call() public view {
        // ATM: spot == strike, expiry=0 → 0
        uint256 p = bsPrice(3000e18, 3000e18, 0, 0.8e18, true);
        assertEq(p, 0, "ATM call intrinsic");
    }

    // ─── Call price: monotonicity in spot ─────────────────────────────────

    function test_call_increases_with_spot() public view {
        uint256 expiry = 30 days;
        uint256 vol = 0.8e18;
        uint256 strike = 3000e18;

        uint256 p1 = bsPrice(2000e18, strike, expiry, vol, true);
        uint256 p2 = bsPrice(3000e18, strike, expiry, vol, true);
        uint256 p3 = bsPrice(4000e18, strike, expiry, vol, true);

        assertLt(p1, p2, "call price should increase with spot (1)");
        assertLt(p2, p3, "call price should increase with spot (2)");
    }

    // ─── Put price: monotonicity in spot ──────────────────────────────────

    function test_put_decreases_with_spot() public view {
        uint256 expiry = 30 days;
        uint256 vol = 0.8e18;
        uint256 strike = 3000e18;

        uint256 p1 = bsPrice(2000e18, strike, expiry, vol, false);
        uint256 p2 = bsPrice(3000e18, strike, expiry, vol, false);
        uint256 p3 = bsPrice(4000e18, strike, expiry, vol, false);

        assertGt(p1, p2, "put price should decrease with spot (1)");
        assertGt(p2, p3, "put price should decrease with spot (2)");
    }

    // ─── Option price increases with time to expiry (theta) ───────────────

    function test_call_increases_with_tte() public view {
        uint256 spot = 3000e18;
        uint256 strike = 3000e18;
        uint256 vol = 0.8e18;

        uint256 p1 = bsPrice(spot, strike, 7 days, vol, true);
        uint256 p2 = bsPrice(spot, strike, 30 days, vol, true);
        uint256 p3 = bsPrice(spot, strike, 90 days, vol, true);

        assertLt(p1, p2, "call price should increase with TTE (1)");
        assertLt(p2, p3, "call price should increase with TTE (2)");
    }

    // ─── Option price increases with volatility (vega) ────────────────────

    function test_call_increases_with_vol() public view {
        uint256 spot = 3000e18;
        uint256 strike = 3000e18;
        uint256 expiry = 30 days;

        uint256 p1 = bsPrice(spot, strike, expiry, 0.3e18, true);
        uint256 p2 = bsPrice(spot, strike, expiry, 0.7e18, true);
        uint256 p3 = bsPrice(spot, strike, expiry, 1.2e18, true);

        assertLt(p1, p2, "call price should increase with vol (1)");
        assertLt(p2, p3, "call price should increase with vol (2)");
    }

    // ─── Put-call parity (approximate): C - P ≈ S - K (no discounting) ───

    function test_put_call_parity_atm() public view {
        // For ATM no-discount model: C - P ≈ 0 at S=K
        uint256 spot = 3000e18;
        uint256 strike = 3000e18;
        uint256 expiry = 90 days;
        uint256 vol = 0.7e18;

        uint256 call = bsPrice(spot, strike, expiry, vol, true);
        uint256 put = bsPrice(spot, strike, expiry, vol, false);

        // ATM, no discount: C ≈ P (within 5%)
        uint256 diff = call > put ? call - put : put - call;
        assertLt(diff, call / 20, "ATM put-call parity within 5%");
    }

    function test_put_call_parity_itm_call() public view {
        // C - P should approximate S - K (no-discount)
        uint256 spot = 3500e18;
        uint256 strike = 3000e18;
        uint256 expiry = 90 days;
        uint256 vol = 0.7e18;

        uint256 call = bsPrice(spot, strike, expiry, vol, true);
        uint256 put = bsPrice(spot, strike, expiry, vol, false);

        // C - P ≈ S - K = 500e18 (approx, no discounting)
        uint256 parity = spot - strike; // 500e18
        uint256 diff = call > put ? call - put : put - call;
        uint256 parityDiff = diff > parity ? diff - parity : parity - diff;
        // Allow 10% tolerance
        assertLt(parityDiff, parity / 10, "ITM put-call parity within 10%");
    }

    // ─── Bad input reverts ────────────────────────────────────────────────

    function test_revert_zero_spot() public {
        vm.expectRevert("BS: bad inputs");
        bsPrice(0, 3000e18, 30 days, 0.8e18, true);
    }

    function test_revert_zero_strike() public {
        vm.expectRevert("BS: bad inputs");
        bsPrice(3000e18, 0, 30 days, 0.8e18, true);
    }

    function test_revert_zero_vol() public {
        vm.expectRevert("BS: bad inputs");
        bsPrice(3000e18, 3000e18, 30 days, 0, true);
    }

    // ─── Boundary: very deep ITM call ─────────────────────────────────────

    function test_deep_itm_call_close_to_intrinsic() public view {
        // Deep ITM: call premium ≈ intrinsic (S - K)
        uint256 spot = 10000e18;
        uint256 strike = 1000e18;
        uint256 expiry = 7 days;
        uint256 vol = 0.5e18;

        uint256 call = bsPrice(spot, strike, expiry, vol, true);
        uint256 intrinsic = spot - strike; // 9000e18

        // Should be >= intrinsic and within 10% above it
        assertGe(call, intrinsic, "deep ITM call >= intrinsic");
        assertLt(call, intrinsic + intrinsic / 10, "deep ITM call within 10% of intrinsic");
    }

    // ─── Fuzz: call price always >= 0 and <= spot ─────────────────────────

    function testFuzz_call_price_bounds(uint256 spot, uint256 strike, uint256 expiry, uint256 vol)
        public
        view
    {
        spot = bound(spot, 100e18, 100_000e18);
        strike = bound(strike, 100e18, 100_000e18);
        expiry = bound(expiry, 0, 365 days);
        vol = bound(vol, 0.05e18, 3e18);

        uint256 call = bsPrice(spot, strike, expiry, vol, true);
        assertLe(call, spot, "call <= spot");
    }

    function testFuzz_put_price_bounds(uint256 spot, uint256 strike, uint256 expiry, uint256 vol)
        public
        view
    {
        spot = bound(spot, 100e18, 100_000e18);
        strike = bound(strike, 100e18, 100_000e18);
        expiry = bound(expiry, 0, 365 days);
        vol = bound(vol, 0.05e18, 3e18);

        uint256 put = bsPrice(spot, strike, expiry, vol, false);
        assertLe(put, strike, "put <= strike");
    }
}
