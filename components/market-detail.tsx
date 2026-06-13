"use client";

import Link from "next/link";
import { Wordmark } from "@/components/top-bar";
import { TradePanel } from "@/components/trade-panel";
import { ConnectWallet } from "@/components/connect-wallet";
import { ModeToggle } from "@/components/mode-toggle";
import { getMarket } from "@/lib/markets";
import { usd, cents, pct, timeLeft } from "@/lib/format";
import { useMode } from "@/lib/web3/mode";

export function MarketDetail({ id }: { id: string }) {
  const { mode } = useMode();
  const m = getMarket(id);
  if (!m) return null;

  return (
    <main className="canary-shell">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 30,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Wordmark label="Market" />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ModeToggle />
          <ConnectWallet />
        </div>
      </header>

      <div className="canary-detail-grid">
        <div>
          <span className="canary-kicker">
            {m.category} · {m.asset}
          </span>
          <h1
            style={{
              margin: "10px 0 0",
              fontFamily: "var(--font-radley)",
              fontSize: "clamp(26px, 3.4vw, 40px)",
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
            }}
          >
            {mode === "simple" ? (
              <>
                Insure against{" "}
                <span style={{ color: "#c97849" }}>{m.insureLabel}</span>
              </>
            ) : (
              m.question
            )}
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 24 }}>
            <Stat label="YES (event)" value={cents(m.priceYes)} />
            <Stat label="NO (safe)" value={cents(1 - m.priceYes)} />
            <Stat label="Liquidity" value={usd(m.liquidity)} />
            <Stat label="Volume" value={usd(m.volume)} />
            <Stat label="Resolves" value={timeLeft(m.expiry)} />
          </div>

          <div className="canary-bar" style={{ margin: "24px 0 8px" }}>
            <div
              className="canary-bar-yes"
              style={{ width: `${Math.round(m.priceYes * 100)}%` }}
            />
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(30,30,30,0.55)" }}>
            Implied probability of the event: <strong>{pct(m.priceYes)}</strong>
          </div>

          <section style={{ marginTop: 36 }}>
            <h2
              style={{
                fontFamily: "var(--font-radley)",
                fontSize: 18,
                margin: "0 0 8px",
              }}
            >
              How this resolves
            </h2>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(30,30,30,0.7)",
              }}
            >
              A Chainlink price feed on Ethereum Sepolia reads {m.asset}/USD. If
              the trigger condition holds, the resolver sends a CCIP message to
              the market contract on Arc, which settles <strong>YES</strong>.
              Otherwise the market settles <strong>NO</strong> at expiry. Winning
              tokens redeem for $1 of USDC; idle collateral earns yield while the
              market is open.
            </p>
          </section>
        </div>

        <aside className="canary-detail-aside">
          <TradePanel m={m} />
          <div className="canary-panel" style={{ marginTop: 14 }}>
            <div className="canary-kicker" style={{ marginBottom: 8 }}>
              Your position
            </div>
            <div style={{ fontSize: 13, color: "rgba(30,30,30,0.55)" }}>
              No position yet.
            </div>
          </div>
        </aside>
      </div>

      <div style={{ marginTop: 40 }}>
        <Link href="/" className="canary-nav">
          ← All markets
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="canary-stat-label">{label}</div>
      <div className="canary-stat-value">{value}</div>
    </div>
  );
}
