"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MOCK_VAULT, formatCompact } from "@/lib/mockData";

// Simulated earnings history
const EARNINGS_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  premiums: Math.round(4000 + i * 320 + (Math.random() - 0.4) * 800),
  cumulative: Math.round(80_000 + i * 3_500 + (Math.random() - 0.3) * 1_000),
}));

const ACTIVE_LOCKS = [
  { series: "ETH-3200-MAR26-C", locked: 640_000, pct: 22 },
  { series: "ETH-3400-MAR26-C", locked: 440_000, pct: 15 },
  { series: "ETH-3000-MAR26-P", compressed: false, locked: 316_000, pct: 11 },
  { series: "ETH-3500-APR26-C", locked: 256_000, pct: 9 },
  { series: "ETH-2800-APR26-P", locked: 145_000, pct: 5 },
];

export default function Vault() {
  const [depositAmount, setDepositAmount] = useState("");
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  const utilPct = (MOCK_VAULT.utilized / MOCK_VAULT.totalCollateral) * 100;
  const available = MOCK_VAULT.totalCollateral - MOCK_VAULT.utilized;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
          Collateral Vault
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Deposit USDC to underwrite options · Earn premiums from every option sold
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <VaultKpi label="Total Deposits" value={formatCompact(MOCK_VAULT.totalCollateral)} sub="USDC" />
            <VaultKpi label="Utilization" value={`${utilPct.toFixed(1)}%`} sub={`${formatCompact(MOCK_VAULT.utilized)} locked`} color={utilPct > 80 ? "var(--red)" : "var(--text-primary)"} />
            <VaultKpi label="Est. APY" value={`${(MOCK_VAULT.apy * 100).toFixed(1)}%`} sub="from premiums" color="var(--green)" />
          </div>

          {/* Utilization bar */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Vault Utilization</span>
              <span style={{ fontSize: 12, fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>
                {formatCompact(available)} available
              </span>
            </div>
            <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              <div
                style={{
                  height: "100%",
                  width: `${utilPct}%`,
                  background: utilPct > 80 ? "var(--red)" : utilPct > 60 ? "#b45309" : "var(--green)",
                  borderRadius: 4,
                  transition: "width 0.5s",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {ACTIVE_LOCKS.map((l) => (
                <div key={l.series} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{l.series.split("-").slice(1, 3).join("-")}</div>
                  <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${l.pct * 4}%`, background: "var(--blue)", borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{l.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Premiums chart */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                  Cumulative Premiums Earned (30d)
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1' }}>
                  {formatCompact(MOCK_VAULT.premiumsEarned)}
                </div>
              </div>
              <div style={{ fontSize: 11, padding: "3px 8px", background: "var(--green-bg)", color: "var(--green)", borderRadius: 4, fontWeight: 500 }}>
                +{(MOCK_VAULT.apy * 100).toFixed(1)}% APY
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={EARNINGS_HISTORY}>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => [formatCompact(v as number), "Cumulative"]}
                  contentStyle={{ background: "white", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="var(--green)"
                  strokeWidth={1.5}
                  fill="var(--green-bg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Active locks table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 500 }}>
              Collateral Locks by Series
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Series", "Locked (USDC)", "Share"].map((h) => (
                    <th key={h} style={{ padding: "8px 20px", textAlign: h === "Series" ? "left" : "right", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIVE_LOCKS.map((l, i) => (
                  <tr key={l.series} style={{ borderBottom: i < ACTIVE_LOCKS.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "9px 20px", fontWeight: 500 }}>{l.series}</td>
                    <td style={{ padding: "9px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1' }}>{formatCompact(l.locked)}</td>
                    <td style={{ padding: "9px 20px", textAlign: "right", color: "var(--text-secondary)", fontFeatureSettings: '"tnum" 1' }}>{l.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: deposit/withdraw panel */}
        <div>
          <div className="card" style={{ padding: 20 }}>
            {/* Tab */}
            <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 7, padding: 2, gap: 2, marginBottom: 18 }}>
              {(["deposit", "withdraw"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    borderRadius: 5,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: tab === t ? "white" : "transparent",
                    color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Your position */}
            <div style={{ background: "var(--bg-2)", borderRadius: 6, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Your Position
              </div>
              <VRow label="Deposited" value="$50,000.00" />
              <VRow label="Current value" value="$54,280.00" />
              <VRow label="Premiums earned" value="$4,280.00" />
              <VRow label="Yield (30d)" value="+8.56%" valueColor="var(--green)" />
            </div>

            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Amount (USDC)
            </label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ width: "100%", padding: "9px 10px 9px 22px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, fontFeatureSettings: '"tnum" 1' }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {["25%", "50%", "Max"].map((p) => (
                <button
                  key={p}
                  style={{ flex: 1, padding: "5px 0", border: "1px solid var(--border)", borderRadius: 5, fontSize: 11, background: "white", cursor: "pointer", color: "var(--text-secondary)" }}
                >
                  {p}
                </button>
              ))}
            </div>

            {tab === "deposit" && (
              <div style={{ background: "var(--green-bg)", borderRadius: 6, padding: "10px 12px", marginBottom: 14, fontSize: 11, color: "var(--green)" }}>
                Estimated yield: <strong>17.3% APY</strong> based on current premium rates
              </div>
            )}

            <button
              style={{
                width: "100%",
                padding: 11,
                background: tab === "deposit" ? "var(--accent)" : "white",
                color: tab === "deposit" ? "white" : "var(--text-primary)",
                border: `1px solid ${tab === "deposit" ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {tab === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
              {tab === "deposit"
                ? "Deposits earn premiums from every option sold. Collateral is locked proportionally while series are open."
                : "Withdrawal available up to unused collateral. Locked collateral is released at series expiry."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VaultKpi({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: color ?? "var(--text-primary)", fontFeatureSettings: '"tnum" 1' }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function VRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFeatureSettings: '"tnum" 1', fontWeight: 500, color: valueColor ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
