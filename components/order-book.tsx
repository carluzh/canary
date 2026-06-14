"use client";

import { useState, type ReactNode } from "react";
import type { Market } from "@/lib/markets";
import { isMarketActive } from "@/lib/markets";
import { priceScaleToFraction, sharesToUsd } from "@/lib/format";
import { useLiveMarket } from "@/lib/contracts/markets-onchain";

// Two separate books, one for YES and one for NO, toggled in the header. The
// selected side is shared with the trade panel (clicking Buy YES / Buy NO flips
// the book too). Live on Arc for USDe; synthetic + deterministic for the rest.

const subCents = (p: number) => `${(p * 100).toFixed(1)}¢`;
// Order size is a SHARE count (each share redeems for $1), not a dollar amount.
const fmtSize = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type OrderPick = { side: "yes" | "no"; price: number; size: number };
type Order = { price: number; size: number };

export function buildBook(symbol: string, mid: number) {
  const rng = mulberry32(hashSeed(`${symbol}-book`));
  const size = () => Math.round((2000 + rng() * 13000) / 100) * 100;
  const levels = 5 + (hashSeed(`${symbol}-lv`) % 3); // 5..7 per side
  const asks: Order[] = [];
  const bids: Order[] = [];
  let a = mid;
  let b = mid;
  for (let i = 0; i < levels; i++) {
    a += 0.002 + rng() * 0.0035;
    b -= 0.002 + rng() * 0.0035;
    asks.push({ price: a, size: size() });
    bids.push({ price: Math.max(0.003, b), size: size() });
  }
  asks.reverse(); // top → bottom: highest ask down to the best (lowest) ask
  const maxSize = Math.max(...asks.map((o) => o.size), ...bids.map((o) => o.size));
  return { asks, bids, maxSize };
}

type OnchainOrderLike = {
  isYes: boolean;
  isBuy: boolean;
  price: bigint;
  remaining: bigint;
};

// Live book for ONE side (yes or no), at that side's own price. asks = sell
// offers, bids = buy orders. Tolerates a one-sided book.
function liveBook(
  book: { ids: bigint[]; orders: OnchainOrderLike[] },
  yes: boolean
): { asks: Order[]; bids: Order[]; maxSize: number } {
  const asks: Order[] = [];
  const bids: Order[] = [];
  for (const o of book.orders) {
    if (o.isYes !== yes || o.remaining <= 0n) continue;
    const row = { price: priceScaleToFraction(o.price), size: sharesToUsd(o.remaining) };
    if (!o.isBuy) asks.push(row);
    else bids.push(row);
  }
  asks.sort((x, y) => y.price - x.price);
  bids.sort((x, y) => y.price - x.price);
  const sizes = [...asks, ...bids].map((o) => o.size);
  const maxSize = sizes.length ? Math.max(...sizes) : 1;
  return { asks, bids, maxSize };
}

export function OrderBook({
  m,
  onPick,
  headerAction,
  side: sideProp,
  onSideChange,
}: {
  m: Market;
  onPick?: (p: OrderPick) => void;
  headerAction?: ReactNode;
  // Controlled side (shared with the trade panel). Falls back to internal state.
  side?: "yes" | "no";
  onSideChange?: (s: "yes" | "no") => void;
}) {
  const [sideInner, setSideInner] = useState<"yes" | "no">("yes");
  const side = sideProp ?? sideInner;
  const setSide = onSideChange ?? setSideInner;
  const yes = side === "yes";

  const { book, price, live } = useLiveMarket(m);
  const useLive = isMarketActive(m) && live && book.orders.length > 0;
  const yesPrice = useLive ? price : m.priceYes;
  const mid = yes ? yesPrice : 1 - yesPrice;
  const { asks, bids, maxSize } = useLive
    ? liveBook(book, yes)
    : buildBook(`${m.asset}-${side}`, mid);
  // Synthetic levels are not fillable, so only the live book gets a click handler.
  const clickable = useLive && !!onPick;

  return (
    <div className="canary-ob">
      <div className="canary-ob-head">
        <span>Order book</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <SideToggle side={side} onChange={setSide} />
          {headerAction}
        </span>
      </div>
      <div className="canary-ob-rows">
        {asks.map((o, i) => (
          <ObRow
            key={`a${i}`}
            kind="ask"
            o={o}
            maxSize={maxSize}
            onClick={clickable ? () => onPick!({ side, price: o.price, size: o.size }) : undefined}
          />
        ))}
        <div className="canary-ob-mid">
          <span className="canary-ob-mid-price">{subCents(mid)}</span>
          <span className="canary-ob-mid-sub">Mid price</span>
        </div>
        {bids.map((o, i) => (
          <ObRow
            key={`b${i}`}
            kind="bid"
            o={o}
            maxSize={maxSize}
            onClick={clickable ? () => onPick!({ side, price: o.price, size: o.size }) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SideToggle({
  side,
  onChange,
}: {
  side: "yes" | "no";
  onChange: (s: "yes" | "no") => void;
}) {
  const item = (s: "yes" | "no", label: string) => (
    <button
      type="button"
      onClick={() => onChange(s)}
      style={{
        background: side === s ? "var(--c-surface-2)" : "transparent",
        border: "1px solid var(--c-border)",
        color: side === s ? "var(--c-ink)" : "var(--c-muted)",
        fontFamily: "var(--sans-stack)",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 7,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {item("yes", "Yes")}
      {item("no", "No")}
    </span>
  );
}

function ObRow({
  kind,
  o,
  maxSize,
  onClick,
}: {
  kind: "ask" | "bid";
  o: Order;
  maxSize: number;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="canary-ob-price">{subCents(o.price)}</span>
      <span className="canary-ob-depth">
        <span
          className="canary-ob-fill"
          style={{ width: `${Math.round((o.size / maxSize) * 100)}%` }}
        />
      </span>
      <span className="canary-ob-size">{fmtSize(o.size)}</span>
    </>
  );

  if (!onClick) {
    return (
      <div className="canary-ob-row" data-side={kind}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="canary-ob-row"
      data-side={kind}
      data-clickable="true"
      onClick={onClick}
    >
      {inner}
    </button>
  );
}
