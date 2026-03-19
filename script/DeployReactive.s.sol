// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ReactiveVolatilityRelayer} from "../src/reactive/ReactiveVolatilityRelayer.sol";
import {ReactiveExpirySettler} from "../src/reactive/ReactiveExpirySettler.sol";

/// @notice Deploy Voltaire's Reactive Smart Contracts on Reactive Network (Lasna testnet).
///
/// These RSCs run ON Reactive Network and emit Callbacks INTO Unichain.
/// They must be deployed AFTER Voltaire is deployed on Unichain Sepolia.
///
/// Setup:
///   export PRIVATE_KEY=0x...
///   export VOLATILITY_ORACLE=0x60E045da4c55778d1F56cD13550F901E0C0C7b11
///   export OPTIONS_HOOK=0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815
///   export OPTION_SERIES=0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8
///   export UNICHAIN_ID=1301   # 130 for mainnet, 1301 for Sepolia testnet
///
/// Deploy to Lasna testnet:
///   forge script script/DeployReactive.s.sol \
///     --rpc-url https://lasna-rpc.rnk.dev/ \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --value 0.1ether
///
/// After deployment, wire the contracts:
///   1. Authorize relayer in VolatilityOracle:
///      cast send $VOLATILITY_ORACLE "setReactiveRelayer(address)" $RELAYER_ADDR \
///        --rpc-url https://sepolia.unichain.org --private-key $PRIVATE_KEY
///   2. Register existing series in the settler (if any series were created before RSC deployment):
///      cast send $SETTLER_ADDR "registerSeries(uint256,uint256)" <seriesId> <expiry> \
///        --rpc-url https://lasna-rpc.rnk.dev/ --private-key $PRIVATE_KEY
contract DeployReactive is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        address volatilityOracle = vm.envOr("VOLATILITY_ORACLE", address(0x60E045da4c55778d1F56cD13550F901E0C0C7b11));
        address optionsHook      = vm.envOr("OPTIONS_HOOK",      address(0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815));
        address optionSeries     = vm.envOr("OPTION_SERIES",     address(0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8));
        uint256 unichainId       = vm.envOr("UNICHAIN_ID",       uint256(1301));

        console2.log("=== Voltaire Reactive Network Deployment (Lasna) ===");
        console2.log("VolatilityOracle (Unichain):", volatilityOracle);
        console2.log("OptionsHook (Unichain):     ", optionsHook);
        console2.log("OptionSeries (Unichain):    ", optionSeries);
        console2.log("Unichain Chain ID:          ", unichainId);

        vm.startBroadcast(deployerKey);

        // 1. Deploy VolatilityRelayer
        //    Subscribes to Uniswap V3 Swap events on Ethereum/Arbitrum/Base/BSC mainnet,
        //    computes cross-chain realized vol, pushes to VolatilityOracle on Unichain.
        ReactiveVolatilityRelayer relayer =
            new ReactiveVolatilityRelayer(volatilityOracle, unichainId);
        console2.log("ReactiveVolatilityRelayer:  ", address(relayer));

        // 2. Deploy ExpirySettler
        //    Subscribes to SeriesCreated events from OptionSeries on Unichain,
        //    tracks expiry timestamps, emits settlement callback at expiry.
        ReactiveExpirySettler settler =
            new ReactiveExpirySettler(optionsHook, optionSeries, unichainId);
        console2.log("ReactiveExpirySettler:      ", address(settler));

        vm.stopBroadcast();

        console2.log("\n=== Next Steps ===");
        console2.log("1. Authorize relayer in VolatilityOracle (Unichain Sepolia):");
        console2.log("   cast send <oracle> setReactiveRelayer(address) <relayer>");
        console2.log("   Relayer address:", address(relayer));
        console2.log("2. Register existing series in settler if any were created before RSC:");
        console2.log("   cast send <settler> registerSeries(uint256,uint256) <id> <expiry>");
        console2.log("   Settler address:", address(settler));
    }
}
