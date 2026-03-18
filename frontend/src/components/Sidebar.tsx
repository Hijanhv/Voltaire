"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    href: "/buy",
    label: "Trade",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 2v11M2 7.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/vault",
    label: "Vault",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 11L5.5 7l3 2.5L13 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 220,
      minWidth: 220,
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Logo */}
      <div style={{ padding: "28px 24px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <VoltaireLogo />
          <div>
            <div style={{
              fontFamily: "var(--font-playfair, serif)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--forest)",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}>
              Voltaire
            </div>
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
              Options AMM
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", margin: "0 16px" }} />

      {/* Nav */}
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        <div style={{ fontSize: 9.5, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px", marginBottom: 8 }}>
          Menu
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--forest)" : "var(--text-secondary)",
                background: active ? "var(--forest-dim)" : "transparent",
                textDecoration: "none",
                marginBottom: 2,
                transition: "all 0.15s ease",
                border: active ? "1px solid var(--forest-mid)" : "1px solid transparent",
              }}
            >
              <span style={{ opacity: active ? 1 : 0.55, color: active ? "var(--forest)" : "currentColor" }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "16px 24px 24px", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Built on
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <PoweredBadge label="Uniswap V4" dot="#FF007A" />
          <PoweredBadge label="Unichain" dot="#F5A623" />
          <PoweredBadge label="Reactive Network" dot="#6366f1" />
        </div>
      </div>
    </aside>
  );
}

function PoweredBadge({ label, dot }: { label: string; dot: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function VoltaireLogo() {
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: "var(--forest)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 5l3 4 3-4 3 4 3-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 10l6 3 6-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      </svg>
    </div>
  );
}
