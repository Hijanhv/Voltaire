// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title BlackScholes
/// @notice Pure on-chain Black-Scholes option pricing using fixed-point arithmetic (18 decimals)
/// @dev All inputs and outputs are in WAD (1e18). Uses Abramowitz & Stegun approximation for N(x).
library BlackScholes {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant HALF_WAD = 5e17;
    /// @dev Continuously-compounded risk-free rate: 5% p.a.
    uint256 internal constant RISK_FREE_RATE = 5e16;

    /// @notice Compute European call or put price via Black-Scholes
    /// @param spot    Spot price of the underlying (WAD)
    /// @param strike  Strike price (WAD)
    /// @param expiry  Seconds until expiry (raw, not WAD)
    /// @param vol     Annualised implied volatility (WAD, e.g. 0.8e18 = 80%)
    /// @param isCall  True for call, false for put
    /// @return price  Option premium (WAD, denominated in the same unit as spot)
    function price(uint256 spot, uint256 strike, uint256 expiry, uint256 vol, bool isCall)
        internal
        pure
        returns (uint256)
    {
        require(spot > 0 && strike > 0 && vol > 0, "BS: bad inputs");
        if (expiry == 0) {
            // At expiry, intrinsic value only
            if (isCall) {
                return spot > strike ? spot - strike : 0;
            } else {
                return strike > spot ? strike - spot : 0;
            }
        }

        // t = expiry in years (WAD)
        // We represent time as seconds / SECONDS_PER_YEAR * WAD
        uint256 t = (expiry * WAD) / 365 days;

        // Discount factor: df = e^(-rT), kDf = K * e^(-rT)
        uint256 rt = mulWad(RISK_FREE_RATE, t);
        uint256 df = expWad(-int256(rt));
        uint256 kDf = mulWad(strike, df);

        // vol^2 * t (WAD)
        uint256 vol2 = mulWad(vol, vol);
        uint256 vol2t = mulWad(vol2, t);

        // sqrt(vol^2 * t) = vol * sqrt(t)
        uint256 sqrtT = sqrt(t);
        uint256 volSqrtT = mulWad(vol, sqrtT);

        // ln(S/K)  — signed integer in WAD
        int256 lnSK = lnWad(int256(mulDiv(spot, WAD, strike)));

        // d1 = (ln(S/K) + (r + 0.5 * vol^2) * t) / (vol * sqrt(t))
        // d2 = d1 - vol * sqrt(t)
        int256 numerator = lnSK + int256(vol2t / 2) + int256(rt);
        int256 d1 = divSigned(numerator, int256(volSqrtT));
        int256 d2 = d1 - int256(volSqrtT);

        // N(d1), N(d2)
        uint256 Nd1;
        uint256 Nd2;
        uint256 Nd1neg;
        uint256 Nd2neg;

        if (d1 >= 0) {
            Nd1 = normcdf(uint256(d1));
            Nd1neg = WAD - Nd1;
        } else {
            Nd1neg = normcdf(uint256(-d1));
            Nd1 = WAD - Nd1neg;
        }

        if (d2 >= 0) {
            Nd2 = normcdf(uint256(d2));
            Nd2neg = WAD - Nd2;
        } else {
            Nd2neg = normcdf(uint256(-d2));
            Nd2 = WAD - Nd2neg;
        }

        if (isCall) {
            // C = S * N(d1) - K * e^(-rT) * N(d2)
            uint256 a = mulWad(spot, Nd1);
            uint256 b = mulWad(kDf, Nd2);
            return a > b ? a - b : 0;
        } else {
            // P = K * e^(-rT) * N(-d2) - S * N(-d1)
            uint256 a = mulWad(kDf, Nd2neg);
            uint256 b = mulWad(spot, Nd1neg);
            return a > b ? a - b : 0;
        }
    }

    // ─── Internal math helpers ────────────────────────────────────────────────

    /// @dev Standard normal CDF via A&S polynomial approximation
    ///      Accurate to ~1e-7. Input x is WAD, output is WAD ∈ [0, 1].
    ///      Only handles x >= 0; caller must apply symmetry for x < 0.
    function normcdf(uint256 x) internal pure returns (uint256) {
        // Constants (WAD)
        uint256 a1 = 319381530; // 0.319381530
        uint256 a2 = 356563782; // 0.356563782 (sign inverted below)
        uint256 a3 = 1781477937; // 1.781477937
        uint256 a4 = 1821255978; // 1.821255978 (sign inverted below)
        uint256 a5 = 1330274429; // 1.330274429
        uint256 p = 231641900; // 0.2316419

        // Scale x to 1e9 integer for the approximation
        uint256 xn = x / 1e9; // convert WAD to 9-decimal

        // k = 1 / (1 + p * x)
        uint256 px = p * xn / 1e9;
        uint256 k = 1e9 * 1e9 / (1e9 + px); // k in 1e9

        // Horner's polynomial: poly = k*(a1 + k*(−a2 + k*(a3 + k*(−a4 + k*a5))))
        // Use unsigned arithmetic with careful sign management
        uint256 k2 = k * k / 1e9;
        uint256 k3 = k2 * k / 1e9;
        uint256 k4 = k3 * k / 1e9;
        uint256 k5 = k4 * k / 1e9;

        // a5*k5 - a4*k4 + a3*k3 - a2*k2 + a1*k
        // All in units of 1e9 * 1e9 = 1e18
        uint256 term5 = a5 * k5;
        uint256 term4 = a4 * k4;
        uint256 term3 = a3 * k3;
        uint256 term2 = a2 * k2;
        uint256 term1 = a1 * k;

        // sum = term1 - term2 + term3 - term4 + term5
        uint256 poly;
        {
            uint256 pos = term1 + term3 + term5;
            uint256 neg = term2 + term4;
            poly = pos > neg ? pos - neg : 0;
        }

        // pdf = exp(-x^2/2) / sqrt(2*pi) scaled to 1e18
        uint256 pdf = _stdNormPdf(x);

        // cdf = 1 - pdf * poly  (both pdf and poly are in WAD format)
        uint256 sub = mulDiv(pdf, poly, WAD);
        return sub < WAD ? WAD - sub : 0;
    }

    /// @dev Standard normal PDF: e^(-x^2/2) / sqrt(2π), output WAD
    function _stdNormPdf(uint256 x) internal pure returns (uint256) {
        // exp(-x^2/2)
        uint256 xSq = mulWad(x, x);
        int256 negHalfXSq = -int256(xSq / 2);
        uint256 expVal = expWad(negHalfXSq);
        // divide by sqrt(2π) ≈ 2.506628... ≈ 2506628274631e6 (WAD)
        uint256 sqrtTwoPi = 2506628274631000576; // sqrt(2π) * 1e18
        return mulDiv(expVal, WAD, sqrtTwoPi);
    }

    // ─── WAD/fixed-point primitives ───────────────────────────────────────────

    function mulWad(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDiv(a, b, WAD);
    }

    function mulDiv(uint256 a, uint256 b, uint256 denom) internal pure returns (uint256) {
        return (a * b) / denom;
    }

    function divSigned(int256 a, int256 b) internal pure returns (int256) {
        require(b != 0, "BS: div zero");
        return (a * int256(WAD)) / b;
    }

    /// @dev Integer square root of a WAD value, returning WAD
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        // x is WAD, want sqrt(x) in WAD: sqrt(x * 1e18) / 1e9 ???
        // More carefully: sqrt_wad(x) = sqrt(x * 1e18)
        uint256 z = x * WAD;
        y = _sqrtRaw(z);
    }

    function _sqrtRaw(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @dev Natural log of a WAD value via bit-shifting decomposition
    ///      Input: x in WAD (must be > 0). Output: ln(x) in WAD (signed).
    function lnWad(int256 x) internal pure returns (int256 r) {
        require(x > 0, "BS: ln non-positive");
        // Uses the identity: ln(x) = ln(2) * log2(x)
        // Decompose x = 2^k * m where 0.5 <= m < 1
        // Then ln(x) = k*ln(2) + ln(m)
        // Approximation from Solmate / Solady
        unchecked {
            // Scale: x is in WAD = 1e18
            // We work in binary fixed-point then convert
            int256 lnTwo = 693147180559945309; // ln(2) * 1e18

            // Integer part via leading zeros
            int256 y = x;
            int256 k = 0;
            if (y >= int256(WAD)) {
                // x >= 1: find floor(log2(x/WAD))
                // Shift right until y < 2*WAD
                while (y >= 2 * int256(WAD)) {
                    y >>= 1;
                    k++;
                }
            } else {
                // x < 1: shift left
                while (y < int256(WAD)) {
                    y <<= 1;
                    k--;
                }
            }
            // Now WAD <= y < 2*WAD
            // ln(x) = k*ln(2) + ln(y/WAD)
            // For ln(y/WAD) where y/WAD ∈ [1,2), use Taylor around 1:
            // Let u = (y - WAD)/WAD  ∈ [0,1)
            // ln(1+u) ≈ u - u²/2 + u³/3 - u⁴/4 (Maclaurin)
            int256 u = ((y - int256(WAD)) * int256(WAD)) / y;
            int256 u2 = (u * u) / int256(WAD);
            int256 u3 = (u2 * u) / int256(WAD);
            int256 u4 = (u3 * u) / int256(WAD);
            int256 u5 = (u4 * u) / int256(WAD);
            int256 lnFrac = u - u2 / 2 + u3 / 3 - u4 / 4 + u5 / 5;
            r = k * lnTwo + lnFrac;
        }
    }

    /// @dev e^x for signed WAD x. Reverts if |x| too large.
    function expWad(int256 x) internal pure returns (uint256) {
        // Use series: e^x = 1 + x + x^2/2! + x^3/3! + ...
        // Only valid for small x; clamp large negative x to 0
        if (x <= -42 * int256(WAD)) return 0;
        if (x >= 135 * int256(WAD)) return type(uint256).max; // overflow guard

        // Use bit decomposition: e^x = e^(k*ln2) * e^(r) = 2^k * e^r
        // where r = x - k*ln2, |r| <= 0.5*ln2
        int256 ln2 = 693147180559945309;
        int256 k = x / ln2; // integer part of x/ln2
        int256 r = x - k * ln2; // |r| < ln2

        // e^r via incremental Taylor: accumulate r^n/n! term-by-term to avoid int256 overflow.
        // Direct r^5 computation overflows since |r| can reach ln2 ≈ 6.93e17.
        int256 wad = int256(WAD);
        int256 er = wad;
        int256 rn = r; // r^1
        er += rn;
        rn = rn * r / (2 * wad); // r^2 / 2!
        er += rn;
        rn = rn * r / (3 * wad); // r^3 / 3!
        er += rn;
        rn = rn * r / (4 * wad); // r^4 / 4!
        er += rn;
        rn = rn * r / (5 * wad); // r^5 / 5!
        er += rn;

        // Multiply by 2^k
        if (er <= 0) return 0;
        uint256 result = uint256(er);
        if (k >= 0) {
            result <<= uint256(k);
        } else {
            result >>= uint256(-k);
        }
        return result;
    }
}
