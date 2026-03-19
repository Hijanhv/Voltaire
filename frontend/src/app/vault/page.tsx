"use client";

import { useState } from "react";
import { useConnection, useWriteContract, useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useEthPrice, useVolatility, useActiveSeries, useVaultData } from "@/lib/hooks";
import { formatCompact } from "@/lib/mockData";
import { CONTRACTS, COLLATERAL_VAULT_ABI, ERC20_ABI } from "@/lib/config";

const USDC_DEC = 6;

export default function Vault() {
  const [depositAmount, setDepositAmount] = useState("");
  const [tab, setTab]     = useState<"deposit" | "withdraw">("deposit");
  const [txState, setTxState] = useState<"idle" | "approving" | "pending" | "done" | "error">("idle");

  const connection  = useConnection();
  const isConnected = connection?.status === "connected";
  const { address } = useAccount();
  const { writeContractAsync: sendTx } = useWriteContract();

  const { price: spot } = useEthPrice();
  const { vol }         = useVolatility();
  const { activeSeries } = useActiveSeries(spot > 0 ? spot : 3000, vol > 0 ? vol : 0.7);
  const seriesIds = activeSeries.map((s) => s.id);

  const {
    totalCollateral,
    utilized,
    utilizationPct,
    availableLiquidity,
    userPositionValue,
    userShares,
    seriesLocks,
    loading: vaultLoading,
  } = useVaultData(seriesIds, address);

  // Per-series lock data for the breakdown table
  const activeLocks = activeSeries
    .map((s, i) => {
      const lockEntry = seriesLocks[i];
      const locked = lockEntry?.locked ? Number(lockEntry.locked) / 10 ** USDC_DEC : 0;
      return { series: s.ticker, locked, pct: totalCollateral > 0 ? (locked / totalCollateral) * 100 : 0 };
    })
    .filter((l) => l.locked > 0)
    .sort((a, b) => b.locked - a.locked);

  // Utilization ratio for the bar
  const utilPct = utilizationPct;
  const available = availableLiquidity;

  // User's mock initial deposit (would need events to track properly)
  // Show position value if user has shares, otherwise 0
  const userHasPosition = userShares > 0;

  async function handleAction() {
    if (!isConnected) { alert("Connect your wallet first."); return; }
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt <= 0) { alert("Enter a valid amount."); return; }

    try {
      const amountUsdc = parseUnits(amt.toFixed(6), USDC_DEC);

      if (tab === "deposit") {
        setTxState("approving");
        await sendTx({
          address: CONTRACTS.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.collateralVault, amountUsdc],
        });
        setTxState("pending");
        await sendTx({
          address: CONTRACTS.collateralVault,
          abi: COLLATERAL_VAULT_ABI,
          functionName: "deposit",
          args: [CONTRACTS.usdc, amountUsdc],
        });
      } else {
        // Withdraw: input is USDC amount; convert to shares
        // shares = (amount * totalShares) / totalAssets — approximated via userShares
        // For simplicity, allow withdrawing by share count equal to USDC input (1:1 approx)
        const sharesToWithdraw = BigInt(Math.floor(amt * 10 ** USDC_DEC));
        setTxState("pending");
        await sendTx({
          address: CONTRACTS.collateralVault,
          abi: COLLATERAL_VAULT_ABI,
          functionName: "withdraw",
          args: [CONTRACTS.usdc, sharesToWithdraw],
        });
      }

      setTxState("done");
      setDepositAmount("");
      setTimeout(() => setTxState("idle"), 4000);
    } catch {
      setTxState("error");
      setTimeout(() => setTxState("idle"), 3000);
    }
  }

  function setQuickAmount(pct: number | "max") {
    if (!userHasPosition) return;
    const base = pct === "max" ? userPositionValue : (userPositionValue * (pct as number)) / 100;
    setDepositAmount(base.toFixed(2));
  }

  const isBusy = txState === "approving" || txState === "pending";
  const txLabel = {
    idle:      "",
    approving: "Approving USDC…",
    pending:   tab === "deposit" ? "Depositing…" : "Withdrawing…",
    done:      "Transaction confirmed!",
    error:     "Transaction failed",
  }[txState];

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <VaultKpi
              label="Total Deposits"
              value={vaultLoading ? "—" : formatCompact(totalCollateral)}
              sub="USDC"
            />
            <VaultKpi
              label="Utilization"
              value={vaultLoading ? "—" : `${utilPct.toFixed(1)}%`}
              sub={`${formatCompact(utilized)} locked`}
              color={utilPct > 80 ? "var(--red)" : "var(--forest)"}
            />
            <VaultKpi
              label="Available"
              value={vaultLoading ? "—" : formatCompact(available)}
              sub="for new options"
              color="var(--green)"
            />
          </div>

          {/* Utilization bar */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Vault Utilization</span>
              <span style={{ fontSize: 12, fontFeatureSettings: '"tnum" 1', color: "var(--text-muted)" }}>
                {formatCompact(available)} available
              </span>
            </div>
            <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%",
                width: `${Math.min(utilPct, 100)}%`,
                background: utilPct > 80 ? "var(--red)" : "var(--forest)",
                borderRadius: 4,
                opacity: 0.75,
                transition: "width 0.5s",
              }} />
            </div>
            {activeLocks.length > 0 ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {activeLocks.slice(0, 5).map((l) => (
                  <div key={l.series} style={{ flex: 1, minWidth: 60 }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 3 }}>
                      {l.series.split("-").slice(1, 3).join("-")}
                    </div>
                    <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${l.pct * 4}%`, background: "var(--forest)", borderRadius: 2, opacity: 0.55 }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3 }}>{l.pct.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {activeSeries.length === 0 ? "No active series — all collateral is available." : "No collateral locked yet."}
              </div>
            )}
          </div>

          {/* Collateral by Series table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Collateral by Series
            </div>
            {activeLocks.length === 0 ? (
              <div style={{ padding: "24px 22px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                No collateral currently locked.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "var(--bg-2)" }}>
                    {["Series", "Locked (USDC)", "Share"].map((h) => (
                      <th key={h} style={{ padding: "9px 22px", textAlign: h === "Series" ? "left" : "right", fontSize: 10, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLocks.map((l, i) => (
                    <tr key={l.series} style={{ borderBottom: i < activeLocks.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <td style={{ padding: "10px 22px", fontWeight: 500, color: "var(--text-primary)" }}>{l.series}</td>
                      <td style={{ padding: "10px 22px", textAlign: "right", fontFeatureSettings: '"tnum" 1', color: "var(--forest)" }}>{formatCompact(l.locked)}</td>
                      <td style={{ padding: "10px 22px", textAlign: "right", color: "var(--text-muted)", fontFeatureSettings: '"tnum" 1' }}>{l.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: deposit panel */}
        <div>
          <div className="card" style={{ padding: 22 }}>
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

            {/* User position */}
            <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "13px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                Your Position
              </div>
              {isConnected ? (
                <>
                  <VRow label="Position value" value={userHasPosition ? `$${userPositionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00"} />
                  <VRow label="Shares held"    value={userShares > 0 ? userShares.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"} />
                </>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Connect wallet to view your position.</div>
              )}
            </div>

            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Amount (USDC)
            </label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ width: "100%", padding: "10px 12px 10px 26px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFeatureSettings: '"tnum" 1', background: "var(--surface)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {tab === "withdraw" && userHasPosition && (
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {([25, 50, "max"] as const).map((p) => (
                  <button key={String(p)} onClick={() => setQuickAmount(p === "max" ? "max" : p)} style={{
                    flex: 1, padding: "6px 0", border: "1px solid var(--border)", borderRadius: 7, fontSize: 11, background: "var(--surface)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--forest)"; e.currentTarget.style.color = "var(--forest)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    {p === "max" ? "Max" : `${p}%`}
                  </button>
                ))}
              </div>
            )}

            {tab === "deposit" && (
              <div style={{ background: "var(--green-bg)", borderRadius: 8, padding: "10px 13px", marginBottom: 16, fontSize: 11, color: "var(--green)", border: "1px solid rgba(45,106,79,0.15)" }}>
                Earn premiums pro-rata to your share of the vault.
              </div>
            )}

            {txState !== "idle" && (
              <div style={{
                marginBottom: 12,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                background: txState === "done" ? "var(--green-bg)" : txState === "error" ? "var(--red-bg)" : "var(--forest-dim)",
                color: txState === "done" ? "var(--green)" : txState === "error" ? "var(--red)" : "var(--forest)",
                border: `1px solid ${txState === "done" ? "rgba(45,106,79,0.2)" : txState === "error" ? "rgba(155,58,42,0.2)" : "var(--forest-mid)"}`,
              }}>
                {txLabel}
              </div>
            )}

            <button
              onClick={handleAction}
              disabled={isBusy}
              style={{
                width: "100%",
                padding: 12,
                background: isBusy ? "var(--bg-3)" : tab === "deposit" ? "var(--forest)" : "var(--surface)",
                color: isBusy ? "var(--text-muted)" : tab === "deposit" ? "#f6f1ea" : "var(--text-primary)",
                border: `1px solid ${isBusy ? "var(--border)" : tab === "deposit" ? "var(--forest)" : "var(--border)"}`,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 500,
                cursor: isBusy ? "not-allowed" : "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {isBusy ? txLabel : tab === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
            </button>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.55 }}>
              {isConnected
                ? tab === "deposit"
                  ? "Deposits earn premiums from every option sold. Collateral is locked proportionally while series are open."
                  : "Withdrawal available up to unused collateral. Locked collateral is released at series expiry."
                : "Connect wallet to deposit or withdraw."}
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
