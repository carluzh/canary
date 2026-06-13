"use client";

import { useState } from "react";
import {
  MOCK_MARKETS,
  MARKET_CATEGORIES,
  type MarketCategory,
} from "@/lib/markets";
import { MarketCard } from "@/components/market-card";
import { SiteHeader } from "@/components/site-header";
import { useMode } from "@/lib/web3/mode";

export function MarketsDashboard() {
  const { mode } = useMode();
  const [cat, setCat] = useState<MarketCategory>("All");
  const markets = MOCK_MARKETS.filter(
    (m) => cat === "All" || m.category === cat
  );

  return (
    <main className="canary-shell">
      <SiteHeader />

      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-radley)",
            fontSize: "clamp(28px, 4vw, 40px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {mode === "simple"
            ? "Protect your stablecoins & DeFi positions"
            : "Trade depeg & exploit markets"}
        </h1>
        <p
          style={{
            marginTop: 10,
            color: "rgba(30,30,30,0.55)",
            fontSize: 15.5,
            fontFamily: "var(--font-radley)",
            maxWidth: 620,
          }}
        >
          {mode === "simple"
            ? "Buy parametric cover that pays out on-chain the moment the event resolves on Arc."
            : "Binary YES/NO markets settled by a Chainlink price feed over CCIP. Provide liquidity, earn the spread."}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {MARKET_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            data-active={cat === c}
            className="canary-seg-item"
            style={{
              border: "1px solid rgba(30,30,30,0.14)",
              borderRadius: 8,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="canary-grid">
        {markets.map((m) => (
          <MarketCard key={m.id} m={m} />
        ))}
      </div>
    </main>
  );
}
