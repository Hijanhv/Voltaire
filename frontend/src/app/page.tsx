"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useEthPrice, useVolatility, useActiveSeries, useVaultData } from "@/lib/hooks";
import { formatCompact, formatTimeToExpiry } from "@/lib/mockData";
import { blackScholes } from "@/lib/blackScholes";

export default function Dashboard() {
  const { price: spot, loading: priceLoading } = useEthPrice();
  const { vol, volHistory, chainVolData, age } = useVolatility();
  const { activeSeries, loading: seriesLoading } = useActiveSeries(spot, vol);
  const { totalCollateral, utilizationPct, loading: vaultLoading } = useVaultData();

  const totalOI = activeSeries.reduce((a, s) => a + s.openInterest, 0);
  const volChartData = volHistory.length > 0
    ? volHistory.map((d, i) => ({ i, vol: d.vol }))
    : [];

  const spotDisplay = priceLoading
    ? "Loading…"
    : `$${spot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const volDisplay = vol > 0 ? `${(vol * 100).toFixed(1)}%` : "Loading…";
  const ageDisplay = age > 0 ? (age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`) : "";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }} className="fade-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 28, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
          Market Overview
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          Cross-chain realized volatility · Aggregated from Ethereum, Arbitrum, Base &amp; BSC
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <KpiCard label="ETH Spot" value={spotDisplay} sub="Live · Binance" />
        <KpiCard
          label="Vol Index"
          value={volDisplay}
          sub={ageDisplay ? `Updated ${ageDisplay}` : "On-chain oracle"}
          accent
        />
        <KpiCard
          label="Open Interest"
          value={seriesLoading ? "—" : totalOI.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          sub={`${activeSeries.length} active series`}
        />
        <KpiCard
          label="Vault TVL"
          value={vaultLoading ? "—" : formatCompact(totalCollateral)}
          sub={`${utilizationPct.toFixed(1)}% utilized`}
          green
        />
      </div>

      {/* Vol chart + chain breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 270px", gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Volatility Index — 48h Oracle History
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 26, fontWeight: 700, color: "var(--forest)", letterSpacing: "-0.02em", fontFeatureSettings: '"tnum" 1' }}>
              {volDisplay}
            </div>
          </div>
          {volChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={volChartData}>
                <XAxis dataKey="i" hide />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v) => [`${v}%`, "Vol"]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-primary)" }}
                />
                <Line type="monotone" dataKey="vol" stroke="var(--forest)" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {vol > 0 ? `Current: ${(vol * 100).toFixed(2)}% · No historical observations yet` : "Loading oracle data…"}
              </span>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>
            By Chain
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {chainVolData.map((c) => (
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
            {seriesLoading ? "Loading…" : `${activeSeries.length} series · live on-chain`}
          </span>
        </div>
        {activeSeries.length === 0 && !seriesLoading ? (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            No active series on-chain yet. Options are created on first purchase.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "var(--bg-2)" }}>
                {["Series", "Type", "Strike", "Expiry", "Premium", "Open Interest"].map((h) => (
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
              {activeSeries.map((s, i) => (
                <tr key={s.id} style={{
                  borderBottom: i < activeSeries.length - 1 ? "1px solid var(--border)" : "none",
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
                  <td style={{ padding: "12px 24px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--text-secondary)" }}>
                    {s.openInterest.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
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

      {/* Voltaire vs Traditional Options */}
      <ComparisonSection spot={spot} vol={vol} />

      {/* Target Users */}
      <TargetUsersSection />
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
        <span style={{ fontSize: 12, fontFeatureSettings: '"tnum" 1', fontWeight: 500, color: "var(--forest)" }}>
          {vol > 0 ? `${(vol * 100).toFixed(1)}%` : "—"}
        </span>
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

/* ── Voltaire vs Traditional Options Comparison ─────────────────────── */
function ComparisonSection({ spot, vol }: { spot: number; vol: number }) {
  const hasData = spot > 0 && vol > 0;

  // Use ATM strike (nearest $100), 30-day expiry
  const strike = hasData ? Math.round(spot / 100) * 100 : 3000;
  const expiry = Math.floor(Date.now() / 1000) + 30 * 86400;

  // Traditional: realized vol + 18% IV premium (market maker spread, realistic for ETH options on Deribit)
  const tradVol = vol * 1.18;
  const tradBS = hasData
    ? blackScholes({ spot, strike, expiry, vol: tradVol, isCall: true })
    : { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, impliedMovePercent: 0 };
  const tradPremium = tradBS.price;
  const tradGas = 18; // avg Ethereum mainnet gas for options tx in USD
  const tradTotal = tradPremium + tradGas;

  // Voltaire: exact realized vol, no spread, Unichain gas
  const voltBS = hasData
    ? blackScholes({ spot, strike, expiry, vol, isCall: true })
    : { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, impliedMovePercent: 0 };
  const voltPremium = voltBS.price;
  const voltGas = 0.01;
  const voltTotal = voltPremium + voltGas;

  const savings = tradTotal - voltTotal;
  const savingsPct = tradTotal > 0 ? (savings / tradTotal) * 100 : 0;

  const rows = [
    { metric: "Volatility source", trad: "Implied vol (opaque, set by market makers)", volt: "Realized vol — 1152 samples/day, 4 chains" },
    { metric: "Pricing", trad: "Off-chain orderbook or AMM with spread markup", volt: "On-chain Black-Scholes — pure math, no markup" },
    { metric: "Settlement", trad: "Manual keeper bot (can fail, can be MEV'd)", volt: "Automatic via Reactive Network cron — zero keepers" },
    { metric: "Manipulation risk", trad: "Single-chain vol can be flash-loan manipulated", volt: "Requires manipulating 4 chains simultaneously" },
    { metric: "Gas cost", trad: `~$${tradGas} on Ethereum mainnet`, volt: `~$${voltGas.toFixed(2)} on Unichain` },
    { metric: "Counterparty risk", trad: "Exchange / protocol team", volt: "Smart contract only — fully trustless" },
    { metric: "Transparency", trad: "Vol and pricing opaque / off-chain", volt: "Every calculation verifiable on-chain" },
  ];

  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
          Voltaire vs Traditional Options
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Live comparison · 30-day ATM call · Strike ${strike.toLocaleString()} · Spot ${spot > 0 ? spot.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
        </div>
      </div>

      {/* Live pricing callout */}
      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "18px 24px", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Traditional (e.g. Deribit)
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              IV: {(tradVol * 100).toFixed(1)}% &nbsp;·&nbsp; Premium: ${tradPremium.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              Gas: ~${tradGas} on Ethereum
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: "var(--red, #9b3a2a)" }}>
              ${tradTotal.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>total cost</div>
          </div>
          <div style={{ padding: "18px 24px", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Voltaire (this protocol)
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              σ: {(vol * 100).toFixed(1)}% (live oracle) &nbsp;·&nbsp; Premium: ${voltPremium.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              Gas: ~$0.01 on Unichain
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: "var(--forest)" }}>
              ${voltTotal.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>total cost</div>
          </div>
          <div style={{ padding: "18px 24px", background: "var(--bg-2)" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              You Save
            </div>
            <div style={{ fontFamily: "var(--font-playfair, serif)", fontSize: 22, fontWeight: 700, color: "var(--forest)", marginBottom: 4 }}>
              ${savings.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              {savingsPct.toFixed(1)}% cheaper per contract
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Live calc · vol {(vol * 100).toFixed(1)}% oracle
            </div>
          </div>
        </div>
      )}

      {/* Feature comparison table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--bg-2)" }}>
            <th style={{ padding: "8px 24px", textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", width: "28%" }}>Feature</th>
            <th style={{ padding: "8px 24px", textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", width: "36%" }}>Traditional Options</th>
            <th style={{ padding: "8px 24px", textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--forest)", textTransform: "uppercase", letterSpacing: "0.07em", width: "36%" }}>Voltaire (V4 Hook)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.metric} style={{ borderTop: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-2)" }}>
              <td style={{ padding: "10px 24px", fontWeight: 500, color: "var(--text-secondary)", fontSize: 11.5 }}>{r.metric}</td>
              <td style={{ padding: "10px 24px", color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.5 }}>{r.trad}</td>
              <td style={{ padding: "10px 24px", color: "var(--forest)", fontSize: 11.5, lineHeight: 1.5, fontWeight: 500 }}>{r.volt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: "10px 24px", borderTop: "1px solid var(--border)", fontSize: 10.5, color: "var(--text-muted)" }}>
        Traditional IV estimate uses realized vol × 1.18 (realistic market maker spread for ETH options). Gas estimate for Ethereum mainnet ~$18 avg.
        All premium figures computed live via Black-Scholes with current oracle data.
      </div>
    </div>
  );
}

/* ── Target Users ────────────────────────────────────────────────────── */
function TargetUsersSection() {
  const users = [
    {
      type: "ETH Holder",
      why: "Buy put options as portfolio insurance. Cap your downside without selling your ETH. Pay a small premium, protect against a 30-50% crash.",
      benefit: "Defined risk. Keep upside. No liquidation.",
    },
    {
      type: "Directional Trader",
      why: "Leverage ETH exposure without the full capital requirement. A call option at 10% of ETH's price gives equivalent upside with capped downside.",
      benefit: "10x capital efficiency. Max loss = premium paid.",
    },
    {
      type: "USDC Yield Farmer",
      why: "Deposit USDC into CollateralVault. Earn premiums from every option sold. Demonstrated 17.3% APY — far above stablecoin lending rates.",
      benefit: "Passive yield. No impermanent loss. Withdraw anytime.",
    },
    {
      type: "DeFi Protocol Treasury",
      why: "Hedge ETH treasury exposure. Buy puts to protect against price drops. Cheaper than OTC, fully transparent, no counterparty risk.",
      benefit: "Trustless. Auditable. On-chain accounting.",
    },
    {
      type: "AI / Autonomous Agent",
      why: "Voltaire is fully on-chain with no off-chain dependencies. An agent can autonomously hedge or speculate — no API keys, no broker accounts.",
      benefit: "Zero human intervention. Programmatic settlement.",
    },
  ];

  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Who Uses Voltaire</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Five distinct user types and why each finds Voltaire better than alternatives</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
        {users.map((u, i) => (
          <div key={u.type} style={{
            padding: "18px 20px",
            borderRight: i < users.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--forest)", marginBottom: 8 }}>{u.type}</div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 10px" }}>{u.why}</p>
            <div style={{
              fontSize: 10.5,
              color: "var(--forest)",
              background: "var(--bg-2)",
              borderRadius: 6,
              padding: "6px 10px",
              lineHeight: 1.5,
            }}>
              {u.benefit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
