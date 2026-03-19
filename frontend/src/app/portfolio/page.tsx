"use client";

import { useState } from "react";
import { useConnection, useWriteContract } from "wagmi";
import { useEthPrice, useVolatility, useActiveSeries, usePortfolio } from "@/lib/hooks";
import { blackScholes } from "@/lib/blackScholes";
import { formatTimeToExpiry } from "@/lib/mockData";
import { CONTRACTS, HOOK_ABI } from "@/lib/config";

export default function Portfolio() {
  const [claimState, setClaimState] = useState<"idle" | "pending" | "done" | "error">("idle");

  const connection  = useConnection();
  const isConnected = connection?.status === "connected";
  const { writeContractAsync: sendTx } = useWriteContract();

  const { price: spot, loading: priceLoading } = useEthPrice();
  const { vol }                                 = useVolatility();

  const liveSpot = spot > 0 ? spot : 3000;
  const liveVol  = vol  > 0 ? vol  : 0.7;

  const { activeSeries, loading: seriesLoading } = useActiveSeries(liveSpot, liveVol);
  const { positions, address, loading: portfolioLoading } = usePortfolio(activeSeries, liveSpot, liveVol);

  const totalCost  = positions.reduce((a, p) => a + p.avgCost  * p.quantity, 0);
  const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
  const totalPnl   = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  async function handleClaim(seriesId: number) {
    if (!isConnected) { alert("Connect your wallet first."); return; }
    try {
      setClaimState("pending");
      await sendTx({
        address: CONTRACTS.optionsHook,
        abi: HOOK_ABI,
        functionName: "claimSettlement",
        args: [BigInt(seriesId)],
      });
      setClaimState("done");
      setTimeout(() => setClaimState("idle"), 4000);
    } catch {
      setClaimState("error");
      setTimeout(() => setClaimState("idle"), 3000);
    }
  }

  const loading = priceLoading || seriesLoading || portfolioLoading;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }} className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Portfolio
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          {address
            ? `${address.slice(0, 6)}…${address.slice(-4)} · Live Black-Scholes valuation`
            : "Connect wallet to view positions"}
        </p>
      </div>

      {!isConnected ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>Connect your wallet to see your option positions.</div>
        </div>
      ) : loading ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading positions…</div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            <SumCard label="Cost Basis"    value={`$${totalCost.toFixed(2)}`} />
            <SumCard label="Current Value" value={`$${totalValue.toFixed(2)}`} />
            <SumCard
              label="Total P&L"
              value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
              sub={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%`}
              color={totalPnl >= 0 ? "var(--green)" : "var(--red)"}
            />
            <SumCard label="Positions" value={String(positions.length)} sub="open" />
          </div>

          {/* Positions */}
          {positions.length === 0 ? (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>No option positions found.</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Buy options on the Trade page to see them here.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              {positions.map((p) => {
                const intrinsic  = p.isCall ? Math.max(liveSpot - p.strike, 0) : Math.max(p.strike - liveSpot, 0);
                const timeValue  = Math.max(p.bs.price - intrinsic, 0);
                const pnl        = p.currentValue - p.avgCost * p.quantity;
                const pnlPct     = p.avgCost > 0 ? (pnl / (p.avgCost * p.quantity)) * 100 : 0;
                return (
                  <div key={p.id} className="card" style={{ padding: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 18 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                          <span style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 16, fontWeight: 700, color: "var(--forest)" }}>{p.ticker}</span>
                          <TypeBadge isCall={p.isCall} />
                          <MoneyBadge spot={liveSpot} strike={p.strike} isCall={p.isCall} />
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {p.quantity.toFixed(4)} contract{p.quantity !== 1 ? "s" : ""} · Expires {formatTimeToExpiry(p.expiry)} · Strike ${p.strike.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 20, fontWeight: 700, color: "var(--forest)", fontFeatureSettings: '"tnum" 1' }}>
                          ${p.currentValue.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 12.5, color: pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                      <Metric label="Price/unit" value={`$${p.bs.price.toFixed(2)}`} />
                      <Metric label="Intrinsic"  value={`$${intrinsic.toFixed(2)}`} />
                      <Metric label="Time Value" value={`$${timeValue.toFixed(2)}`} />
                      <Metric label="Delta"      value={(p.bs.delta * 100).toFixed(1)} />
                      <Metric label="Theta/d"    value={`$${p.bs.theta.toFixed(2)}`} valueColor={p.bs.theta < 0 ? "var(--red)" : undefined} />
                      <Metric label="Qty"        value={p.quantity.toFixed(4)} />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Value breakdown</div>
                      <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                        {p.bs.price > 0 && (
                          <>
                            <div style={{ width: `${(intrinsic / p.bs.price) * 100}%`, background: "var(--green)", opacity: 0.7, borderRadius: "3px 0 0 3px" }} />
                            <div style={{ flex: 1, background: "var(--forest)", opacity: 0.4 }} />
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                        <Legend color="var(--green)"  label={`Intrinsic $${intrinsic.toFixed(2)}`} />
                        <Legend color="var(--forest)" label={`Time $${timeValue.toFixed(2)}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Settlement panel */}
          <div className="card" style={{ padding: 22, background: "var(--forest-dim)", border: "1px solid var(--forest-mid)" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "var(--forest)" }}>
              Automated Settlement
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
              Reactive Network monitors expiry timestamps and automatically calls{" "}
              <code style={{ fontSize: 11, background: "rgba(44,72,57,0.1)", padding: "1px 5px", borderRadius: 4, color: "var(--forest)" }}>
                settleExpiredSeries()
              </code>{" "}
              at expiry. If your option expires in-the-money, claim your payout via{" "}
              <code style={{ fontSize: 11, background: "rgba(44,72,57,0.1)", padding: "1px 5px", borderRadius: 4, color: "var(--forest)" }}>
                claimSettlement(seriesId)
              </code>.
            </p>

            {claimState !== "idle" && (
              <div style={{
                marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                background: claimState === "done" ? "var(--green-bg)" : claimState === "error" ? "rgba(155,58,42,0.08)" : "rgba(44,72,57,0.08)",
                color: claimState === "done" ? "var(--green)" : claimState === "error" ? "var(--red)" : "var(--forest)",
              }}>
                {claimState === "pending" ? "Claiming settlement…" : claimState === "done" ? "Settlement claimed!" : "Claim failed — try again."}
              </div>
            )}

            {positions.filter((p) => {
              const isExpired = Date.now() / 1000 > p.expiry;
              const itm = p.isCall ? liveSpot > p.strike : liveSpot < p.strike;
              return isExpired && itm;
            }).length > 0 ? (
              positions
                .filter((p) => {
                  const isExpired = Date.now() / 1000 > p.expiry;
                  const itm = p.isCall ? liveSpot > p.strike : liveSpot < p.strike;
                  return isExpired && itm;
                })
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleClaim(p.id)}
                    disabled={claimState === "pending"}
                    style={{
                      marginTop: 14, padding: "8px 18px",
                      border: "1px solid var(--forest)", borderRadius: 8,
                      background: claimState === "pending" ? "var(--forest-dim)" : "transparent",
                      color: "var(--forest)", fontSize: 12, fontWeight: 500,
                      cursor: claimState === "pending" ? "not-allowed" : "pointer",
                      transition: "all 0.15s", display: "block",
                    }}
                    onMouseEnter={e => { if (claimState !== "pending") { e.currentTarget.style.background = "var(--forest)"; e.currentTarget.style.color = "#f6f1ea"; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = claimState === "pending" ? "var(--forest-dim)" : "transparent"; e.currentTarget.style.color = "var(--forest)"; }}
                  >
                    {claimState === "pending" ? "Claiming…" : `Claim ${p.ticker}`}
                  </button>
                ))
            ) : (
              <button
                disabled
                style={{
                  marginTop: 14, padding: "8px 18px",
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "transparent", color: "var(--text-muted)",
                  fontSize: 12, fontWeight: 500, cursor: "not-allowed",
                }}
              >
                No expired ITM positions
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SumCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 20, fontWeight: 700, color: color ?? "var(--forest)", fontFeatureSettings: '"tnum" 1' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: color ?? "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Metric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: valueColor ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function TypeBadge({ isCall }: { isCall: boolean }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 9.5, fontWeight: 600, letterSpacing: "0.05em",
      background: isCall ? "var(--green-bg)" : "var(--red-bg)",
      color: isCall ? "var(--green)" : "var(--red)",
      border: `1px solid ${isCall ? "rgba(45,106,79,0.15)" : "rgba(155,58,42,0.15)"}`,
    }}>
      {isCall ? "CALL" : "PUT"}
    </span>
  );
}

function MoneyBadge({ spot, strike, isCall }: { spot: number; strike: number; isCall: boolean }) {
  const itm = isCall ? spot > strike : spot < strike;
  const atm = Math.abs(spot - strike) < 50;
  const label = atm ? "ATM" : itm ? "ITM" : "OTM";
  const color = atm ? "var(--gold)" : itm ? "var(--green)" : "var(--text-muted)";
  const bg    = atm ? "var(--gold-bg)" : itm ? "var(--green-bg)" : "var(--bg-3)";
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.05em", background: bg, color }}>
      {label}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, opacity: 0.75 }} />
      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
