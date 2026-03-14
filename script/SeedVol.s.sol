// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {VolatilityOracle} from "../src/VolatilityOracle.sol";

/// @notice Simulate Reactive Network pushing volatility updates
///         Run this to test the oracle feed locally.
///
/// Usage:
///   forge script script/SeedVol.s.sol \
///     --rpc-url $RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --sig "run(address)" <ORACLE_ADDRESS>
contract SeedVolatility is Script {
    function run(address oracleAddress) external {
        uint256 key = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(key);

        VolatilityOracle oracle = VolatilityOracle(oracleAddress);

        // Simulate 5 updates representing cross-chain vol computation
        uint256[5] memory vols = [
            uint256(0.68e18), // 68%
            uint256(0.71e18), // 71%
            uint256(0.75e18), // 75%
            uint256(0.7e18), // 70%
            uint256(0.72e18) // 72% (current)
        ];

        uint256 allChains = 0xF; // Ethereum | Arbitrum | Base | BSC

        for (uint256 i = 0; i < vols.length; i++) {
            oracle.updateVolatility(vols[i], allChains, 288);
            console2.log("Updated vol to:", vols[i] / 1e16, "%");
        }

        vm.stopBroadcast();

        (uint256 vol, uint256 age) = oracle.getVolatilityUnsafe();
        console2.log("Current vol (bps):", vol / 1e14);
        console2.log("Age (s):", age);
    }
}
