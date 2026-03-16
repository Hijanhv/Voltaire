// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {VolatilityOracle} from "../src/VolatilityOracle.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {OptionsHook} from "../src/OptionsHook.sol";

/// @notice Voltaire deployment script for Unichain Mainnet
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   export REACTIVE_RELAYER=0x...   # Reactive Network relayer address
///   export REACTIVE_CRON=0x...      # Reactive Network cron address
///   forge script script/DeployMainnet.s.sol \
///     --rpc-url https://mainnet.unichain.org \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify
///
/// Unichain Mainnet:
///   PoolManager: 0x1F98400000000000000000000000000000000004
///   Chain ID: 130
contract DeployVoltaireMainnet is Script {
    address constant POOL_MANAGER = 0x1F98400000000000000000000000000000000004;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // On mainnet these MUST be real Reactive Network addresses
        address reactiveRelayer =
            vm.envUint("REACTIVE_RELAYER") != 0 ? vm.envAddress("REACTIVE_RELAYER") : deployer;
        address reactiveCron =
            vm.envUint("REACTIVE_CRON") != 0 ? vm.envAddress("REACTIVE_CRON") : deployer;

        require(reactiveRelayer != deployer, "Set REACTIVE_RELAYER to real Reactive address");
        require(reactiveCron != deployer, "Set REACTIVE_CRON to real Reactive address");

        console2.log("=== Voltaire Deployment - Unichain Mainnet ===");
        console2.log("Deployer:        ", deployer);
        console2.log("ReactiveRelayer: ", reactiveRelayer);
        console2.log("ReactiveCron:    ", reactiveCron);
        console2.log("PoolManager:     ", POOL_MANAGER);

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

        // 4. OptionsHook
        OptionsHook hook =
            new OptionsHook(IPoolManager(POOL_MANAGER), volOracle, series, vault, reactiveCron);
        console2.log("OptionsHook:     ", address(hook));

        // 5. Wire vault and series to the real hook
        vault.setHook(address(hook));
        series.setHook(address(hook));
        console2.log("Wired vault and series to hook");

        vm.stopBroadcast();

        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:          Unichain Mainnet (chainId=130)");
        console2.log("PoolManager:     ", POOL_MANAGER);
        console2.log("VolatilityOracle:", address(volOracle));
        console2.log("CollateralVault: ", address(vault));
        console2.log("OptionSeries:    ", address(series));
        console2.log("OptionsHook:     ", address(hook));
        console2.log("\nNext steps:");
        console2.log("1. Verify: forge verify-contract <addr> <contract> --chain 130");
        console2.log("2. Initialize Uniswap V4 pool via InitPool.s.sol");
        console2.log("3. Update frontend/src/lib/config.ts with mainnet addresses");
        console2.log("4. Configure Reactive Network cron for expiry settlement");
    }
}
