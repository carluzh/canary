// Market domain model + mock data. Mirrors the on-chain BinaryMarket
// (lib/contracts/abi.ts) so swapping to live reads is a drop-in.

export type MarketKind = "depeg" | "exploit";
export type MarketStatus = "open" | "resolved-yes" | "resolved-no";

export type Market = {
  id: string;
  kind: MarketKind;
  asset: string; // "USDe", "Aave v3", …
  category: "Stablecoin" | "Protocol";
  question: string; // full market question
  insureLabel: string; // simple-mode framing, e.g. "USDe depegs >10%"
  priceYes: number; // 0..1 — YES price == implied probability == cost of cover
  liquidity: number; // USD locked (NO-side collateral)
  volume: number; // USD traded
  expiry: number; // ms timestamp
  status: MarketStatus;
};

// Cost of $1 of cover (the premium) and the resulting payout multiple.
export const premiumPct = (m: Market) => m.priceYes;
export const payoutMultiple = (m: Market) => 1 / m.priceYes;

// Fixed absolute expiries keep server/client render deterministic (no Date.now
// at module load → no hydration mismatch).
const JUN14 = Date.parse("2026-06-14T20:00:00Z");
const JUL01 = Date.parse("2026-07-01T20:00:00Z");
const DEC31 = Date.parse("2026-12-31T20:00:00Z");

export const MOCK_MARKETS: Market[] = [
  {
    id: "usde-depeg-10",
    kind: "depeg",
    asset: "USDe",
    category: "Stablecoin",
    question: "Will USDe trade below $0.90 before expiry?",
    insureLabel: "USDe depegs more than 10%",
    priceYes: 0.05,
    liquidity: 184_000,
    volume: 412_000,
    expiry: JUN14,
    status: "open",
  },
  {
    id: "usdc-depeg-3",
    kind: "depeg",
    asset: "USDC",
    category: "Stablecoin",
    question: "Will USDC trade below $0.97 before expiry?",
    insureLabel: "USDC depegs more than 3%",
    priceYes: 0.02,
    liquidity: 320_000,
    volume: 690_000,
    expiry: JUL01,
    status: "open",
  },
  {
    id: "dai-depeg-5",
    kind: "depeg",
    asset: "DAI",
    category: "Stablecoin",
    question: "Will DAI trade below $0.95 before expiry?",
    insureLabel: "DAI depegs more than 5%",
    priceYes: 0.03,
    liquidity: 96_000,
    volume: 142_000,
    expiry: JUL01,
    status: "open",
  },
  {
    id: "aave-exploit",
    kind: "exploit",
    asset: "Aave v3",
    category: "Protocol",
    question: "Will an exploit drain >$10M from Aave v3 before expiry?",
    insureLabel: "Aave v3 is exploited for >$10M",
    priceYes: 0.04,
    liquidity: 128_000,
    volume: 88_000,
    expiry: DEC31,
    status: "open",
  },
  {
    id: "morpho-exploit",
    kind: "exploit",
    asset: "Morpho",
    category: "Protocol",
    question: "Will an exploit drain >$5M from Morpho before expiry?",
    insureLabel: "Morpho is exploited for >$5M",
    priceYes: 0.06,
    liquidity: 54_000,
    volume: 37_000,
    expiry: DEC31,
    status: "open",
  },
];

export function getMarket(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}

export const MARKET_CATEGORIES = ["All", "Stablecoin", "Protocol"] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
