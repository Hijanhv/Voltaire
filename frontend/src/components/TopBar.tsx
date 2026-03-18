"use client";

import { MOCK_SPOT, MOCK_VOL } from "@/lib/mockData";

export default function TopBar() {
  const volPct = (MOCK_VOL * 100).toFixed(1);

  return (
    <header style={{
      height: 52,
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 32px",
      justifyContent: "space-between",
    }}>
      {/* Left: market stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Stat label="ETH" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <Sep />
        <Stat label="Vol Index" value={`${volPct}%`} valueColor="var(--forest)" sub="4-chain" />
        <Sep />
        <Stat label="Network" value="Unichain Sepolia" />
        <Sep />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--green)",
            animation: "pulse-dot 2.5s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Live</span>
        </div>
      </div>

      {/* Right */}
      <button style={{
        padding: "7px 18px",
        background: "var(--forest)",
        color: "#f6f1ea",
        border: "none",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: "0.02em",
        transition: "opacity 0.15s",
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        Connect Wallet
      </button>
    </header>
  );
}

function Stat({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: valueColor ?? "var(--text-primary)", fontFeatureSettings: '"tnum" 1', display: "flex", alignItems: "baseline", gap: 4 }}>
        {value}
        {sub && <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontWeight: 400 }}>{sub}</span>}
      </div>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: "var(--border-strong)", opacity: 0.5 }} />;
}
