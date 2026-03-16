// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @notice Initialize a Uniswap V4 ETH/USDC pool pointing at the Voltaire OptionsHook
///
/// Usage:
///   export PRIVATE_KEY=0x...
///   forge script script/InitPool.s.sol \
///     --rpc-url https://sepolia.unichain.org \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract InitPool is Script {
    // ─── Unichain Sepolia addresses ───────────────────────────────────────────
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant OPTIONS_HOOK = 0xD9789FEc57c950638D1Ba88941a0C65f32F81f58;

    // Unichain Sepolia token addresses
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F; // Unichain Sepolia USDC

    // Pool fee tier: 3000 = 0.3%
    uint24 constant FEE = 3000;

    // Tick spacing for 0.3% fee tier
    int24 constant TICK_SPACING = 60;

    // Initial sqrt price: ETH = $3000
    // sqrtPriceX96 = sqrt(price) * 2^96
    // price = USDC/ETH = 3000 (since USDC has 6 decimals, ETH has 18: adjust accordingly)
    // For token0=USDC(6dec), token1=WETH(18dec): price = 3000e6/1e18 = 3e-12
    // sqrtPrice = sqrt(3e-12) * 2^96 ≈ 1732050808... * 2^96 / 1e6
    // Use: python3 -c "import math; print(int(math.sqrt(3000 * 10**6 / 10**18) * 2**96))"
    // ≈ 1977159968948632742 (adjust per actual token order)
    uint160 constant SQRT_PRICE_ETH_3000 = 1977159968948632742398103430;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // Sort tokens: Uniswap V4 requires currency0 < currency1 (address ordering)
        (address token0, address token1) = USDC < WETH ? (USDC, WETH) : (WETH, USDC);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(OPTIONS_HOOK)
        });

        console2.log("=== Voltaire Pool Initialization ===");
        console2.log("PoolManager:  ", POOL_MANAGER);
        console2.log("OptionsHook:  ", OPTIONS_HOOK);
        console2.log("token0:       ", token0);
        console2.log("token1:       ", token1);
        console2.log("fee:          ", FEE);
        console2.log("tickSpacing:  ", uint24(TICK_SPACING));

        vm.startBroadcast(deployerKey);

        IPoolManager(POOL_MANAGER).initialize(key, SQRT_PRICE_ETH_3000);

        vm.stopBroadcast();

        console2.log("Pool initialized successfully!");
        console2.log("Pool ID: see broadcast/InitPool.s.sol/1301/run-latest.json");
    }
}
