"use client";

import { useMode } from "@/lib/web3/mode";

export function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div className="canary-seg" role="tablist" aria-label="View mode">
      <button
        role="tab"
        aria-selected={mode === "simple"}
        data-active={mode === "simple"}
        className="canary-seg-item"
        onClick={() => setMode("simple")}
      >
        Simple
      </button>
      <button
        role="tab"
        aria-selected={mode === "expert"}
        data-active={mode === "expert"}
        className="canary-seg-item"
        onClick={() => setMode("expert")}
      >
        Expert
      </button>
    </div>
  );
}
