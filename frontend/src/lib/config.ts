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
  optionsHook: "0xdF4d01D6fc9E28940AB3Baecc3CFCd6689a9e815" as `0x${string}`,
  optionSeries: "0xD9b5413fe685e1D5d7C9960726fd4986A9EFcbC8" as `0x${string}`,
  collateralVault: "0xbD0F937f4ec7a4584aC5535655E4245842Cf2fF7" as `0x${string}`,
  volOracle: "0x60E045da4c55778d1F56cD13550F901E0C0C7b11" as `0x${string}`,
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
