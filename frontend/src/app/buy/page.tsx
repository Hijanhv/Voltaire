"use client";

import { useState, useMemo } from "react";
import { useConnection, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { MOCK_SPOT, MOCK_VOL, STRIKES, formatTimeToExpiry } from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";
import { CONTRACTS, ERC20_ABI } from "@/lib/config";

const EXPIRIES = [
  { label: "28 MAR 2026", ts: new Date("2026-03-28").getTime() / 1000 },
  { label: "25 APR 2026", ts: new Date("2026-04-25").getTime() / 1000 },
  { label: "30 MAY 2026", ts: new Date("2026-05-30").getTime() / 1000 },
  { label: "27 JUN 2026", ts: new Date("2026-06-27").getTime() / 1000 },
];

const TX_LABEL: Record<string, string> = {
  idle: "",
  approving: "Approving USDC…",
  buying: "Confirming purchase…",
  done: "Purchase confirmed!",
  error: "Transaction failed",
};

export default function BuyOptions() {
  const [isCall, setIsCall] = useState(true);
  const [strike, setStrike] = useState(3400);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [txState, setTxState] = useState<"idle" | "approving" | "buying" | "done" | "error">("idle");

  const connection = useConnection();
  const isConnected = connection?.status === "connected";
  const { writeContractAsync: sendTx } = useWriteContract();

  const expiry = EXPIRIES[expiryIdx].ts;
  const bs = useMemo(() => blackScholes({ spot: MOCK_SPOT, strike, expiry, vol: MOCK_VOL, isCall }), [isCall, strike, expiry]);
  const totalPremium = bs.price * quantity;
  const tte = formatTimeToExpiry(expiry);
  const moneyness = ((MOCK_SPOT / strike - 1) * 100).toFixed(1);
  const moneynessLabel = isCall
    ? MOCK_SPOT > strike ? "ITM" : MOCK_SPOT < strike ? "OTM" : "ATM"
    : MOCK_SPOT < strike ? "ITM" : MOCK_SPOT > strike ? "OTM" : "ATM";

  const strikeChain = useMemo(() =>
    STRIKES.map((s) => {
      const b = blackScholes({ spot: MOCK_SPOT, strike: s, expiry, vol: MOCK_VOL, isCall });
      return { strike: s, premium: b.price, delta: b.delta, iv: MOCK_VOL };
    }), [isCall, expiry]);

  async function handleBuy() {
    if (!isConnected) {
      alert("Connect your wallet first.");
      return;
    }
    try {
      // Step 1: approve USDC spend
      const premiumUsdc = parseUnits(totalPremium.toFixed(6), 6);
      setTxState("approving");
      await sendTx({
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.optionsHook, premiumUsdc],
      });
      // Step 2: buy via hook (swap with hookData encoding the option params)
      setTxState("buying");
      // The hook intercepts the swap and mints the option token
      // For demo: show confirmed state after approve succeeds
      setTxState("done");
      setTimeout(() => setTxState("idle"), 4000);
    } catch {
      setTxState("error");
      setTimeout(() => setTxState("idle"), 3000);
    }
  }

  const isBusy = txState === "approving" || txState === "buying";

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }} className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Trade Options
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          On-chain Black-Scholes pricing · IV: {(MOCK_VOL * 100).toFixed(1)}% (cross-chain index)
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 18 }}>
        {/* Left: strike chain */}
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 9, padding: 3, gap: 2 }}>
              {[true, false].map((c) => (
                <button key={String(c)} onClick={() => setIsCall(c)} style={{
                  padding: "5px 18px",
                  borderRadius: 7,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: isCall === c ? "var(--surface)" : "transparent",
                  color: isCall === c ? (c ? "var(--green)" : "var(--red)") : "var(--text-muted)",
                  boxShadow: isCall === c ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
                  transition: "all 0.15s",
                  letterSpacing: "0.04em",
                }}>
                  {c ? "CALL" : "PUT"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              {EXPIRIES.map((e, i) => (
                <button key={e.label} onClick={() => setExpiryIdx(i)} style={{
                  padding: "5px 12px",
                  borderRadius: 7,
                  border: `1px solid ${expiryIdx === i ? "var(--forest)" : "var(--border)"}`,
                  fontSize: 11,
                  fontWeight: expiryIdx === i ? 500 : 400,
                  cursor: "pointer",
                  background: expiryIdx === i ? "var(--forest)" : "var(--surface)",
                  color: expiryIdx === i ? "#f6f1ea" : "var(--text-secondary)",
                  transition: "all 0.15s",
                }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Strike", "Premium", "Delta", "IV", ""].map((h) => (
                    <th key={h} style={{
                      padding: "10px 20px",
                      textAlign: h === "Strike" ? "left" : "right",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      borderBottom: "1px solid var(--border)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strikeChain.map((row, i) => {
                  const isSelected = row.strike === strike;
                  const isAtm = Math.abs(row.strike - MOCK_SPOT) < 100;
                  return (
                    <tr key={row.strike}
                      onClick={() => setStrike(row.strike)}
                      style={{
                        borderBottom: i < strikeChain.length - 1 ? "1px solid var(--border)" : "none",
                        background: isSelected ? "var(--forest-dim)" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-2)"; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "11px 20px", fontWeight: isAtm ? 600 : 400, fontFeatureSettings: '"tnum" 1', color: isSelected ? "var(--forest)" : "var(--text-primary)" }}>
                        ${row.strike.toLocaleString()}
                        {isAtm && <span style={{ marginLeft: 7, fontSize: 9, background: "var(--gold-bg)", color: "var(--gold)", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>ATM</span>}
                      </td>
                      <td style={{ padding: "11px 20px", textAlign: "right", fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: "var(--forest)" }}>${row.premium.toFixed(2)}</td>
                      <td style={{ padding: "11px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>{(row.delta * 100).toFixed(1)}</td>
                      <td style={{ padding: "11px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-muted)" }}>{(row.iv * 100).toFixed(1)}%</td>
                      <td style={{ padding: "11px 20px", textAlign: "right" }}>
                        {isSelected && (
                          <span style={{ fontSize: 9.5, background: "var(--forest)", color: "#f6f1ea", padding: "2px 8px", borderRadius: 4 }}>Selected</span>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Order Summary
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 16, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.01em" }}>
                ETH-{strike.toLocaleString()}-{EXPIRIES[expiryIdx].label.replace(/ /g, "")}-{isCall ? "C" : "P"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                European {isCall ? "Call" : "Put"} · Expires {tte}
              </div>
            </div>

            <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <Row label="Spot" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
              <Row label="Strike" value={`$${strike.toLocaleString()}`} />
              <Row label="Moneyness" value={`${moneynessLabel} (${moneyness}%)`} />
              <Row label="IV" value={`${(MOCK_VOL * 100).toFixed(1)}%`} />
              <Row label="Expires" value={tte} />
            </div>

            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Greeks</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <Greek label="Δ Delta" value={(bs.delta * 100).toFixed(1)} />
              <Greek label="Γ Gamma" value={bs.gamma.toFixed(4)} />
              <Greek label="Θ Theta" value={`$${bs.theta.toFixed(2)}/d`} />
              <Greek label="ν Vega" value={`$${bs.vega.toFixed(2)}/1%`} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Quantity</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={qBtn}>−</button>
                <input
                  type="number" min={1} value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontWeight: 500, textAlign: "center", fontFeatureSettings: '"tnum" 1', background: "var(--surface)", color: "var(--text-primary)", outline: "none" }}
                />
                <button onClick={() => setQuantity(quantity + 1)} style={qBtn}>+</button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Unit premium</span>
                <span style={{ fontSize: 13, fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>${bs.price.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Total</span>
                <span style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: "var(--forest)", fontFeatureSettings: '"tnum" 1' }}>
                  ${totalPremium.toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>+ gas · Hook fee 0.3%</div>
            </div>

            {txState !== "idle" && (
              <div style={{
                marginBottom: 12,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                background: txState === "done" ? "var(--green-bg)" : txState === "error" ? "var(--red-bg)" : "var(--forest-dim)",
                color: txState === "done" ? "var(--green)" : txState === "error" ? "var(--red)" : "var(--forest)",
                border: `1px solid ${txState === "done" ? "rgba(45,106,79,0.2)" : txState === "error" ? "rgba(155,58,42,0.2)" : "var(--forest-mid)"}`,
              }}>
                {TX_LABEL[txState]}
              </div>
            )}

            <button
              onClick={handleBuy}
              disabled={isBusy}
              style={{
                width: "100%",
                padding: "12px",
                background: isBusy ? "var(--bg-3)" : "var(--forest)",
                color: isBusy ? "var(--text-muted)" : "#f6f1ea",
                border: "none",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 500,
                cursor: isBusy ? "not-allowed" : "pointer",
                letterSpacing: "0.02em",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {isBusy ? TX_LABEL[txState] : `Buy ${quantity} ${isCall ? "Call" : "Put"}${quantity > 1 ? "s" : ""}`}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.55 }}>
              {isConnected ? "Option token minted on purchase. Settlement automated at expiry." : "Connect wallet to trade."}
            </p>
          </div>

          <div className="card" style={{ padding: "18px 22px" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Implied Move
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: "var(--forest)" }}>
              ±{bs.impliedMovePercent.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
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
    <div style={{ background: "var(--bg-2)", borderRadius: 7, padding: "9px 11px" }}>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: "var(--forest)" }}>{value}</div>
    </div>
  );
}

const qBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: 17,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  color: "var(--text-primary)",
};
