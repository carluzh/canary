"use client";

import { useAccount } from "wagmi";
import { STABLES } from "@/lib/stables";
import { useStableHoldings } from "@/lib/web3/holdings";
import { StableCard } from "@/components/stable-card";

export function InsuranceBoard({ selected }: { selected: Set<string> }) {
  const { isConnected } = useAccount();
  const { holdings, isLoading } = useStableHoldings();

  // Token-stack filter: empty selection shows everything. Filter first, then
  // apply the Proposed/Available (wallet) split to the active set.
  const filterActive = selected.size > 0;
  const isActive = (sym: string) => !filterActive || selected.has(sym);
  const shown = STABLES.filter((s) => isActive(s.symbol));

  const held = shown.filter((s) => (holdings[s.symbol] ?? 0) > 0);
  const heldSet = new Set(held.map((s) => s.symbol));
  const rest = shown.filter((s) => !heldSet.has(s.symbol));

  // While filtering, drop a section entirely when it has no matching tokens.
  const showProposed = !filterActive || held.length > 0;
  const showAvailable = rest.length > 0;

  return (
    <>
      {showProposed && (
        <section>
          <h2 className="canary-segment-title">
            Proposed Insurance
            <span className="canary-segment-count">{held.length} Markets</span>
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
                <StableCard key={s.symbol} s={s} />
              ))}
            </div>
          )}
        </section>
      )}

      {showProposed && showAvailable && <div className="canary-divider" />}

      {showAvailable && (
        <section>
          <h2 className="canary-segment-title">
            Available Insurance
            <span className="canary-segment-count">{rest.length} Markets</span>
          </h2>
          <div className="canary-grid">
            {rest.map((s) => (
              <StableCard key={s.symbol} s={s} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
