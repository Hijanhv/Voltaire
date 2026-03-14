"use client";

import { MOCK_SPOT, MOCK_VOL } from "@/lib/mockData";

export default function TopBar() {
  const chainCount = 4;
  const volPct = (MOCK_VOL * 100).toFixed(1);

  return (
    <header
      style={{
        height: 48,
        background: "white",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 0,
        justifyContent: "space-between",
      }}
    >
      {/* Left: live market stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Stat label="ETH" value={`$${MOCK_SPOT.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <Divider />
        <Stat
          label="Vol Index"
          value={`${volPct}%`}
          sub={`${chainCount} chains`}
          valueColor="var(--blue)"
        />
        <Divider />
        <Stat label="Network" value="Unichain" />
        <Divider />
        <LiveDot />
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
          Reactive feed live
        </span>
      </div>

      {/* Right: connect wallet */}
      <button
        style={{
          padding: "6px 14px",
          background: "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: "0.01em",
        }}
      >
        Connect Wallet
      </button>
    </header>
  );
}

function Stat({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: valueColor ?? "var(--text-primary)",
          fontFeatureSettings: '"tnum" 1',
          lineHeight: 1.2,
        }}
      >
        {value}
        {sub && (
          <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 4, fontWeight: 400 }}>
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 24,
        background: "var(--border)",
        margin: "0 4px",
      }}
    />
  );
}

function LiveDot() {
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--green)",
        animation: "pulse 2s infinite",
      }}
    />
  );
}
