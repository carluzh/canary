"use client";

import { useState } from "react";
import { MOCK_MARKETS } from "@/lib/markets";
import { MarketCard } from "@/components/market-card";
import { SiteHeader } from "@/components/site-header";
import { InsuranceBoard } from "@/components/insurance-board";
import { TokenStack } from "@/components/token-stack";
import { SiteFooter } from "@/components/site-footer";
import { useMode } from "@/lib/web3/mode";

export function MarketsDashboard() {
  const { mode } = useMode();

  // Token-stack filter: empty set == show everything. Clicking a token toggles
  // its membership; isActive folds the "empty means all" rule.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggleToken = (sym: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  const isActive = (sym: string) => selected.size === 0 || selected.has(sym);

  const markets = MOCK_MARKETS.filter((m) => isActive(m.asset));

  return (
    <main
      className="canary-shell"
      data-theme={mode === "expert" ? "expert" : "simple"}
      style={{ paddingBottom: 0 }}
    >
      <SiteHeader />

      <div
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
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
              ? "Insure your stablecoins"
              : "Trade stablecoin markets"}
          </h1>
          <p
            style={{
              marginTop: 10,
              color: "var(--c-muted)",
              fontSize: 15.5,
              fontFamily: "var(--font-radley)",
              maxWidth: 620,
            }}
          >
            {mode === "simple"
              ? "Pick a stablecoin and get onchain cover. Pays out automatically according to resolution criteria."
              : "Binary YES/NO markets on stablecoin pegs, settled by a Chainlink feed over CCIP. Provide liquidity, earn the spread."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selected.size > 0 && (
            <button
              type="button"
              className="canary-reset"
              onClick={() => setSelected(new Set())}
            >
              Reset
            </button>
          )}
          <TokenStack selected={selected} onToggle={toggleToken} />
        </div>
      </div>

      {mode === "simple" ? (
        <InsuranceBoard selected={selected} />
      ) : (
        <div className="canary-mm-list">
          {markets.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      )}

      <SiteFooter />
      {/* match the marketing page's trailing margin below the footer */}
      <div aria-hidden style={{ height: 30 }} />
    </main>
  );
}
