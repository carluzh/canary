// Markets are derived from the stablecoin set (lib/stables.ts) so the Simple
// (insurance) and Expert (trading) views share one source of truth. Mirrors the
// on-chain BinaryMarket (lib/contracts/abi.ts) for a drop-in swap to live reads.

import { STABLES, type Stable } from "@/lib/stables";
import { formatDate } from "@/lib/format";
import {
  getOnchainMarket,
  getUnderwriteMarket,
  isActiveSymbol,
} from "@/lib/contracts/active-markets";

export type MarketKind = "depeg" | "exploit";
export type MarketStatus = "open" | "resolved-yes" | "resolved-no";

export type Market = {
  id: string;
  kind: MarketKind;
  asset: string;
  category: "Stablecoin" | "Protocol";
  question: string;
  insureLabel: string;
  priceYes: number; // 0..1 — YES price == implied probability == cost of cover
  liquidity: number;
  volume: number;
  // Market resolution state (kept for the cosmetic mock set).
  resolution: MarketStatus;
  expiry: number;
  // Live wiring: buy-cover + underwrite market addresses (null when cosmetic).
  onchainMarket: `0x${string}` | null;
  underwriteMarket: `0x${string}` | null;
  // 'active' = backed by live contracts; 'view-only' = cosmetic mock.
  status: "active" | "view-only";
};

export const premiumPct = (m: Market) => m.priceYes;
export const payoutMultiple = (m: Market) => 1 / m.priceYes;

// Polymarket-style market title, shared by the card and the detail page. The
// optional expiryMs override lets a live market show its real on-chain expiry
// instead of the mock EXPIRY, keeping the title in sync with the countdown.
export const marketTitle = (m: Market, expiryMs?: number) =>
  `Will ${m.asset} lose its $1 peg by ${formatDate(expiryMs ?? m.expiry)}?`;

// Fixed expiry keeps server/client render deterministic (no Date.now at load).
// All markets settle at end of year.
const EXPIRY = Date.parse("2026-12-31T20:00:00Z");

function toMarket(s: Stable): Market {
  const symbol = s.symbol.toLowerCase();
  return {
    id: symbol,
    kind: "depeg",
    asset: s.symbol,
    category: "Stablecoin",
    question: `Will ${s.symbol} lose its $1 peg before expiry?`,
    insureLabel: `${s.symbol} loses its $1 peg`,
    priceYes: s.coverCost,
    liquidity: s.capacityUsed,
    volume: Math.round(s.capacityUsed * 0.42),
    resolution: "open",
    expiry: EXPIRY,
    onchainMarket: getOnchainMarket(symbol),
    underwriteMarket: getUnderwriteMarket(symbol),
    status: isActiveSymbol(symbol) ? "active" : "view-only",
  };
}

export const MOCK_MARKETS: Market[] = STABLES.map(toMarket);

export function getMarket(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}

export function isMarketActive(m: Market): boolean {
  return m.status === "active";
}

export const MARKET_CATEGORIES = ["All", "Stablecoin"] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
