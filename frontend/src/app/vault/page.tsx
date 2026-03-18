"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MOCK_VAULT, formatCompact } from "@/lib/mockData";

const EARNINGS_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  cumulative: Math.round(80_000 + i * 3_500 + (Math.random() - 0.3) * 1_000),
}));

const ACTIVE_LOCKS = [
  { series: "ETH-3200-MAR26-C", locked: 640_000, pct: 22 },
  { series: "ETH-3400-MAR26-C", locked: 440_000, pct: 15 },
  { series: "ETH-3000-MAR26-P", locked: 316_000, pct: 11 },
  { series: "ETH-3500-APR26-C", locked: 256_000, pct: 9 },
  { series: "ETH-2800-APR26-P", locked: 145_000, pct: 5 },
];

export default function Vault() {
  const [depositAmount, setDepositAmount] = useState("");
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  const utilPct = (MOCK_VAULT.utilized / MOCK_VAULT.totalCollateral) * 100;
  const available = MOCK_VAULT.totalCollateral - MOCK_VAULT.utilized;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }} className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Collateral Vault
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          Deposit USDC · Underwrite options · Earn premiums
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 18 }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <VaultKpi label="Total Deposits" value={formatCompact(MOCK_VAULT.totalCollateral)} sub="USDC" />
            <VaultKpi label="Utilization" value={`${utilPct.toFixed(1)}%`} sub={`${formatCompact(MOCK_VAULT.utilized)} locked`} color={utilPct > 80 ? "var(--red)" : "var(--forest)"} />
            <VaultKpi label="Est. APY" value={`${(MOCK_VAULT.apy * 100).toFixed(1)}%`} sub="from premiums" color="var(--green)" />
          </div>

          {/* Utilization bar */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Vault Utilization</span>
              <span style={{ fontSize: 12, fontFeatureSettings: '"tnum" 1', color: "var(--text-muted)" }}>{formatCompact(available)} available</span>
            </div>
            <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%",
                width: `${utilPct}%`,
                background: utilPct > 80 ? "var(--red)" : "var(--forest)",
                borderRadius: 4,
                opacity: 0.75,
                transition: "width 0.5s",
              }} />
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {ACTIVE_LOCKS.map((l) => (
                <div key={l.series} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 3 }}>{l.series.split("-").slice(1, 3).join("-")}</div>
                  <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${l.pct * 4}%`, background: "var(--forest)", borderRadius: 2, opacity: 0.55 }} />
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3 }}>{l.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Premiums chart */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                  Cumulative Premiums (30d)
                </div>
                <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 24, fontWeight: 700, color: "var(--forest)", fontFeatureSettings: '"tnum" 1' }}>
                  {formatCompact(MOCK_VAULT.premiumsEarned)}
                </div>
              </div>
              <div style={{ fontSize: 11, padding: "4px 10px", background: "var(--green-bg)", color: "var(--green)", borderRadius: 6, fontWeight: 500, border: "1px solid rgba(45,106,79,0.15)" }}>
                +{(MOCK_VAULT.apy * 100).toFixed(1)}% APY
              </div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={EARNINGS_HISTORY}>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => [formatCompact(v as number), "Cumulative"]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <Area type="monotone" dataKey="cumulative" stroke="var(--forest)" strokeWidth={1.8} fill="var(--forest-dim)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Locks table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Collateral by Series
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Series", "Locked (USDC)", "Share"].map((h) => (
                    <th key={h} style={{ padding: "9px 22px", textAlign: h === "Series" ? "left" : "right", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIVE_LOCKS.map((l, i) => (
                  <tr key={l.series} style={{ borderBottom: i < ACTIVE_LOCKS.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "10px 22px", fontWeight: 500, color: "var(--text-primary)" }}>{l.series}</td>
                    <td style={{ padding: "10px 22px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--forest)" }}>{formatCompact(l.locked)}</td>
                    <td style={{ padding: "10px 22px", textAlign: "right", color: "var(--text-muted)", fontFeatureSettings: '"tnum" 1' }}>{l.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: deposit panel */}
        <div>
          <div className="card" style={{ padding: 22 }}>
            {/* Tabs */}
            <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 9, padding: 3, gap: 2, marginBottom: 20 }}>
              {(["deposit", "withdraw"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 7,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: tab === t ? "var(--surface)" : "transparent",
                  color: tab === t ? "var(--forest)" : "var(--text-muted)",
                  boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
                  textTransform: "capitalize",
                  transition: "all 0.15s",
                }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Your position */}
            <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "13px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                Your Position
              </div>
              <VRow label="Deposited" value="$50,000.00" />
              <VRow label="Current value" value="$54,280.00" />
              <VRow label="Premiums earned" value="$4,280.00" />
              <VRow label="Yield (30d)" value="+8.56%" valueColor="var(--green)" />
            </div>

            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Amount (USDC)</label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ width: "100%", padding: "10px 12px 10px 26px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFeatureSettings: '"tnum" 1', background: "var(--surface)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>

            {/* Quick amounts */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {["25%", "50%", "Max"].map((p) => (
                <button key={p} style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "1px solid var(--border)",
                  borderRadius: 7,
                  fontSize: 11,
                  background: "var(--surface)",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--forest)"; e.currentTarget.style.color = "var(--forest)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  {p}
                </button>
              ))}
            </div>

            {tab === "deposit" && (
              <div style={{ background: "var(--green-bg)", borderRadius: 8, padding: "10px 13px", marginBottom: 16, fontSize: 11, color: "var(--green)", border: "1px solid rgba(45,106,79,0.15)" }}>
                Estimated yield: <strong>17.3% APY</strong> based on current premium rates
              </div>
            )}

            <button style={{
              width: "100%",
              padding: 12,
              background: tab === "deposit" ? "var(--forest)" : "var(--surface)",
              color: tab === "deposit" ? "#f6f1ea" : "var(--text-primary)",
              border: `1px solid ${tab === "deposit" ? "var(--forest)" : "var(--border)"}`,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {tab === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.55 }}>
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
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: color ?? "var(--text-primary)", fontFeatureSettings: '"tnum" 1' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function VRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFeatureSettings: '"tnum" 1', fontWeight: 500, color: valueColor ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
