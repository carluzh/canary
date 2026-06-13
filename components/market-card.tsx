"use client";

import Link from "next/link";
import { useMode } from "@/lib/web3/mode";
import { type Market, premiumPct, payoutMultiple } from "@/lib/markets";
import { usd, pct, cents, timeLeft } from "@/lib/format";

export function MarketCard({ m }: { m: Market }) {
  const { mode } = useMode();
  const yesPct = Math.round(m.priceYes * 100);

  return (
    <Link href={`/market/${m.id}`} className="canary-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <span className="canary-kicker">
          {m.category} · {m.asset}
        </span>
        <span className="canary-tag">{timeLeft(m.expiry)}</span>
      </div>

      {mode === "simple" ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-radley)",
              fontSize: 19,
              lineHeight: 1.25,
              marginBottom: 16,
              minHeight: 48,
            }}
          >
            Insure against{" "}
            <span style={{ color: "#c97849" }}>{m.insureLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <div>
              <div className="canary-stat-label">Cost of cover</div>
              <div className="canary-stat-value">{pct(premiumPct(m))}</div>
            </div>
            <div>
              <div className="canary-stat-label">Payout</div>
              <div className="canary-stat-value">
                {payoutMultiple(m).toFixed(0)}×
              </div>
            </div>
            <span
              className="canary-btn canary-btn--accent"
              style={{ marginLeft: "auto" }}
            >
              Buy protection →
            </span>
          </div>
        </>
      ) : (
        <>
          <div
            style={{ fontSize: 15, lineHeight: 1.35, marginBottom: 16, minHeight: 48 }}
          >
            {m.question}
          </div>
          <div className="canary-bar" style={{ marginBottom: 8 }}>
            <div className="canary-bar-yes" style={{ width: `${yesPct}%` }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              marginBottom: 16,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span style={{ color: "#5a7a3a" }}>YES {cents(m.priceYes)}</span>
            <span style={{ color: "#aa5f6e" }}>NO {cents(1 - m.priceYes)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <div>
              <div className="canary-stat-label">Liquidity</div>
              <div className="canary-mono" style={{ fontSize: 13 }}>
                {usd(m.liquidity)}
              </div>
            </div>
            <div>
              <div className="canary-stat-label">Volume</div>
              <div className="canary-mono" style={{ fontSize: 13 }}>
                {usd(m.volume)}
              </div>
            </div>
            <span
              className="canary-btn canary-btn--ink"
              style={{ marginLeft: "auto" }}
            >
              Trade →
            </span>
          </div>
        </>
      )}
    </Link>
  );
}
