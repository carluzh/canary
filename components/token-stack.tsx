"use client";

import type { CSSProperties } from "react";
import { STABLES } from "@/lib/stables";

// Right-aligned, overlapping stack of every available token (icons only). Also
// a filter: clicking a token toggles it in the selection; an empty selection
// means "all shown" (every icon full-colour). Deselected icons go greyscale.
export function TokenStack({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (sym: string) => void;
}) {
  return (
    <div className="canary-token-stack" role="group" aria-label="Filter by token">
      {STABLES.map((s) => {
        const active = selected.size === 0 || selected.has(s.symbol);
        return (
          <button
            key={s.symbol}
            type="button"
            className="canary-token-stack-item"
            data-active={active}
            aria-pressed={active}
            aria-label={`${s.symbol}, ${active ? "shown" : "hidden"}`}
            onClick={() => onToggle(s.symbol)}
            style={{ ["--brand"]: s.color } as CSSProperties}
          >
            {s.logo ? (
              <img src={s.logo} alt="" />
            ) : (
              <span className="canary-token-stack-fallback">
                {s.symbol.slice(0, 1)}
              </span>
            )}
            <span className="canary-token-stack-tip">{s.symbol}</span>
          </button>
        );
      })}
    </div>
  );
}
