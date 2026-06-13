// Maps the frontend's single-price / buy-cover / underwrite UX onto the
// CanaryMarket order book. Framework-light (viem call descriptors) so it drops
// into wagmi `useReadContract` / `writeContract` or a plain viem client.
//
// Units:
//   - amounts (shares, USDC) are in USDC base units, 6 decimals.
//   - order price is scaled by PRICE_SCALE (1e6): price 60_000 = $0.06/share = 6%.
//   - a YES share redeems for $1 (1e6 base units) if the depeg happens.
import { CANARY_MARKET_ABI, ERC20_ABI } from "./abi";

export const PRICE_SCALE = 1_000_000n; // 1e6
export const USDC_DECIMALS = 6;

export type OnchainOrder = {
  maker: `0x${string}`;
  isYes: boolean;
  isBuy: boolean;
  price: bigint; // PRICE_SCALE-scaled
  remaining: bigint; // shares
  collateralEscrow: bigint;
};

export type OrderBook = { ids: bigint[]; orders: OnchainOrder[] };

// ---- READS: derive the single "price" your UI shows from the book ----------

/** Cheapest YES ask (lowest sell-YES price) = current cost of cover. null if none. */
export function bestYesAsk(book: OrderBook): { id: bigint; order: OnchainOrder } | null {
  let best: { id: bigint; order: OnchainOrder } | null = null;
  book.orders.forEach((o, i) => {
    if (o.isYes && !o.isBuy && o.remaining > 0n) {
      if (!best || o.price < best.order.price) best = { id: book.ids[i], order: o };
    }
  });
  return best;
}

/** Highest YES bid (best buy-YES price). Used for the bid side of the spread. */
export function bestYesBid(book: OrderBook): { id: bigint; order: OnchainOrder } | null {
  let best: { id: bigint; order: OnchainOrder } | null = null;
  book.orders.forEach((o, i) => {
    if (o.isYes && o.isBuy && o.remaining > 0n) {
      if (!best || o.price > best.order.price) best = { id: book.ids[i], order: o };
    }
  });
  return best;
}

/**
 * Market-implied YES price in 0..1 — the risk-curve data point and the premium
 * your trade panel shows. Uses the best ask (what a buyer actually pays);
 * falls back to mid, then bid, then 0.5 if the book is one-sided/empty.
 */
export function priceYes(book: OrderBook): number {
  const ask = bestYesAsk(book);
  const bid = bestYesBid(book);
  if (ask && bid) return Number(ask.order.price + bid.order.price) / 2 / Number(PRICE_SCALE);
  if (ask) return Number(ask.order.price) / Number(PRICE_SCALE);
  if (bid) return Number(bid.order.price) / Number(PRICE_SCALE);
  return 0.5;
}

// ---- WRITES: return wagmi `writeContract` descriptors --------------------

type Call = { address: `0x${string}`; abi: unknown; functionName: string; args: unknown[] };

/**
 * Buy `coverShares` of cover (simple mode "Cover amount") by filling the
 * cheapest YES asks. Returns the fillOrder calls (execute in sequence) and the
 * total premium the buyer pays. Caller must approve USDC for `premium` first.
 */
export function planBuyCover(
  market: `0x${string}`,
  book: OrderBook,
  coverShares: bigint
): { calls: Call[]; premium: bigint; filled: bigint } {
  const asks = book.orders
    .map((o, i) => ({ id: book.ids[i], order: o }))
    .filter((x) => x.order.isYes && !x.order.isBuy && x.order.remaining > 0n)
    .sort((a, b) => (a.order.price < b.order.price ? -1 : 1));

  const calls: Call[] = [];
  let need = coverShares;
  let premium = 0n;
  for (const a of asks) {
    if (need === 0n) break;
    const take = need < a.order.remaining ? need : a.order.remaining;
    // premium for this slice = ceil(take * price / PRICE_SCALE) — matches the contract.
    premium += (take * a.order.price + PRICE_SCALE - 1n) / PRICE_SCALE;
    calls.push({ address: market, abi: CANARY_MARKET_ABI, functionName: "fillOrder", args: [a.id, take] });
    need -= take;
  }
  return { calls, premium, filled: coverShares - need };
}

/**
 * Underwrite (Blink "deposit to underwrite"): deposit `amount` USDC, mint a
 * complete set, and sell the YES side at `premiumPrice` (PRICE_SCALE-scaled),
 * keeping NO. Earns the premium if no depeg. Approve USDC for `amount` first.
 */
export function planUnderwrite(market: `0x${string}`, amount: bigint, premiumPrice: bigint): Call[] {
  return [
    { address: market, abi: CANARY_MARKET_ABI, functionName: "mintSets", args: [amount] },
    { address: market, abi: CANARY_MARKET_ABI, functionName: "placeOrder", args: [true, false, premiumPrice, amount] },
  ];
}

export function approveUsdc(usdc: `0x${string}`, market: `0x${string}`, amount: bigint): Call {
  return { address: usdc, abi: ERC20_ABI, functionName: "approve", args: [market, amount] };
}

export function redeem(market: `0x${string}`): Call {
  return { address: market, abi: CANARY_MARKET_ABI, functionName: "redeem", args: [] };
}

/** Permissionless settlement once a depeg is provable. `startRoundId` from the feed. */
export function settleDepeg(market: `0x${string}`, startRoundId: bigint): Call {
  return { address: market, abi: CANARY_MARKET_ABI, functionName: "settleDepeg", args: [startRoundId] };
}
