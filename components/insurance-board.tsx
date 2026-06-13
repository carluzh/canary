"use client";

import { useAccount } from "wagmi";
import { STABLES } from "@/lib/stables";
import { useStableHoldings } from "@/lib/web3/holdings";
import { StableCard } from "@/components/stable-card";

export function InsuranceBoard() {
  const { isConnected } = useAccount();
  const { holdings, isLoading } = useStableHoldings();

  const held = STABLES.filter((s) => (holdings[s.symbol] ?? 0) > 0);
  const heldSet = new Set(held.map((s) => s.symbol));
  const rest = STABLES.filter((s) => !heldSet.has(s.symbol));

  return (
    <>
      <section>
        <h2 className="canary-segment-title">
          Proposed Insurance
          {isConnected && held.length > 0 && (
            <span className="canary-segment-count">{held.length} from your wallet</span>
          )}
        </h2>
        {!isConnected ? (
          <div className="canary-banner">
            Connect your wallet to see cover proposed for the stablecoins you hold.
          </div>
        ) : isLoading ? (
          <div className="canary-banner">Reading your balances…</div>
        ) : held.length === 0 ? (
          <div className="canary-banner">
            No insurable stablecoins found in your wallet. Browse all available cover below.
          </div>
        ) : (
          <div className="canary-grid">
            {held.map((s) => (
              <StableCard key={s.symbol} s={s} held={holdings[s.symbol]} />
            ))}
          </div>
        )}
      </section>

      <div className="canary-divider" />

      <section>
        <h2 className="canary-segment-title">
          Available Insurance
          <span className="canary-segment-count">{rest.length} markets</span>
        </h2>
        <div className="canary-grid">
          {rest.map((s) => (
            <StableCard key={s.symbol} s={s} />
          ))}
        </div>
      </section>
    </>
  );
}
