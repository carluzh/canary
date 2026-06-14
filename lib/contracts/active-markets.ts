// PURE module (no "use client", no hooks) — safe to import from both server and
// client code. Maps the UI's per-stablecoin markets (keyed by lowercase symbol,
// see lib/markets.ts) to the live CanaryMarket contracts on Arc testnet.
//
// USDe is the only fully-live market: `demoMarket` is the seeded, fillable
// buy-cover book and `yieldMarket` is the underwrite (mintSets + placeOrder)
// target. Every other UI market is cosmetic/view-only.

import { DEMO_MARKET_ADDRESS, YIELD_MARKET_ADDRESS } from "./addresses";

// symbol (lowercase) -> live buy-cover market address (the seeded demo book).
export const ONCHAIN_MARKETS: Record<string, `0x${string}`> = {
  usde: DEMO_MARKET_ADDRESS,
};

// symbol (lowercase) -> live underwrite market address (the yield market, where
// yield reads are safe and mintSets+placeOrder builds the ask).
export const UNDERWRITE_MARKETS: Record<string, `0x${string}`> = {
  usde: YIELD_MARKET_ADDRESS,
};

export function getOnchainMarket(symbol: string): `0x${string}` | null {
  return ONCHAIN_MARKETS[symbol.toLowerCase()] ?? null;
}

export function hasOnchainMarket(symbol: string): boolean {
  return getOnchainMarket(symbol) !== null;
}

export function getUnderwriteMarket(symbol: string): `0x${string}` | null {
  return UNDERWRITE_MARKETS[symbol.toLowerCase()] ?? null;
}

// True only for the yield market — gate yield view fns here; they revert on the
// demo/buy-cover market.
export function isYieldMarket(addr?: `0x${string}` | null): boolean {
  return !!addr && addr.toLowerCase() === YIELD_MARKET_ADDRESS.toLowerCase();
}

// Symbols backed by live contracts. Everything else renders as mock/view-only.
export const ACTIVE_SYMBOLS: Set<string> = new Set(["usde"]);

export function isActiveSymbol(symbol: string): boolean {
  return ACTIVE_SYMBOLS.has(symbol.toLowerCase());
}
