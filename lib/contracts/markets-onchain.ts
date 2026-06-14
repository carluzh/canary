"use client";

// Client-side live-read layer for the per-stablecoin markets. The pure
// symbol->address mapping lives in active-markets.ts (importable from server +
// client); this module adds the wagmi hooks that read the live CanaryMarket
// order-book contracts on Arc testnet.
//
// The live deploy backs USDe only — `demoMarket` is the seeded, fillable
// buy-cover book; `yieldMarket` is the underwrite target. Every other UI market
// is mock data, so hasOnchainMarket()/isMarketActive() gate live reads.

import { useReadContract, useReadContracts } from "wagmi";
import { CANARY_MARKET_ABI } from "./abi";
import { MarketState } from "./abi";
import {
  RELAYED_MARKET_ADDRESS,
  DEFAULT_CHAIN_ID,
} from "./addresses";
import {
  ONCHAIN_MARKETS,
  getOnchainMarket,
  hasOnchainMarket,
  getUnderwriteMarket,
  isYieldMarket,
} from "./active-markets";
import { priceYes, type OrderBook, type OnchainOrder } from "./canary";
import { bookLiquidityUsd } from "@/lib/format";
import { isMarketActive, type Market } from "@/lib/markets";

// Re-export the pure mapping so existing importers (trade-panel.tsx) keep
// working against this module.
export { ONCHAIN_MARKETS, getOnchainMarket, hasOnchainMarket, getUnderwriteMarket, isYieldMarket };
export { RELAYED_MARKET_ADDRESS };

const REFETCH_MS = 10_000;

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
    query: { enabled: !!market, refetchInterval: REFETCH_MS },
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

// marketInfo() -> (state, collateral, priceFeed, depegThreshold, breachWindow,
// expiry, settlementGrace, yesSupply, noSupply, description). Returns mock-safe
// zero defaults while loading / when no market.
export function useMarketInfo(market: `0x${string}` | null): {
  state: number;
  expiry: number;
  depegThreshold: bigint;
  yesSupply: bigint;
  noSupply: bigint;
  description: string;
  isLoading: boolean;
} {
  const { data, isLoading } = useReadContract({
    address: market ?? undefined,
    abi: CANARY_MARKET_ABI,
    functionName: "marketInfo",
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!market, refetchInterval: REFETCH_MS },
  });

  const info = data as
    | readonly [number, `0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, string]
    | undefined;

  return {
    state: info ? Number(info[0]) : 0,
    expiry: info ? Number(info[5]) : 0,
    depegThreshold: info ? info[3] : 0n,
    yesSupply: info ? info[7] : 0n,
    noSupply: info ? info[8] : 0n,
    description: info ? info[9] : "",
    isLoading: !!market && isLoading,
  };
}

// state() -> uint8 enum.
export function useMarketState(market: `0x${string}` | null): {
  state: MarketState;
  isLoading: boolean;
} {
  const { data, isLoading } = useReadContract({
    address: market ?? undefined,
    abi: CANARY_MARKET_ABI,
    functionName: "state",
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!market, refetchInterval: REFETCH_MS },
  });

  return {
    state: data !== undefined ? (Number(data) as MarketState) : MarketState.Open,
    isLoading: !!market && isLoading,
  };
}

// yesBalance(addr)/noBalance(addr). Only issued when both market && address.
export function useUserPosition(
  market: `0x${string}` | null,
  address?: `0x${string}`
): { yes: bigint; no: bigint; isLoading: boolean } {
  const enabled = !!market && !!address;
  const { data, isLoading } = useReadContracts({
    contracts: enabled
      ? [
          {
            address: market as `0x${string}`,
            abi: CANARY_MARKET_ABI,
            functionName: "yesBalance",
            args: [address as `0x${string}`],
            chainId: DEFAULT_CHAIN_ID,
          },
          {
            address: market as `0x${string}`,
            abi: CANARY_MARKET_ABI,
            functionName: "noBalance",
            args: [address as `0x${string}`],
            chainId: DEFAULT_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled, refetchInterval: REFETCH_MS },
  });

  const yes = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const no = (data?.[1]?.result as bigint | undefined) ?? 0n;

  return { yes, no, isLoading: enabled && isLoading };
}

// claimableYield(addr)/pendingYield(addr) — ONLY for the yield market; these
// revert on the demo market, so we never issue the call elsewhere.
export function useYieldPosition(
  market: `0x${string}` | null,
  address?: `0x${string}`
): { pending: bigint; claimable: bigint; isLoading: boolean } {
  const enabled = isYieldMarket(market) && !!address;
  const { data, isLoading } = useReadContracts({
    contracts: enabled
      ? [
          {
            address: market as `0x${string}`,
            abi: CANARY_MARKET_ABI,
            functionName: "pendingYield",
            args: [address as `0x${string}`],
            chainId: DEFAULT_CHAIN_ID,
          },
          {
            address: market as `0x${string}`,
            abi: CANARY_MARKET_ABI,
            functionName: "claimableYield",
            args: [address as `0x${string}`],
            chainId: DEFAULT_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled, refetchInterval: REFETCH_MS },
  });

  if (!enabled) return { pending: 0n, claimable: 0n, isLoading: false };

  const pending = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const claimable = (data?.[1]?.result as bigint | undefined) ?? 0n;

  return { pending, claimable, isLoading };
}

// Unified live view for a Market. View-only markets pass their mock values
// straight through (no reads issued); active markets derive price/liquidity/
// state from the live order book.
export function useLiveMarket(m: Market): {
  price: number;
  liquidity: number;
  marketState: MarketState;
  book: OrderBook;
  live: boolean;
  isLoading: boolean;
} {
  const active = isMarketActive(m);
  const target = active ? m.onchainMarket : null;

  const { book, isLoading: bookLoading } = useOrderBook(target);
  const { state, isLoading: stateLoading } = useMarketState(target);

  if (!active) {
    return {
      price: m.priceYes,
      liquidity: m.liquidity,
      marketState: MarketState.Open,
      book: { ids: [], orders: [] },
      live: false,
      isLoading: false,
    };
  }

  return {
    price: priceYes(book),
    liquidity: bookLiquidityUsd(book),
    marketState: state,
    book,
    live: true,
    isLoading: bookLoading || stateLoading,
  };
}
