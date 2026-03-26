// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC20 for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CollateralVaultTest is Test {
    CollateralVault vault;
    MockUSDC usdc;

    address hook = makeAddr("hook");
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant WAD = 1e18;
    uint256 constant INITIAL_MINT = 1_000_000e6; // 1M USDC (6 decimals for realism, but we test with 18)

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        vault = new CollateralVault(hook);

        // Mint USDC to test users
        usdc.mint(alice, 100_000 * WAD);
        usdc.mint(bob, 100_000 * WAD);
    }

    // ─── Deposit ───────────────────────────────────────────────────────────

    function test_deposit_first_gets_1_to_1_shares() public {
        uint256 amount = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(address(usdc), amount);
        vm.stopPrank();

        assertEq(shares, amount, "first deposit: 1:1 shares");
        assertEq(vault.writerShares(alice, address(usdc)), amount);
        (uint256 totalShares, uint256 totalAssets,) = vault.vaultState(address(usdc));
        assertEq(totalShares, amount);
        assertEq(totalAssets, amount);
    }

    function test_deposit_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.deposit(address(usdc), 0);
    }

    function test_deposit_multiple_writers_proportional() public {
        uint256 aliceAmt = 10_000 * WAD;
        uint256 bobAmt = 10_000 * WAD;

        vm.startPrank(alice);
        usdc.approve(address(vault), aliceAmt);
        vault.deposit(address(usdc), aliceAmt);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), bobAmt);
        vault.deposit(address(usdc), bobAmt);
        vm.stopPrank();

        // Both deposit same amount → same shares
        assertEq(
            vault.writerShares(alice, address(usdc)),
            vault.writerShares(bob, address(usdc)),
            "equal deposits equal shares"
        );
    }

    function test_deposit_emits_event() public {
        uint256 amount = 5_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vm.expectEmit(true, true, false, true);
        emit CollateralVault.Deposited(alice, address(usdc), amount, amount);
        vault.deposit(address(usdc), amount);
        vm.stopPrank();
    }

    // ─── Withdraw ──────────────────────────────────────────────────────────

    function test_withdraw_returns_correct_amount() public {
        uint256 amount = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(address(usdc), amount);

        uint256 balanceBefore = usdc.balanceOf(alice);
        uint256 withdrawn = vault.withdraw(address(usdc), shares);
        vm.stopPrank();

        assertEq(withdrawn, amount);
        assertEq(usdc.balanceOf(alice), balanceBefore + amount);
    }

    function test_withdraw_zero_shares_reverts() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.withdraw(address(usdc), 0);
    }

    function test_withdraw_insufficient_shares_reverts() public {
        uint256 amount = 1_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vault.deposit(address(usdc), amount);
        vm.expectRevert(CollateralVault.InsufficientBalance.selector);
        vault.withdraw(address(usdc), amount + 1);
        vm.stopPrank();
    }

    function test_withdraw_blocked_when_utilized() public {
        uint256 amount = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(address(usdc), amount);
        vm.stopPrank();

        // Lock all collateral via hook
        vm.prank(hook);
        vault.lockCollateral(1, address(usdc), amount);

        // Withdrawal should fail — all utilized
        vm.prank(alice);
        vm.expectRevert(CollateralVault.InsufficientCollateral.selector);
        vault.withdraw(address(usdc), shares);
    }

    // ─── Premium accrual ───────────────────────────────────────────────────

    function test_receive_premium_increases_share_value() public {
        uint256 deposit = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), deposit);
        uint256 shares = vault.deposit(address(usdc), deposit);
        vm.stopPrank();

        // Simulate premium: hook sends USDC to vault and calls receivePremium
        uint256 premium = 500 * WAD;
        usdc.mint(address(vault), premium);
        vm.prank(hook);
        vault.receivePremium(address(usdc), premium);

        // Alice's position should now be worth deposit + premium
        uint256 posValue = vault.positionValue(alice, address(usdc));
        assertEq(posValue, deposit + premium);

        // Withdrawing all shares should give deposit + premium
        vm.prank(alice);
        uint256 withdrawn = vault.withdraw(address(usdc), shares);
        assertEq(withdrawn, deposit + premium);
    }

    function test_receive_premium_reverts_non_hook() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.OnlyHook.selector);
        vault.receivePremium(address(usdc), 100 * WAD);
    }

    // ─── Lock / Unlock collateral ──────────────────────────────────────────

    function test_lock_collateral_updates_utilization() public {
        uint256 deposit = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), deposit);
        vault.deposit(address(usdc), deposit);
        vm.stopPrank();

        vm.prank(hook);
        vault.lockCollateral(42, address(usdc), 3_000 * WAD);

        assertEq(vault.availableLiquidity(address(usdc)), 7_000 * WAD);
        uint256 ratio = vault.utilizationRatio(address(usdc));
        assertEq(ratio, 0.3e18, "30% utilization");
    }

    function test_lock_collateral_reverts_over_utilization() public {
        uint256 deposit = 5_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), deposit);
        vault.deposit(address(usdc), deposit);
        vm.stopPrank();

        vm.prank(hook);
        vm.expectRevert(CollateralVault.InsufficientCollateral.selector);
        vault.lockCollateral(1, address(usdc), 5_001 * WAD);
    }

    function test_lock_reverts_non_hook() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.OnlyHook.selector);
        vault.lockCollateral(1, address(usdc), 100 * WAD);
    }

    function test_unlock_collateral_frees_liquidity() public {
        uint256 deposit = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), deposit);
        vault.deposit(address(usdc), deposit);
        vm.stopPrank();

        vm.startPrank(hook);
        vault.lockCollateral(99, address(usdc), 4_000 * WAD);
        assertEq(vault.availableLiquidity(address(usdc)), 6_000 * WAD);

        vault.unlockCollateral(99, address(usdc));
        assertEq(vault.availableLiquidity(address(usdc)), 10_000 * WAD);
        vm.stopPrank();
    }

    function test_unlock_noop_when_nothing_locked() public {
        // Should not revert
        vm.prank(hook);
        vault.unlockCollateral(999, address(usdc));
    }

    // ─── Pay settlement ────────────────────────────────────────────────────

    function test_pay_settlement_transfers_tokens() public {
        uint256 deposit = 10_000 * WAD;
        vm.startPrank(alice);
        usdc.approve(address(vault), deposit);
        vault.deposit(address(usdc), deposit);
        vm.stopPrank();

        vm.startPrank(hook);
        vault.lockCollateral(1, address(usdc), 5_000 * WAD);

        address trader = makeAddr("trader");
        uint256 payout = 1_000 * WAD;
        vault.paySettlement(address(usdc), trader, payout, 1);
        vm.stopPrank();

        assertEq(usdc.balanceOf(trader), payout);
    }

    function test_pay_settlement_reverts_non_hook() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.OnlyHook.selector);
        vault.paySettlement(address(usdc), alice, 100 * WAD, 1);
    }

    // ─── View functions ────────────────────────────────────────────────────

    function test_utilization_ratio_zero_when_empty() public view {
        assertEq(vault.utilizationRatio(address(usdc)), 0);
    }

    function test_available_liquidity_zero_when_empty() public view {
        assertEq(vault.availableLiquidity(address(usdc)), 0);
    }

    function test_position_value_zero_when_no_shares() public view {
        assertEq(vault.positionValue(alice, address(usdc)), 0);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function test_set_hook_only_owner() public {
        address newHook = makeAddr("newHook");
        vm.prank(owner);
        vault.setHook(newHook);
        assertEq(vault.hook(), newHook);
    }

    function test_set_hook_reverts_non_owner() public {
        vm.prank(alice);
        vm.expectRevert("only owner");
        vault.setHook(alice);
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────────

    function testFuzz_deposit_withdraw_roundtrip(uint256 amount) public {
        amount = bound(amount, 1, 100_000 * WAD);
        usdc.mint(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(address(usdc), amount);
        uint256 withdrawn = vault.withdraw(address(usdc), shares);
        vm.stopPrank();

        assertEq(withdrawn, amount, "deposit-withdraw roundtrip");
    }
}
