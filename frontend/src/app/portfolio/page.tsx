"use client";

import { useMemo } from "react";
import { MOCK_SPOT, MOCK_VOL, MOCK_PORTFOLIO, formatTimeToExpiry } from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

export default function Portfolio() {
  const positions = useMemo(() =>
    MOCK_PORTFOLIO.map((p) => {
      const bs = blackScholes({
        spot: MOCK_SPOT,
        strike: p.strike,
        expiry: p.expiry,
        vol: MOCK_VOL,
        isCall: p.isCall,
      });
      const currentValue = bs.price * p.quantity;
      const costBasis = p.avgCost * p.quantity;
      const pnl = currentValue - costBasis;
      const pnlPct = (pnl / costBasis) * 100;
      const intrinsic = p.isCall
        ? Math.max(MOCK_SPOT - p.strike, 0)
        : Math.max(p.strike - MOCK_SPOT, 0);
      const timeValue = Math.max(bs.price - intrinsic, 0);
      return { ...p, bs, currentValue, costBasis, pnl, pnlPct, intrinsic, timeValue };
    }),
    []
  );

  const totalCost = positions.reduce((a, p) => a + p.costBasis, 0);
  const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
          Option Portfolio
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Your open option positions · Valued using live Black-Scholes
        </p>
      </div>

      {/* Portfolio summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <SumCard label="Cost Basis" value={`$${totalCost.toFixed(2)}`} />
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
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {positions.map((p) => (
          <div key={p.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{p.ticker}</span>
                  <TypeBadge isCall={p.isCall} />
                  <MoneybadgeBadge spot={MOCK_SPOT} strike={p.strike} isCall={p.isCall} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {p.quantity} contract{p.quantity > 1 ? "s" : ""} · Expires {formatTimeToExpiry(p.expiry)} · Strike ${p.strike.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1' }}>
                  ${p.currentValue.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: p.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
                  {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%)
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <Metric label="Avg Cost" value={`$${p.avgCost.toFixed(2)}`} />
              <Metric label="Current" value={`$${p.bs.price.toFixed(2)}`} />
              <Metric label="Intrinsic" value={`$${p.intrinsic.toFixed(2)}`} />
              <Metric label="Time Value" value={`$${p.timeValue.toFixed(2)}`} />
              <Metric label="Delta" value={(p.bs.delta * 100).toFixed(1)} />
              <Metric label="Theta/d" value={`$${p.bs.theta.toFixed(2)}`} valueColor={p.bs.theta < 0 ? "var(--red)" : undefined} />
            </div>

            {/* Value breakdown bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5 }}>Value breakdown</div>
              <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {p.bs.price > 0 && (
                  <>
                    <div style={{ width: `${(p.intrinsic / p.bs.price) * 100}%`, background: "var(--green)", borderRadius: "3px 0 0 3px" }} />
                    <div style={{ flex: 1, background: "var(--blue)" }} />
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
                <Legend color="var(--green)" label={`Intrinsic $${p.intrinsic.toFixed(2)}`} />
                <Legend color="var(--blue)" label={`Time $${p.timeValue.toFixed(2)}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement info */}
      <div className="card" style={{ padding: 20, background: "var(--blue-bg)", border: "1px solid #c8d8f0" }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, color: "var(--blue)" }}>
          Automated Settlement
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          Reactive Network monitors expiry timestamps and automatically calls{" "}
          <code style={{ fontSize: 10, background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>
            settleExpiredSeries()
          </code>{" "}
          at expiry using on-chain cron. If your option expires in-the-money, you can claim your payout
          by calling{" "}
          <code style={{ fontSize: 10, background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>
            claimSettlement(seriesId)
          </code>
          {" "}— or use the button below.
        </p>
        <button
          style={{ marginTop: 12, padding: "7px 16px", border: "1px solid var(--blue)", borderRadius: 6, background: "white", color: "var(--blue)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >
          Claim Expired Positions
        </button>
      </div>
    </div>
  );
}

function SumCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: color ?? "var(--text-primary)", fontFeatureSettings: '"tnum" 1' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: color ?? "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Metric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: valueColor ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function TypeBadge({ isCall }: { isCall: boolean }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", background: isCall ? "var(--green-bg)" : "var(--red-bg)", color: isCall ? "var(--green)" : "var(--red)" }}>
      {isCall ? "CALL" : "PUT"}
    </span>
  );
}

function MoneybadgeBadge({ spot, strike, isCall }: { spot: number; strike: number; isCall: boolean }) {
  const itm = isCall ? spot > strike : spot < strike;
  const atm = Math.abs(spot - strike) < 50;
  const label = atm ? "ATM" : itm ? "ITM" : "OTM";
  const color = atm ? "#b45309" : itm ? "var(--green)" : "var(--text-muted)";
  const bg = atm ? "#fffbeb" : itm ? "var(--green-bg)" : "var(--bg-3)";
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", background: bg, color }}>
      {label}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
