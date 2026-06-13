"use client";

import { useAccount, useBalance } from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { arcTestnet } from "@/lib/web3/chains";
import { useMode } from "@/lib/web3/mode";

export function PortfolioView() {
  const { mode } = useMode();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  return (
    <main
      className="canary-shell"
      data-theme={mode === "expert" ? "expert" : "simple"}
      style={{ paddingBottom: 0 }}
    >
      <SiteHeader />

      <h1
        style={{
          margin: "0 0 22px",
          fontFamily: "var(--font-radley)",
          fontSize: "clamp(26px, 3.4vw, 38px)",
          letterSpacing: "-0.02em",
        }}
      >
        Portfolio
      </h1>

      {!isConnected ? (
        <div className="canary-banner">
          Connect your wallet to see balances and positions.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 32, marginBottom: 30 }}>
            <Stat
              label="Wallet (Arc)"
              value={
                bal ? `${Number(bal.formatted).toFixed(2)} ${bal.symbol}` : "0.00"
              }
            />
            <Stat label="Open cover" value="$0.00" />
            <Stat label="Yield earned" value="$0.00" />
          </div>
          <div className="canary-panel">
            <div className="canary-kicker" style={{ marginBottom: 12 }}>
              Positions
            </div>
            <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
              No open positions. Buy cover or provide liquidity to get started.
            </div>
          </div>
        </>
      )}

      <SiteFooter />
      <div aria-hidden style={{ height: 30 }} />
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
