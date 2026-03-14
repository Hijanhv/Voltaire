"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MOCK_SPOT,
  MOCK_VOL,
  CHAIN_VOL_DATA,
  VOL_HISTORY,
  ACTIVE_SERIES,
  MOCK_VAULT,
  formatCompact,
  formatTimeToExpiry,
} from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

export default function Dashboard() {
  const seriesWithPremiums = useMemo(() =>
    ACTIVE_SERIES.map((s) => {
      const bs = blackScholes({
        spot: MOCK_SPOT,
        strike: s.strike,
        expiry: s.expiry,
        vol: MOCK_VOL,
        isCall: s.isCall,
      });
      return { ...s, premium: bs.price };
    }),
    []
  );

  const totalOI = seriesWithPremiums.reduce((a, s) => a + s.openInterest, 0);
  const totalVol24h = seriesWithPremiums.reduce((a, s) => a + s.volume24h, 0);

  const volChartData = VOL_HISTORY.map((d, i) => ({
    i,
    vol: +(d.vol * 100).toFixed(2),
  }));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
          Market Overview
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Cross-chain realized volatility index · Updated every block via Reactive Network
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="ETH Spot" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} sub="Live price" />
        <KpiCard label="Vol Index" value={`${(MOCK_VOL * 100).toFixed(1)}%`} sub="4-chain realised vol" color="var(--blue)" />
        <KpiCard label="Open Interest" value={totalOI.toLocaleString()} sub="option contracts" />
        <KpiCard label="Vault TVL" value={formatCompact(MOCK_VAULT.totalCollateral)} sub={`${(MOCK_VAULT.apy * 100).toFixed(1)}% APY`} color="var(--green)" />
      </div>

      {/* Vol chart + chain breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
              Volatility Index — 48h
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", fontFeatureSettings: '"tnum" 1' }}>
              {(MOCK_VOL * 100).toFixed(2)}%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={volChartData}>
              <XAxis dataKey="i" hide />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "#999" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(v) => [`${v}%`, "Vol"]}
                contentStyle={{ background: "white", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }}
              />
              <Line type="monotone" dataKey="vol" stroke="#1e3a5f" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            By Chain
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CHAIN_VOL_DATA.map((c) => (
              <ChainVolRow key={c.chain} chain={c.chain} vol={c.vol} weight={c.weight} />
            ))}
          </div>
        </div>
      </div>

      {/* Active series */}
      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Active Series</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
            {seriesWithPremiums.length} series · {totalVol24h} contracts (24h)
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-2)" }}>
              {["Series", "Type", "Strike", "Expiry", "Premium", "OI", "Vol 24h"].map((h) => (
                <th key={h} style={{ padding: "8px 20px", textAlign: h === "Series" ? "left" : "right", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seriesWithPremiums.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: i < seriesWithPremiums.length - 1 ? "1px solid var(--border)" : "none" }}>
                <td style={{ padding: "10px 20px", fontWeight: 500 }}>{s.ticker}</td>
                <td style={{ padding: "10px 20px", textAlign: "right" }}><TypeBadge isCall={s.isCall} /></td>
                <td style={{ padding: "10px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1' }}>${s.strike.toLocaleString()}</td>
                <td style={{ padding: "10px 20px", textAlign: "right", color: "var(--text-secondary)" }}>{formatTimeToExpiry(s.expiry)}</td>
                <td style={{ padding: "10px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1', fontWeight: 500 }}>${s.premium.toFixed(2)}</td>
                <td style={{ padding: "10px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>{s.openInterest.toLocaleString()}</td>
                <td style={{ padding: "10px 20px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>{s.volume24h}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Protocol info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <InfoCard title="Reactive Network" body="Aggregates TWAP prices from Ethereum, Arbitrum, Base, and BSC every block to compute a live cross-chain realized volatility index." />
        <InfoCard title="On-chain Black-Scholes" body="Premium is computed in Solidity using fixed-point arithmetic. No off-chain oracles or order books required." />
        <InfoCard title="Automated Settlement" body="At expiry, Reactive Network cron triggers settleExpiredSeries(). ITM holders claim payout. No keepers required." />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: color ?? "var(--text-primary)", fontFeatureSettings: '"tnum" 1', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ChainVolRow({ chain, vol, weight }: { chain: string; vol: number; weight: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{chain}</span>
        <span style={{ fontSize: 11, fontFeatureSettings: '"tnum" 1', fontWeight: 500 }}>{(vol * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${vol * 100}%`, background: "var(--blue)", borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{(weight * 100).toFixed(0)}% weight</div>
    </div>
  );
}

function TypeBadge({ isCall }: { isCall: boolean }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 3, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", background: isCall ? "var(--green-bg)" : "var(--red-bg)", color: isCall ? "var(--green)" : "var(--red)" }}>
      {isCall ? "CALL" : "PUT"}
    </span>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}
