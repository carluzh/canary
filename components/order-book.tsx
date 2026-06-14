"use client";

import type { ReactNode } from "react";
import type { Market } from "@/lib/markets";
import { isMarketActive } from "@/lib/markets";
import { usd, priceScaleToFraction, sharesToUsd } from "@/lib/format";
import { useLiveMarket } from "@/lib/contracts/markets-onchain";

// Shared limit-order book: a static display on the Expert card, and clickable on
// the market detail page where picking a level fills a Buy YES / Buy NO intent.
// Synthetic but deterministic per market (swap buildBook for the live book later).

const subCents = (p: number) => `${(p * 100).toFixed(1)}¢`;

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

// What a clicked level resolves to: an ask (someone offering YES) → Buy YES at
// that price; a bid (someone bidding for YES) → Buy NO at the mirror price.
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
  const bestAsk = asks[asks.length - 1]!.price;
  const bestBid = bids[0]!.price;
  const maxSize = Math.max(...asks.map((o) => o.size), ...bids.map((o) => o.size));
  return { asks, bids, spread: bestAsk - bestBid, maxSize };
}

// Derive display rows from the live on-chain YES book. Asks = sell-YES offers
// (cover supply), bids = buy-YES orders. Tolerates a one-sided book: the live
// demo carries a single ask and no bids, so every spread/best calc is guarded.
function liveBook(
  book: { ids: bigint[]; orders: OnchainOrderLike[] }
): { asks: Order[]; bids: Order[]; spread: number; maxSize: number } {
  const asks: Order[] = [];
  const bids: Order[] = [];
  for (const o of book.orders) {
    if (!o.isYes || o.remaining <= 0n) continue;
    const row = { price: priceScaleToFraction(o.price), size: sharesToUsd(o.remaining) };
    if (!o.isBuy) asks.push(row);
    else bids.push(row);
  }
  // top → bottom: highest ask down to the best (lowest) ask, matching synthetic layout.
  asks.sort((x, y) => y.price - x.price);
  bids.sort((x, y) => y.price - x.price);
  const bestAsk = asks.length ? asks[asks.length - 1]!.price : null;
  const bestBid = bids.length ? bids[0]!.price : null;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : 0;
  const sizes = [...asks, ...bids].map((o) => o.size);
  const maxSize = sizes.length ? Math.max(...sizes) : 1;
  return { asks, bids, spread, maxSize };
}

type OnchainOrderLike = {
  isYes: boolean;
  isBuy: boolean;
  price: bigint;
  remaining: bigint;
};

export function OrderBook({
  m,
  onPick,
  headerAction,
}: {
  m: Market;
  onPick?: (p: OrderPick) => void;
  headerAction?: ReactNode;
}) {
  const { book, price, live } = useLiveMarket(m);
  const useLive = isMarketActive(m) && live && book.orders.length > 0;
  const synthetic = buildBook(m.asset, m.priceYes);
  const derived = useLive ? liveBook(book) : synthetic;
  const { asks, bids, spread, maxSize } = derived;
  // Synthetic levels are not fillable, so only the live book gets a click handler.
  const pick = useLive ? onPick : undefined;
  // Mid = live market price when live, mock priceYes otherwise (deterministic SSR paint).
  const mid = subCents(useLive ? price : m.priceYes);
  return (
    <div className="canary-ob">
      <div className="canary-ob-head">
        <span>Order book</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span className="canary-ob-spread">spread {subCents(spread)}</span>
          {headerAction}
        </span>
      </div>
      <div className="canary-ob-rows">
        {asks.map((o, i) => (
          <ObRow key={`a${i}`} side="ask" o={o} maxSize={maxSize} onPick={pick} />
        ))}
        <div className="canary-ob-mid">
          <span className="canary-ob-mid-price">{mid}</span>
          <span className="canary-ob-mid-sub">Mid price</span>
        </div>
        {bids.map((o, i) => (
          <ObRow key={`b${i}`} side="bid" o={o} maxSize={maxSize} onPick={pick} />
        ))}
      </div>
    </div>
  );
}

function ObRow({
  side,
  o,
  maxSize,
  onPick,
}: {
  side: "ask" | "bid";
  o: Order;
  maxSize: number;
  onPick?: (p: OrderPick) => void;
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
      <span className="canary-ob-size">{usd(o.size)}</span>
    </>
  );

  if (!onPick) {
    return (
      <div className="canary-ob-row" data-side={side}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="canary-ob-row"
      data-side={side}
      data-clickable="true"
      onClick={() =>
        onPick(
          side === "ask"
            ? { side: "yes", price: o.price, size: o.size }
            : { side: "no", price: 1 - o.price, size: o.size }
        )
      }
    >
      {inner}
    </button>
  );
}
