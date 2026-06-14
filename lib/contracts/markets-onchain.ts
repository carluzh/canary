"use client";

// Bridges the UI's per-stablecoin markets (keyed by lowercase symbol, see
// lib/markets.ts) to the live CanaryMarket order-book contracts on Arc testnet.
//
// The live deploy (frontend-integration/deployments.json) currently backs USDe
// only — `demoMarket` is the seeded, fillable book; `relayedMarket` is the
// CCIP/live-Chainlink twin. Every other UI market is still mock data, so
// hasOnchainMarket() gates whether the Blink deposit flow runs live.

import { useReadContract } from "wagmi";
import { CANARY_MARKET_ABI } from "./abi";
import {
  DEMO_MARKET_ADDRESS,
  RELAYED_MARKET_ADDRESS,
  DEFAULT_CHAIN_ID,
} from "./addresses";
import type { OrderBook, OnchainOrder } from "./canary";

// symbol (lowercase) -> live market address. USDe maps to the demo book because
// it's the one with seeded asks to fill; swap to RELAYED_MARKET_ADDRESS to run
// the CCIP-settled twin instead.
export const ONCHAIN_MARKETS: Record<string, `0x${string}`> = {
  usde: DEMO_MARKET_ADDRESS,
};

export function getOnchainMarket(symbol: string): `0x${string}` | null {
  return ONCHAIN_MARKETS[symbol.toLowerCase()] ?? null;
}

export function hasOnchainMarket(symbol: string): boolean {
  return getOnchainMarket(symbol) !== null;
}

export { RELAYED_MARKET_ADDRESS };

// Live order book for a market, shaped for the planners in canary.ts. Returns an
// empty book until the read resolves; `isLoading` lets the UI show a skeleton.
export function useOrderBook(market: `0x${string}` | null): {
  book: OrderBook;
  isLoading: boolean;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useReadContract({
    address: market ?? undefined,
    abi: CANARY_MARKET_ABI,
    functionName: "openOrders",
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!market, refetchInterval: 15_000 },
  });

  // openOrders() -> (uint256[] ids, Order[] openList); viem decodes the tuple
  // array as objects with the named struct fields.
  const ids = (data as readonly [readonly bigint[], readonly OnchainOrder[]] | undefined)?.[0];
  const orders = (data as readonly [readonly bigint[], readonly OnchainOrder[]] | undefined)?.[1];

  const book: OrderBook = {
    ids: ids ? [...ids] : [],
    orders: orders ? [...orders] : [],
  };

  return { book, isLoading: !!market && isLoading, refetch };
}
