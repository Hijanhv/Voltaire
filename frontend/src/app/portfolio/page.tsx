"use client";

import { useMemo } from "react";
import { MOCK_SPOT, MOCK_VOL, MOCK_PORTFOLIO, formatTimeToExpiry } from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

export default function Portfolio() {
  const positions = useMemo(() =>
    MOCK_PORTFOLIO.map((p) => {
      const bs = blackScholes({ spot: MOCK_SPOT, strike: p.strike, expiry: p.expiry, vol: MOCK_VOL, isCall: p.isCall });
      const currentValue = bs.price * p.quantity;
      const costBasis = p.avgCost * p.quantity;
      const pnl = currentValue - costBasis;
      const pnlPct = (pnl / costBasis) * 100;
      const intrinsic = p.isCall ? Math.max(MOCK_SPOT - p.strike, 0) : Math.max(p.strike - MOCK_SPOT, 0);
      const timeValue = Math.max(bs.price - intrinsic, 0);
      return { ...p, bs, currentValue, costBasis, pnl, pnlPct, intrinsic, timeValue };
    }), []);

  const totalCost = positions.reduce((a, p) => a + p.costBasis, 0);
  const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }} className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Portfolio
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          Open positions · Valued using live Black-Scholes
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {positions.map((p) => (
          <div key={p.id} className="card" style={{ padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 16, fontWeight: 700, color: "var(--forest)" }}>{p.ticker}</span>
                  <TypeBadge isCall={p.isCall} />
                  <MoneyBadge spot={MOCK_SPOT} strike={p.strike} isCall={p.isCall} />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {p.quantity} contract{p.quantity > 1 ? "s" : ""} · Expires {formatTimeToExpiry(p.expiry)} · Strike ${p.strike.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 20, fontWeight: 700, color: "var(--forest)", fontFeatureSettings: '"tnum" 1' }}>
                  ${p.currentValue.toFixed(2)}
                </div>
                <div style={{ fontSize: 12.5, color: p.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
                  {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%)
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <Metric label="Avg Cost" value={`$${p.avgCost.toFixed(2)}`} />
              <Metric label="Current" value={`$${p.bs.price.toFixed(2)}`} />
              <Metric label="Intrinsic" value={`$${p.intrinsic.toFixed(2)}`} />
              <Metric label="Time Value" value={`$${p.timeValue.toFixed(2)}`} />
              <Metric label="Delta" value={(p.bs.delta * 100).toFixed(1)} />
              <Metric label="Theta/d" value={`$${p.bs.theta.toFixed(2)}`} valueColor={p.bs.theta < 0 ? "var(--red)" : undefined} />
            </div>

            {/* Value breakdown bar */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Value breakdown</div>
              <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {p.bs.price > 0 && (
                  <>
                    <div style={{ width: `${(p.intrinsic / p.bs.price) * 100}%`, background: "var(--green)", opacity: 0.7, borderRadius: "3px 0 0 3px" }} />
                    <div style={{ flex: 1, background: "var(--forest)", opacity: 0.4 }} />
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <Legend color="var(--green)" label={`Intrinsic $${p.intrinsic.toFixed(2)}`} />
                <Legend color="var(--forest)" label={`Time $${p.timeValue.toFixed(2)}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement info */}
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
        <button style={{
          marginTop: 14,
          padding: "8px 18px",
          border: "1px solid var(--forest)",
          borderRadius: 8,
          background: "transparent",
          color: "var(--forest)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--forest)"; e.currentTarget.style.color = "#f6f1ea"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--forest)"; }}
        >
          Claim Expired Positions
        </button>
      </div>
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
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: "0.05em",
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
  const bg = atm ? "var(--gold-bg)" : itm ? "var(--green-bg)" : "var(--bg-3)";
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
