"use client";

import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Stable } from "@/lib/stables";
import type { Market } from "@/lib/markets";
import { formatDate, timeLeft } from "@/lib/format";
import { TradePanel } from "@/components/trade-panel";

// The simple, one-stop "buy cover" popup. Bare minimum to purchase, plus a clear
// picture of WHAT pays out (the resolution gate) and FOR HOW LONG (the term).
// The actual buy reuses TradePanel's simple branch (premium / payout / deposit).

// Gate mirrors the deployed demo market (Deploy.s.sol): $0.95 trigger, held 15m.
const PEG = 1.0;
const TRIGGER = 0.95;
const COVER = 1000;

// chart geometry (px; the plot box is exactly H tall so labels map 1:1)
const W = 320;
const H = 150;
const TOP = 16;
const BOT = 16;
const HI = 1.02;
const LO = 0.9;
const yOf = (p: number) => TOP + ((HI - p) / (HI - LO)) * (H - TOP - BOT);

// A deterministic price wiggle that hugs the peg, never breaching the gate.
const PATH = [1.001, 1.0, 0.999, 1.001, 1.0, 0.998, 0.997, 0.999, 1.0, 1.0015, 0.999, 0.997, 0.996, 0.998, 1.0];

function GateChart() {
  const yPeg = yOf(PEG);
  const yTrig = yOf(TRIGGER);
  const points = PATH.map((p, i) => {
    const x = (i / (PATH.length - 1)) * W;
    return `${x.toFixed(1)},${yOf(p).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="canary-gate" style={{ height: H }}>
      <svg
        className="canary-gate-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect x={0} y={yTrig} width={W} height={H - BOT - yTrig} className="canary-gate-zone" />
        <line x1={0} x2={W} y1={yPeg} y2={yPeg} className="canary-gate-peg" />
        <line x1={0} x2={W} y1={yTrig} y2={yTrig} className="canary-gate-trigger" />
        <polyline points={points} className="canary-gate-price" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="canary-gate-tag canary-gate-tag--peg" style={{ top: yPeg }}>
        $1.00 peg
      </span>
      <span className="canary-gate-tag canary-gate-tag--trig" style={{ top: yTrig }}>
        $0.95 · pays out
      </span>
    </div>
  );
}

export function BuyInsuranceModal({
  market,
  stable,
  open,
  onClose,
}: {
  market: Market;
  stable: Stable;
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portal to <body> so the fixed overlay escapes the card's transform context
  // (a transformed ancestor would otherwise become its positioning container).
  return createPortal(
    <div
      className="canary-modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Insure your ${stable.symbol}`}
    >
      <div
        className="canary-modal"
        style={{ ["--brand"]: stable.color } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="canary-modal-head">
          {stable.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stable.logo} alt="" className="canary-stable-logo" />
          ) : (
            <span className="canary-stable-fallback" style={{ background: stable.color }}>
              {stable.symbol.slice(0, 1)}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="canary-modal-title">Insure your {stable.symbol}</div>
            <div className="canary-modal-sub">{stable.name}</div>
          </div>
          <button className="canary-modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <GateChart />

        <p className="canary-modal-gate-note">
          Pays <strong>$1 per token</strong> if {stable.symbol} falls to{" "}
          <strong>$0.95</strong> (5% below peg) and stays there for{" "}
          <strong>15 minutes</strong> — any time before the cover ends.
        </p>

        <div className="canary-modal-term">
          <span>Covered until</span>
          <span className="canary-modal-term-val">
            {formatDate(market.expiry)} · {timeLeft(market.expiry)}
          </span>
        </div>

        <TradePanel m={market} forceSimple defaultAmount={COVER} />
      </div>
    </div>,
    document.body
  );
}
