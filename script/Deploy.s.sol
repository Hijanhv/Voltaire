// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {VolatilityOracle} from "../src/VolatilityOracle.sol";
import {OptionSeries} from "../src/OptionSeries.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {OptionsHook} from "../src/OptionsHook.sol";

/// @notice Voltaire deployment script
/// @dev Deploy order:
///      1. VolatilityOracle (needs reactive relayer address)
///      2. CollateralVault (needs hook address — chicken-egg, solved via Create2 or setter)
///      3. OptionsHook (needs all of the above)
///      4. OptionSeries (needs hook address)
///      5. Wire up: setHook on vault, configure oracle relayer
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployVoltaire is Script {
    // ─── Addresses (Unichain mainnet) ─────────────────────────────────────────
    // Uniswap V4 PoolManager on Unichain
    address constant POOL_MANAGER = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address reactiveRelayer = vm.envOr("REACTIVE_RELAYER", deployer); // default to deployer for testnet

        console2.log("=== Voltaire Deployment ===");
        console2.log("Deployer:        ", deployer);
        console2.log("ReactiveRelayer: ", reactiveRelayer);

        vm.startBroadcast(deployerKey);

        // 1. Volatility Oracle
        VolatilityOracle volOracle = new VolatilityOracle(reactiveRelayer);
        console2.log("VolatilityOracle:", address(volOracle));

        // 2. Temp stub for hook address (will set after deployment)
        // Deploy vault with deployer as temporary hook
        CollateralVault vault = new CollateralVault(deployer);
        console2.log("CollateralVault: ", address(vault));

        // 3. Deploy OptionsHook
        // Note: In production, use HookMiner to find a CREATE2 salt that produces
        // an address with the correct permission bits set.
        // For hackathon: deploy normally and note the required address pattern.
        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        // Placeholder OptionSeries (needs hook — deploy with deployer first)
        OptionSeries series = new OptionSeries(deployer);
        console2.log("OptionSeries:    ", address(series));

        OptionsHook hook = new OptionsHook(poolManager, volOracle, series, vault, reactiveRelayer);
        console2.log("OptionsHook:     ", address(hook));

        // 4. Wire up: set real hook address
        vault.setHook(address(hook));

        // Series needs a setHook — add a mechanism (see note below)
        // For now: redeploy series with correct hook
        // In production: use an upgradeable proxy or factory pattern
        OptionSeries seriesFinal = new OptionSeries(address(hook));
        console2.log("OptionSeriesFinal:", address(seriesFinal));

        // 5. Seed oracle with initial volatility (70% annualised)
        // This would normally be done by Reactive Network
        // For demo: call directly if relayer = deployer
        if (reactiveRelayer == deployer) {
            volOracle.updateVolatility(
                0.7e18, // 70% vol
                0xF, // all 4 chains: Eth|Arb|Base|BSC
                288 // 24h * 12 samples/hour
            );
            console2.log("Seeded volatility: 70%");
        }

        vm.stopBroadcast();

        // ─── Summary ─────────────────────────────────────────────────────────
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:          Unichain");
        console2.log("VolatilityOracle:", address(volOracle));
        console2.log("CollateralVault: ", address(vault));
        console2.log("OptionSeries:    ", address(seriesFinal));
        console2.log("OptionsHook:     ", address(hook));
        console2.log("\nNext steps:");
        console2.log("1. Fund CollateralVault with USDC collateral");
        console2.log("2. Configure Reactive Network cron for each expiry");
        console2.log("3. Initialize Uniswap V4 pool with OptionsHook");
        console2.log("4. Update frontend with deployed addresses");
    }
}
