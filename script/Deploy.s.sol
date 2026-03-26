// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {VolatilityOracle} from "../src/VolatilityOracle.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {OptionsHook} from "../src/OptionsHook.sol";

/// @notice Voltaire deployment script (local / generic)
///
/// Deploy order (chicken-egg solved via setHook):
///   1. VolatilityOracle
///   2. CollateralVault  (temp hook = deployer)
///   3. OptionSeries     (temp hook = deployer)
///   4. OptionsHook      (inherits BaseHook, needs real vault + series)
///   5. vault.setHook + series.setHook — wire to real hook address
///   6. Seed VolatilityOracle with 70% vol (if relayer == deployer)
///
/// Production note: OptionsHook (a BaseHook) must be deployed at an address
/// whose lower 14 bits match getHookPermissions() flags (0x88 = beforeSwap |
/// beforeSwapReturnDelta). Use HookMiner + CREATE2 before a real pool launch.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployVoltaire is Script {
    // Uniswap V4 PoolManager on Unichain mainnet
    address constant POOL_MANAGER = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address reactiveRelayer = vm.envOr("REACTIVE_RELAYER", deployer);
        address reactiveCron = vm.envOr("REACTIVE_CRON", deployer);

        console2.log("=== Voltaire Deployment ===");
        console2.log("Deployer:        ", deployer);
        console2.log("ReactiveRelayer: ", reactiveRelayer);
        console2.log("ReactiveCron:    ", reactiveCron);

        vm.startBroadcast(deployerKey);

        // 1. VolatilityOracle
        VolatilityOracle volOracle = new VolatilityOracle(reactiveRelayer);
        console2.log("VolatilityOracle:", address(volOracle));

        // 2. CollateralVault — temp hook = deployer, wired below
        CollateralVault vault = new CollateralVault(deployer);
        console2.log("CollateralVault: ", address(vault));

        // 3. OptionSeries — temp hook = deployer, wired below
        OptionSeries series = new OptionSeries(deployer);
        console2.log("OptionSeries:    ", address(series));

        // 4. OptionsHook (extends BaseHook)
        OptionsHook hook =
            new OptionsHook(IPoolManager(POOL_MANAGER), volOracle, series, vault, reactiveCron);
        console2.log("OptionsHook:     ", address(hook));
        console2.log("Hook flags (lower bits):", uint160(address(hook)) & 0x3FFF);

        // 5. Wire vault and series to the real hook
        vault.setHook(address(hook));
        series.setHook(address(hook));
        console2.log("Wired vault and series to hook");

        // 6. Seed oracle with 70% vol if relayer == deployer (testnet shortcut)
        if (reactiveRelayer == deployer) {
            volOracle.updateVolatility(0.7e18, 0xF, 288);
            console2.log("Seeded volatility: 70%");
        }

        vm.stopBroadcast();

        console2.log("\n=== Deployment Summary ===");
        console2.log("VolatilityOracle:", address(volOracle));
        console2.log("CollateralVault: ", address(vault));
        console2.log("OptionSeries:    ", address(series));
        console2.log("OptionsHook:     ", address(hook));
        console2.log("\nNext steps:");
        console2.log("1. Fund CollateralVault with USDC collateral");
        console2.log("2. Use HookMiner to mine a valid CREATE2 salt for mainnet pool init");
        console2.log("3. Initialize Uniswap V4 pool with OptionsHook via InitPool.s.sol");
        console2.log("4. Configure Reactive Network cron for expiry settlement");
    }
}
