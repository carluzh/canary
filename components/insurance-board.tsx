"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { STABLES } from "@/lib/stables";
import { isActiveSymbol } from "@/lib/contracts/active-markets";
import { StableCard } from "@/components/stable-card";
import { PositionCard } from "@/components/position-card";

export function InsuranceBoard({ selected }: { selected: Set<string> }) {
  const { isConnected, address } = useAccount();

  // Token-stack filter: empty selection shows everything.
  const filterActive = selected.size > 0;
  const isShown = (sym: string) => !filterActive || selected.has(sym);
  const shown = STABLES.filter((s) => isShown(s.symbol));

  // Only active (live-contract) markets can hold a position. Each PositionCard
  // self-hides until it has one and reports presence so we can show the count
  // and drop that market from "Available" (no duplication).
  const activeShown = shown.filter((s) => isActiveSymbol(s.symbol));
  const [positioned, setPositioned] = useState<Set<string>>(() => new Set());
  const report = useCallback((sym: string, has: boolean) => {
    setPositioned((prev) => {
      if (has === prev.has(sym)) return prev;
      const next = new Set(prev);
      if (has) next.add(sym);
      else next.delete(sym);
      return next;
    });
  }, []);

  const posCount = positioned.size;
  // Available lists every market you can buy — including one you already hold a
  // position in, so you can always top up or revisit it.
  const showOpened = !filterActive || activeShown.length > 0;
  const showAvailable = shown.length > 0;

  return (
    <>
      {showOpened && (
        <section>
          <h2 className="canary-segment-title">
            Opened Insurance
            <span className="canary-segment-count">
              {posCount} {posCount === 1 ? "Position" : "Positions"}
            </span>
          </h2>
          {!isConnected ? (
            <div className="canary-banner">
              Connect your wallet to see the cover you&apos;ve opened.
            </div>
          ) : posCount === 0 ? (
            <div className="canary-banner">
              No open cover yet. Buy protection below and your position shows up here.
            </div>
          ) : null}
          {isConnected && (
            <div className="canary-grid">
              {activeShown.map((s) => (
                <PositionCard
                  key={s.symbol}
                  stable={s}
                  address={address}
                  onReport={report}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {showOpened && showAvailable && <div className="canary-divider" />}

      {showAvailable && (
        <section>
          <h2 className="canary-segment-title">
            Available Insurance
            <span className="canary-segment-count">{shown.length} Markets</span>
          </h2>
          <div className="canary-grid">
            {shown.map((s) => (
              <StableCard key={s.symbol} s={s} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
