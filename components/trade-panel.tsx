"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useMode } from "@/lib/web3/mode";
import { type Market } from "@/lib/markets";
import { cents, pct } from "@/lib/format";
import { DEPLOYED } from "@/lib/contracts/addresses";

export function TradePanel({ m }: { m: Market }) {
  const { mode } = useMode();
  const { isConnected } = useAccount();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");

  // Prefill the cover amount when arriving from a card's "Cover $X" option
  // (e.g. /market/usdt?cover=1000).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cover");
    if (c && /^\d+(\.\d+)?$/.test(c)) setAmount(c);
  }, []);

  const simple = mode === "simple";
  const n = parseFloat(amount) || 0;
  const effSide = simple ? "yes" : side;
  const price = effSide === "yes" ? m.priceYes : 1 - m.priceYes;

  // simple: input = desired cover (payout); premium = cover × price.
  // expert: input = USDC spent; shares = spent ÷ price.
  const premium = simple ? n * m.priceYes : n;
  const shares = simple ? n : price > 0 ? n / price : 0;

  return (
    <div className="canary-panel">
      {simple ? (
        <div style={{ marginBottom: 14 }}>
          <div className="canary-kicker" style={{ marginBottom: 6 }}>
            Buy protection
          </div>
          <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
            Pay a premium now, get a fixed payout if{" "}
            <strong>{m.insureLabel}</strong>.
          </div>
        </div>
      ) : (
        <div className="canary-toggle-buysell" style={{ marginBottom: 14 }}>
          <button
            data-active={side === "yes"}
            data-side="yes"
            onClick={() => setSide("yes")}
          >
            Buy YES · {cents(m.priceYes)}
          </button>
          <button
            data-active={side === "no"}
            data-side="no"
            onClick={() => setSide("no")}
          >
            Buy NO · {cents(1 - m.priceYes)}
          </button>
        </div>
      )}

      <label className="canary-stat-label">
        {simple ? "Cover amount (USDC)" : "Amount (USDC)"}
      </label>
      <input
        className="canary-input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ margin: "6px 0 14px" }}
      />

      <Row
        label={simple ? "Premium" : "Avg price"}
        value={simple ? `$${premium.toFixed(2)}` : cents(price)}
      />
      <Row
        label={simple ? "Max payout" : `${effSide.toUpperCase()} shares`}
        value={simple ? `$${shares.toFixed(2)}` : shares.toFixed(2)}
        bold
      />

      <div style={{ marginTop: 14 }}>
        {!isConnected ? (
          <div className="canary-banner">
            Connect your wallet to {simple ? "buy cover" : "trade"}.
          </div>
        ) : !DEPLOYED ? (
          <button
            className="canary-btn canary-btn--accent canary-btn--block"
            disabled
            title="Contracts not deployed yet. Wire deployments.json"
          >
            {simple ? "Buy protection" : `Buy ${effSide.toUpperCase()}`} · awaiting
            deploy
          </button>
        ) : (
          <button className="canary-btn canary-btn--accent canary-btn--block">
            {simple ? "Buy protection" : `Buy ${effSide.toUpperCase()}`}
          </button>
        )}
      </div>

      <p
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--c-faint)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {simple
          ? `1 cover token redeems for $1 if the event resolves YES (${pct(
              m.priceYes
            )} implied).`
          : "YES + NO always settle to $1 of USDC collateral."}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
        marginBottom: 8,
      }}
    >
      <span style={{ color: "var(--c-muted)" }}>{label}</span>
      <span
        className="canary-mono"
        style={{ fontWeight: bold ? 600 : 400 }}
      >
        {value}
      </span>
    </div>
  );
}
