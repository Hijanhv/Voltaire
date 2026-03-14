"use client";

import { useState, useMemo } from "react";
import { MOCK_SPOT, MOCK_VOL, STRIKES, formatTimeToExpiry } from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

const EXPIRIES = [
  { label: "28 MAR 2026", ts: new Date("2026-03-28").getTime() / 1000 },
  { label: "25 APR 2026", ts: new Date("2026-04-25").getTime() / 1000 },
  { label: "30 MAY 2026", ts: new Date("2026-05-30").getTime() / 1000 },
  { label: "27 JUN 2026", ts: new Date("2026-06-27").getTime() / 1000 },
];

export default function BuyOptions() {
  const [isCall, setIsCall] = useState(true);
  const [strike, setStrike] = useState(3400);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const expiry = EXPIRIES[expiryIdx].ts;

  const bs = useMemo(() =>
    blackScholes({ spot: MOCK_SPOT, strike, expiry, vol: MOCK_VOL, isCall }),
    [isCall, strike, expiry]
  );

  const totalPremium = bs.price * quantity;
  const tte = formatTimeToExpiry(expiry);
  const moneyness = ((MOCK_SPOT / strike - 1) * 100).toFixed(1);
  const moneynessLabel = isCall
    ? MOCK_SPOT > strike ? "ITM" : MOCK_SPOT < strike ? "OTM" : "ATM"
    : MOCK_SPOT < strike ? "ITM" : MOCK_SPOT > strike ? "OTM" : "ATM";

  // Strike chain (option chain for selected expiry/type)
  const strikeChain = useMemo(() =>
    STRIKES.map((s) => {
      const b = blackScholes({ spot: MOCK_SPOT, strike: s, expiry, vol: MOCK_VOL, isCall });
      return { strike: s, premium: b.price, delta: b.delta, iv: MOCK_VOL };
    }),
    [isCall, expiry]
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
          Buy Options
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Premiums priced via on-chain Black-Scholes · Vol: {(MOCK_VOL * 100).toFixed(1)}% (cross-chain index)
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* Left: strike chain */}
        <div>
          {/* Type + expiry selectors */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {/* Call/Put toggle */}
            <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 7, padding: 2, gap: 2 }}>
              {[true, false].map((c) => (
                <button
                  key={String(c)}
                  onClick={() => setIsCall(c)}
                  style={{
                    padding: "5px 16px",
                    borderRadius: 5,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: isCall === c ? "white" : "transparent",
                    color: isCall === c
                      ? (c ? "var(--green)" : "var(--red)")
                      : "var(--text-muted)",
                    boxShadow: isCall === c ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {c ? "CALL" : "PUT"}
                </button>
              ))}
            </div>

            {/* Expiry selector */}
            <div style={{ display: "flex", gap: 6 }}>
              {EXPIRIES.map((e, i) => (
                <button
                  key={e.label}
                  onClick={() => setExpiryIdx(i)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 5,
                    border: `1px solid ${expiryIdx === i ? "var(--accent)" : "var(--border)"}`,
                    fontSize: 11,
                    fontWeight: expiryIdx === i ? 500 : 400,
                    cursor: "pointer",
                    background: expiryIdx === i ? "var(--accent)" : "white",
                    color: expiryIdx === i ? "white" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Strike chain table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Strike", "Premium", "Delta", "IV", ""].map((h) => (
                    <th key={h} style={{ padding: "9px 16px", textAlign: h === "Strike" ? "left" : "right", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strikeChain.map((row, i) => {
                  const isSelected = row.strike === strike;
                  const isAtm = Math.abs(row.strike - MOCK_SPOT) < 100;
                  return (
                    <tr
                      key={row.strike}
                      style={{
                        borderBottom: i < strikeChain.length - 1 ? "1px solid var(--border)" : "none",
                        background: isSelected ? "var(--bg-2)" : "white",
                        cursor: "pointer",
                      }}
                      onClick={() => setStrike(row.strike)}
                    >
                      <td style={{ padding: "10px 16px", fontWeight: isAtm ? 600 : 400, fontFeatureSettings: '"tnum" 1' }}>
                        ${row.strike.toLocaleString()}
                        {isAtm && <span style={{ marginLeft: 6, fontSize: 9, background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3, color: "var(--text-muted)" }}>ATM</span>}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
                        ${row.premium.toFixed(2)}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>
                        {(row.delta * 100).toFixed(1)}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>
                        {(row.iv * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        {isSelected && (
                          <span style={{ fontSize: 10, background: "var(--accent)", color: "white", padding: "2px 7px", borderRadius: 3 }}>
                            Selected
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: order panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Summary card */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
              Order Summary
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
                ETH-{strike.toLocaleString()}-{EXPIRIES[expiryIdx].label.replace(" ", "").replace(" ", "")}-{isCall ? "C" : "P"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                European {isCall ? "Call" : "Put"} · Expires {tte}
              </div>
            </div>

            <div style={{ background: "var(--bg-2)", borderRadius: 6, padding: "12px 14px", marginBottom: 14 }}>
              <Row label="Spot" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
              <Row label="Strike" value={`$${strike.toLocaleString()}`} />
              <Row label="Moneyness" value={`${moneynessLabel} (${moneyness}%)`} />
              <Row label="Vol (IV)" value={`${(MOCK_VOL * 100).toFixed(1)}%`} />
              <Row label="Time to Expiry" value={tte} />
            </div>

            {/* Greeks */}
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Greeks
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <Greek label="Δ Delta" value={(bs.delta * 100).toFixed(1)} />
              <Greek label="Γ Gamma" value={bs.gamma.toFixed(4)} />
              <Greek label="Θ Theta" value={`$${bs.theta.toFixed(2)}/d`} />
              <Greek label="ν Vega" value={`$${bs.vega.toFixed(2)}/1%`} />
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Quantity (contracts)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={qBtnStyle}>−</button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 500, textAlign: "center", fontFeatureSettings: '"tnum" 1' }}
                />
                <button onClick={() => setQuantity(quantity + 1)} style={qBtnStyle}>+</button>
              </div>
            </div>

            {/* Premium total */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Unit premium</span>
                <span style={{ fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>${bs.price.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Total cost</span>
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1' }}>
                  ${totalPremium.toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>
                + gas · Hook fee 0.3%
              </div>
            </div>

            <button
              style={{
                width: "100%",
                padding: "11px",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Buy {quantity} {isCall ? "Call" : "Put"}{quantity > 1 ? "s" : ""}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
              Option token minted on purchase. Settlement automated by Reactive Network cron at expiry.
            </p>
          </div>

          {/* Expected move */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Implied Move
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
              ±{bs.impliedMovePercent.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              1σ move by expiry · ${(MOCK_SPOT * bs.impliedMovePercent / 100).toFixed(0)} range
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFeatureSettings: '"tnum" 1', color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function Greek({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-2)", borderRadius: 5, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>{value}</div>
    </div>
  );
}

const qBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "white",
  cursor: "pointer",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
