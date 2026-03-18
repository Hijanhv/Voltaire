"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  MOCK_SPOT, MOCK_VOL, CHAIN_VOL_DATA, VOL_HISTORY,
  ACTIVE_SERIES, MOCK_VAULT, formatCompact, formatTimeToExpiry,
} from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

export default function Dashboard() {
  const seriesWithPremiums = useMemo(() =>
    ACTIVE_SERIES.map((s) => {
      const bs = blackScholes({ spot: MOCK_SPOT, strike: s.strike, expiry: s.expiry, vol: MOCK_VOL, isCall: s.isCall });
      return { ...s, premium: bs.price };
    }), []);

  const totalOI = seriesWithPremiums.reduce((a, s) => a + s.openInterest, 0);
  const totalVol24h = seriesWithPremiums.reduce((a, s) => a + s.volume24h, 0);
  const volChartData = VOL_HISTORY.map((d, i) => ({ i, vol: +(d.vol * 100).toFixed(2) }));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }} className="fade-in">
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Market Overview
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          Cross-chain realized volatility · Aggregated from Ethereum, Arbitrum, Base & BSC
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <KpiCard label="ETH Spot" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} sub="Live price" />
        <KpiCard label="Vol Index" value={`${(MOCK_VOL * 100).toFixed(1)}%`} sub="4-chain realized" accent />
        <KpiCard label="Open Interest" value={totalOI.toLocaleString()} sub={`${totalVol24h} contracts (24h)`} />
        <KpiCard label="Vault TVL" value={formatCompact(MOCK_VAULT.totalCollateral)} sub={`${(MOCK_VAULT.apy * 100).toFixed(1)}% APY`} green />
      </div>

      {/* Vol chart + chain breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 270px", gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Volatility Index — 48h
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 26, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1' }}>
              {(MOCK_VOL * 100).toFixed(2)}%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={volChartData}>
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Vol"]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-primary)" }}
              />
              <Line type="monotone" dataKey="vol" stroke="var(--forest)" strokeWidth={1.8} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>
            By Chain
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {CHAIN_VOL_DATA.map((c) => (
              <ChainRow key={c.chain} chain={c.chain} vol={c.vol} weight={c.weight} />
            ))}
          </div>
        </div>
      </div>

      {/* Active series table */}
      <div className="card" style={{ overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Active Series</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {seriesWithPremiums.length} series
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--bg-2)" }}>
              {["Series", "Type", "Strike", "Expiry", "Premium", "OI", "Vol 24h"].map((h) => (
                <th key={h} style={{
                  padding: "9px 24px",
                  textAlign: h === "Series" ? "left" : "right",
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seriesWithPremiums.map((s, i) => (
              <tr key={s.id} style={{
                borderBottom: i < seriesWithPremiums.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "12px 24px", fontWeight: 500, color: "var(--text-primary)" }}>{s.ticker}</td>
                <td style={{ padding: "12px 24px", textAlign: "right" }}><TypeBadge isCall={s.isCall} /></td>
                <td style={{ padding: "12px 24px", textAlign: "right", fontFeatureSettings: '"tnum" 1' }}>${s.strike.toLocaleString()}</td>
                <td style={{ padding: "12px 24px", textAlign: "right", color: "var(--text-muted)" }}>{formatTimeToExpiry(s.expiry)}</td>
                <td style={{ padding: "12px 24px", textAlign: "right", fontFeatureSettings: '"tnum" 1', fontWeight: 500, color: "var(--forest)" }}>${s.premium.toFixed(2)}</td>
                <td style={{ padding: "12px 24px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>{s.openInterest.toLocaleString()}</td>
                <td style={{ padding: "12px 24px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-muted)" }}>{s.volume24h}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <InfoCard
          title="Reactive Network"
          body="Aggregates Uniswap V3 swap data from Ethereum, Arbitrum, Base, and BSC every block to compute a live cross-chain realized volatility index."
        />
        <InfoCard
          title="On-chain Black-Scholes"
          body="Option premiums are computed entirely in Solidity using WAD fixed-point arithmetic. No off-chain oracles or order books."
        />
        <InfoCard
          title="Automated Settlement"
          body="At expiry, Reactive Network cron triggers settleExpiredSeries(). ITM holders claim their payout — no keepers required."
        />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, green }: { label: string; value: string; sub: string; accent?: boolean; green?: boolean }) {
  const color = accent ? "var(--forest)" : green ? "var(--green)" : "var(--text-primary)";
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 24, fontWeight: 700, color, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function ChainRow({ chain, vol, weight }: { chain: string; vol: number; weight: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{chain}</span>
        <span style={{ fontSize: 12, fontFeatureSettings: '"tnum" 1', fontWeight: 500, color: "var(--forest)" }}>{(vol * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${vol * 100}%`, background: "var(--forest)", borderRadius: 2, opacity: 0.6 }} />
      </div>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3 }}>{(weight * 100).toFixed(0)}% weight</div>
    </div>
  );
}

function TypeBadge({ isCall }: { isCall: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
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

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--forest)", marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{body}</p>
    </div>
  );
}
