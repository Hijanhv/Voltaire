// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ReactiveVolatilityRelayer} from "../src/reactive/ReactiveVolatilityRelayer.sol";
import {ReactiveExpirySettler} from "../src/reactive/ReactiveExpirySettler.sol";

/// @notice Deploy Voltaire's Reactive Smart Contracts on Reactive Network.
///
/// These RSCs run ON Reactive Network and call INTO Unichain.
/// They must be deployed AFTER Voltaire is deployed on Unichain.
///
/// Usage (Reactive Network testnet):
///   export PRIVATE_KEY=0x...
///   export VOLATILITY_ORACLE=0x60E045da4c55778d1F56cD13550F901E0C0C7b11
///   export OPTIONS_HOOK=0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815
///   export OPTION_SERIES=0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8
///   export UNICHAIN_ID=1301   # 130 for mainnet, 1301 for testnet
///
///   forge script script/DeployReactive.s.sol \
///     --rpc-url https://kopli-rpc.rkt.ink \
///     --private-key $PRIVATE_KEY \
///     --broadcast
///
/// After deployment:
///   1. Copy relayer address → set as REACTIVE_RELAYER in VolatilityOracle
///      cast send $VOLATILITY_ORACLE "setReactiveRelayer(address)" $RELAYER_ADDR
///   2. Copy settler address → set as reactiveCron in OptionsHook
///      cast send $OPTIONS_HOOK "setReactiveCron(address)" $SETTLER_ADDR
contract DeployReactive is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        address volatilityOracle = vm.envAddress("VOLATILITY_ORACLE");
        address optionsHook = vm.envAddress("OPTIONS_HOOK");
        address optionSeries = vm.envAddress("OPTION_SERIES");
        uint256 unichainId = vm.envOr("UNICHAIN_ID", uint256(1301));

        console2.log("=== Voltaire Reactive Network Deployment ===");
        console2.log("VolatilityOracle (Unichain):", volatilityOracle);
        console2.log("OptionsHook (Unichain):     ", optionsHook);
        console2.log("OptionSeries (Unichain):    ", optionSeries);
        console2.log("Unichain ID:                ", unichainId);

        vm.startBroadcast(deployerKey);

        // 1. Deploy VolatilityRelayer — subscribes to 4 chains, pushes vol to oracle
        ReactiveVolatilityRelayer relayer = new ReactiveVolatilityRelayer(volatilityOracle);
        console2.log("ReactiveVolatilityRelayer:  ", address(relayer));

        // 2. Deploy ExpirySettler — watches SeriesCreated, settles at expiry
        ReactiveExpirySettler settler =
            new ReactiveExpirySettler(optionsHook, optionSeries, unichainId);
        console2.log("ReactiveExpirySettler:      ", address(settler));

        vm.stopBroadcast();

        console2.log("\n=== Next Steps ===");
        console2.log("Wire relayer as authorized updater on VolatilityOracle:");
        console2.log(
            "  cast send", volatilityOracle, "\"setReactiveRelayer(address)\"", address(relayer)
        );
        console2.log("Wire settler as reactiveCron on OptionsHook:");
        console2.log("  cast send", optionsHook, "\"setReactiveCron(address)\"", address(settler));
    }
}
