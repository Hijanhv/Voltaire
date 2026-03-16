import { http, createConfig } from "wagmi";
import { unichain } from "wagmi/chains";

export const config = createConfig({
  chains: [unichain],
  transports: {
    [unichain.id]: http(),
  },
});

// Deployed contract addresses (update after deployment)
export const CONTRACTS = {
  optionsHook: "0xD9789FEc57c950638D1Ba88941a0C65f32F81f58" as `0x${string}`,
  optionSeries: "0x846f41aE723Ea3f81DeD68783B17aCa489714aF8" as `0x${string}`,
  collateralVault: "0xB4A9Ddc348D8814c95Fd6811B2899f5036920324" as `0x${string}`,
  volOracle: "0x013dEE73A250A754705Dedc3A326cD9da9a4c856" as `0x${string}`,
  usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as `0x${string}`,
  weth: "0x4200000000000000000000000000000000000006" as `0x${string}`,
};

// Option expiry timestamps
export const EXPIRIES = {
  "MAR-26": new Date("2026-03-28").getTime() / 1000,
  "APR-26": new Date("2026-04-25").getTime() / 1000,
  "MAY-26": new Date("2026-05-30").getTime() / 1000,
  "JUN-26": new Date("2026-06-27").getTime() / 1000,
};

// Strike grid (USD)
export const STRIKES = [2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4500];
