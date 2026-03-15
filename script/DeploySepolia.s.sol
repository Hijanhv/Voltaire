// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {VolatilityOracle} from "../src/VolatilityOracle.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {OptionsHook} from "../src/OptionsHook.sol";

/// @notice Voltaire deployment script for Unichain Sepolia testnet
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   export RPC_URL=https://sepolia.unichain.org
///   forge script script/DeploySepolia.s.sol \
///     --rpc-url $RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify
///
/// Unichain Sepolia addresses:
///   PoolManager: 0x00B036B58a818B1BC34d502D3fE730Db729e62AC
///   Chain ID: 1301
contract DeployVoltaireSepolia is Script {
    // ─── Unichain Sepolia ─────────────────────────────────────────────────────
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // On testnet, deployer acts as the Reactive Network relayer and cron
        // (replace with real Reactive Network addresses on mainnet)
        address reactiveRelayer = vm.envOr("REACTIVE_RELAYER", deployer);
        address reactiveCron = vm.envOr("REACTIVE_CRON", deployer);

        console2.log("=== Voltaire Deployment - Unichain Sepolia ===");
        console2.log("Deployer:        ", deployer);
        console2.log("ReactiveRelayer: ", reactiveRelayer);
        console2.log("ReactiveCron:    ", reactiveCron);
        console2.log("PoolManager:     ", POOL_MANAGER);

        vm.startBroadcast(deployerKey);

        // 1. VolatilityOracle
        VolatilityOracle volOracle = new VolatilityOracle(reactiveRelayer);
        console2.log("VolatilityOracle:", address(volOracle));

        // 2. CollateralVault — deploy with deployer as temp hook, wired later
        CollateralVault vault = new CollateralVault(deployer);
        console2.log("CollateralVault: ", address(vault));

        // 3. OptionSeries — deploy with deployer as temp hook, wired later
        OptionSeries series = new OptionSeries(deployer);
        console2.log("OptionSeries:    ", address(series));

        // 4. OptionsHook — needs final series + vault addresses
        //    NOTE: In production, use HookMiner to find a CREATE2 salt that produces
        //    an address where the lower bits encode the required permissions (0x88).
        //    For testnet: deploy normally and manually verify address bits satisfy V4.
        IPoolManager poolManager = IPoolManager(POOL_MANAGER);
        OptionsHook hook = new OptionsHook(poolManager, volOracle, series, vault, reactiveCron);
        console2.log("OptionsHook:     ", address(hook));

        // 5. Wire up — point vault and series at the real hook
        vault.setHook(address(hook));

        // Re-deploy series with real hook address (chicken-egg resolution)
        OptionSeries seriesFinal = new OptionSeries(address(hook));
        console2.log("OptionSeriesFinal:", address(seriesFinal));

        // Re-deploy hook with final series
        OptionsHook hookFinal =
            new OptionsHook(poolManager, volOracle, seriesFinal, vault, reactiveCron);
        console2.log("OptionsHookFinal: ", address(hookFinal));
        vault.setHook(address(hookFinal));

        // 6. Seed oracle with initial 70% vol (deployer acts as relayer on testnet)
        if (reactiveRelayer == deployer) {
            volOracle.updateVolatility(
                0.7e18, // 70% annualised vol
                0xF, // all 4 chains: Eth | Arb | Base | BSC
                288 // 24h × 12 samples/hour
            );
            console2.log("Seeded volatility: 70%");
        }

        vm.stopBroadcast();

        // ─── Summary ──────────────────────────────────────────────────────────
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:          Unichain Sepolia (chainId=1301)");
        console2.log("PoolManager:     ", POOL_MANAGER);
        console2.log("VolatilityOracle:", address(volOracle));
        console2.log("CollateralVault: ", address(vault));
        console2.log("OptionSeries:    ", address(seriesFinal));
        console2.log("OptionsHook:     ", address(hookFinal));
        console2.log("\nNext steps:");
        console2.log("1. Verify contracts: forge verify-contract <addr> <contract> --chain 1301");
        console2.log("2. Deposit USDC collateral into CollateralVault");
        console2.log(
            "3. Initialize Uniswap V4 pool pointing at OptionsHook (must be at 0x...88 address)"
        );
        console2.log("4. Update frontend/src/lib/contracts.ts with deployed addresses");
        console2.log("5. Configure Reactive Network cron for option expiry settlement");
    }
}
