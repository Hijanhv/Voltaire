"use client";

import { useConnection, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEthPrice, useVolatility } from "@/lib/hooks";

export default function TopBar() {
  const { price: spot, loading: priceLoading } = useEthPrice();
  const { vol, age } = useVolatility();

  const connection  = useConnection();
  const { connect }    = useConnect();
  const { disconnect } = useDisconnect();

  const address     = connection?.address;
  const isConnected = connection?.status === "connected";
  const shortAddr   = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const spotDisplay = priceLoading
    ? "…"
    : `$${spot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const volDisplay = vol > 0 ? `${(vol * 100).toFixed(1)}%` : "…";
  const ageDisplay = age > 0 && age < 3600
    ? age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`
    : "";

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
      {/* Left: live market stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Stat label="ETH" value={spotDisplay} />
        <Sep />
        <Stat label="Vol Index" value={volDisplay} valueColor="var(--forest)" sub={ageDisplay} />
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

      {/* Right: wallet */}
      {isConnected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 14px",
            background: "var(--forest-dim)",
            border: "1px solid var(--forest-mid)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--forest)",
            fontWeight: 500,
            fontFeatureSettings: '"tnum" 1',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
            {shortAddr}
          </div>
          <button
            onClick={() => disconnect()}
            style={{
              padding: "6px 14px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--red)"; e.currentTarget.style.color = "var(--red)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => connect({ connector: injected() })}
          style={{
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
      )}
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
