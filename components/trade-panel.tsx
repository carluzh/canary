"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useMode } from "@/lib/web3/mode";
import { type Market } from "@/lib/markets";
import { cents, usd, sharesToUsd } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/contracts/addresses";
import { CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { PRICE_SCALE, type OrderBook } from "@/lib/contracts/canary";
import { useOrderBook } from "@/lib/contracts/markets-onchain";
import { useCoverMarket } from "@/lib/web3/demo-market";
import { BlinkDeposit, type DepositRow } from "@/components/blink-deposit";
import type { DepositCall, DepositPlan } from "@/lib/web3/blink";

// Taker UI: one pill (Buy YES | Buy NO), Market or Limit, against the live book
// through the Blink deposit. Minting / liquidity lives in the Provide Liquidity
// modal. The selected side is shared with the order book.

// Market buy: fill the cheapest asks on a side for `shares`. Empty calls => no
// liquidity that side.
function planBuySide(
  market: `0x${string}`,
  book: OrderBook,
  shares: bigint,
  yes: boolean
): { calls: DepositCall[]; premium: bigint; filled: bigint } {
  const asks = book.orders
    .map((o, i) => ({ id: book.ids[i]!, order: o }))
    .filter((x) => x.order.isYes === yes && !x.order.isBuy && x.order.remaining > 0n)
    .sort((a, b) => (a.order.price < b.order.price ? -1 : 1));

  const calls: DepositCall[] = [];
  let need = shares;
  let premium = 0n;
  for (const a of asks) {
    if (need === 0n) break;
    const take = need < a.order.remaining ? need : a.order.remaining;
    premium += (take * a.order.price + PRICE_SCALE - 1n) / PRICE_SCALE;
    calls.push({ address: market, abi: CANARY_MARKET_ABI, functionName: "fillOrder", args: [a.id, take] });
    need -= take;
  }
  return { calls, premium, filled: shares - need };
}

// Limit buy: spend `usdc` to buy `usdc/price` shares at `priceScaled`. Fill any
// asks at or below the limit (cheapest first), then REST the remainder as a bid.
// The contract does not match on placement, so we fill-through here. amount =
// total USDC pulled (fill premiums + resting-bid escrow).
function planLimitBuy(
  market: `0x${string}`,
  book: OrderBook,
  usdc: bigint,
  priceScaled: bigint,
  yes: boolean
): { calls: DepositCall[]; amount: bigint } {
  if (priceScaled <= 0n || usdc <= 0n) return { calls: [], amount: 0n };
  const shares = (usdc * PRICE_SCALE) / priceScaled;
  if (shares === 0n) return { calls: [], amount: 0n };

  const asks = book.orders
    .map((o, i) => ({ id: book.ids[i]!, order: o }))
    .filter((x) => x.order.isYes === yes && !x.order.isBuy && x.order.remaining > 0n && x.order.price <= priceScaled)
    .sort((a, b) => (a.order.price < b.order.price ? -1 : 1));

  const calls: DepositCall[] = [];
  let need = shares;
  let amount = 0n;
  for (const a of asks) {
    if (need === 0n) break;
    const take = need < a.order.remaining ? need : a.order.remaining;
    amount += (take * a.order.price + PRICE_SCALE - 1n) / PRICE_SCALE;
    calls.push({ address: market, abi: CANARY_MARKET_ABI, functionName: "fillOrder", args: [a.id, take] });
    need -= take;
  }
  if (need > 0n) {
    amount += (need * priceScaled + PRICE_SCALE - 1n) / PRICE_SCALE;
    calls.push({ address: market, abi: CANARY_MARKET_ABI, functionName: "placeOrder", args: [yes, true, priceScaled, need] });
  }
  return { calls, amount };
}

function toShares(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return parseUnits(value.toFixed(6), 6);
}

function sellDepth(book: OrderBook, yes: boolean): bigint {
  let depth = 0n;
  for (const o of book.orders) {
    if (o.isYes === yes && !o.isBuy && o.remaining > 0n) depth += o.remaining;
  }
  return depth;
}

// Best (lowest) ask for a side, as a 0..1 fraction. The displayed price/shares
// come from this live book ask, not the mock m.priceYes. null if no ask.
function bestAskFrac(book: OrderBook, yes: boolean): number | null {
  let best: bigint | null = null;
  for (const o of book.orders) {
    if (o.isYes === yes && !o.isBuy && o.remaining > 0n) {
      if (best === null || o.price < best) best = o.price;
    }
  }
  return best === null ? null : Number(best) / 1e6;
}

export function TradePanel({
  m,
  intent,
  forceExpert,
  forceSimple,
  defaultAmount,
  side: sideProp,
  onSideChange,
}: {
  m: Market;
  intent?: { side: "yes" | "no"; amount?: number } | null;
  forceExpert?: boolean;
  forceSimple?: boolean;
  defaultAmount?: number;
  // Controlled side, shared with the order book. Falls back to internal state.
  side?: "yes" | "no";
  onSideChange?: (s: "yes" | "no") => void;
}) {
  const { mode } = useMode();
  const { isConnected } = useAccount();
  const [sideInner, setSideInner] = useState<"yes" | "no">("yes");
  const side = sideProp ?? sideInner;
  const setSide = onSideChange ?? setSideInner;
  const [amount, setAmount] = useState(() =>
    defaultAmount != null ? String(defaultAmount) : ""
  );
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPx, setLimitPx] = useState(""); // cents

  // Sync from an order-book pick: set the shared side + prefill the amount.
  useEffect(() => {
    if (!intent) return;
    setSide(intent.side);
    if (intent.amount != null) setAmount(String(Math.round(intent.amount)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const onchainMarket = useCoverMarket(m.asset);
  const { book, refetch } = useOrderBook(onchainMarket);
  const live = !!onchainMarket;

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cover");
    if (c && /^\d+(\.\d+)?$/.test(c)) setAmount(c);
  }, []);

  const simple = forceSimple || (!forceExpert && mode === "simple");
  const n = parseFloat(amount) || 0;
  const effSide = simple ? "yes" : side;
  const buyYes = effSide === "yes";
  // Live best ask per side drives displayed price + shares (mock for view-only).
  const yesLive = live ? bestAskFrac(book, true) ?? m.priceYes : m.priceYes;
  const noLive = live ? bestAskFrac(book, false) ?? 1 - yesLive : 1 - m.priceYes;
  const price = buyYes ? yesLive : noLive;
  const isLimit = !simple && orderType === "limit";

  // Limit price (cents) -> PRICE_SCALE units (1¢ = 10000).
  const limitScaled = useMemo(() => {
    const c = parseFloat(limitPx);
    if (!Number.isFinite(c) || c <= 0) return 0n;
    return BigInt(Math.round(c * 10_000));
  }, [limitPx]);
  const limitFrac = Number(limitScaled) / 1e6;
  const limitShares = isLimit && limitFrac > 0 ? n / limitFrac : 0;

  const displayPremium = simple ? n * m.priceYes : n;
  const shares = simple ? n : price > 0 ? n / price : 0;

  // Market-buy depth clamp.
  const maxFillable = useMemo(
    () => (live ? sharesToUsd(sellDepth(book, buyYes)) : 0),
    [live, book, buyYes]
  );
  const overDepth = !isLimit && live && maxFillable > 0 && shares > maxFillable + 1e-6;
  const filled = !isLimit && live && maxFillable > 0 ? Math.min(shares, maxFillable) : shares;

  const plan = useMemo<DepositPlan | null>(() => {
    if (!live || !onchainMarket) return null;
    if (isLimit) {
      if (limitScaled <= 0n || limitScaled >= PRICE_SCALE) return null;
      const usdc = toShares(n);
      if (usdc === 0n) return null;
      const { calls, amount } = planLimitBuy(onchainMarket, book, usdc, limitScaled, buyYes);
      if (calls.length === 0) return null;
      return { token: USDC_ADDRESS, spender: onchainMarket, amount, calls };
    }
    const capped = maxFillable > 0 ? Math.min(shares, maxFillable) : shares;
    const want = toShares(capped);
    if (want === 0n) return null;
    const { calls, premium, filled: f } = planBuySide(onchainMarket, book, want, buyYes);
    if (calls.length === 0 || f === 0n) return null;
    return { token: USDC_ADDRESS, spender: onchainMarket, amount: premium, calls };
  }, [live, onchainMarket, book, shares, maxFillable, buyYes, isLimit, limitScaled, n]);

  const payValue = plan ? `${usd(Number(plan.amount) / 1e6)} USDC` : `$${displayPremium.toFixed(2)}`;

  const rows: DepositRow[] = simple
    ? [
        { label: "Cover amount", value: usd(filled) },
        { label: "Max payout", value: usd(filled) },
        { label: "If no depeg", value: "Premium only" },
      ]
    : isLimit
    ? [
        { label: "Side", value: effSide.toUpperCase() },
        { label: "Limit price", value: cents(limitFrac) },
        { label: `${effSide.toUpperCase()} shares`, value: limitShares.toFixed(2) },
      ]
    : [
        { label: "Side", value: effSide.toUpperCase() },
        { label: "Avg price", value: cents(price) },
        { label: `${effSide.toUpperCase()} shares`, value: filled.toFixed(2) },
      ];

  const disabledReason = !live
    ? `Live deposit is enabled for USDe in this demo. ${m.asset} market is coming soon.`
    : isLimit
    ? limitScaled <= 0n || limitScaled >= PRICE_SCALE
      ? "Enter a limit price between 0 and 100¢."
      : !plan
      ? n > 0
        ? "Enter an amount and price."
        : "Enter an amount to deposit."
      : undefined
    : overDepth
    ? `Max ${usd(maxFillable)} available at current depth.`
    : !plan
    ? n > 0
      ? "Not enough liquidity in the book for that size yet."
      : "Enter an amount to deposit."
    : undefined;

  return (
    <div className="canary-panel">
      {simple ? (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              marginBottom: 6,
              fontFamily: "var(--sans-stack)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Buy protection
          </div>
          <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
            Pay a premium now, get a fixed payout if <strong>{m.insureLabel}</strong>.
          </div>
        </div>
      ) : (
        <div className="canary-toggle-buysell" style={{ marginBottom: 14 }}>
          <button data-active={side === "yes"} data-side="yes" onClick={() => setSide("yes")}>
            Buy YES · {cents(yesLive)}
          </button>
          <button data-active={side === "no"} data-side="no" onClick={() => setSide("no")}>
            Buy NO · {cents(noLive)}
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <label className="canary-stat-label">
          {simple ? "Cover amount (USDC)" : "Amount (USDC)"}
        </label>
        {!simple && (
          <span style={{ display: "inline-flex", gap: 10 }}>
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "var(--sans-stack)",
                  fontSize: 11,
                  color: orderType === t ? "var(--c-ink)" : "var(--c-muted)",
                  textDecoration: orderType === t ? "none" : "underline",
                  fontWeight: orderType === t ? 600 : 400,
                }}
              >
                {t === "market" ? "Market" : "Limit"}
              </button>
            ))}
          </span>
        )}
      </div>
      <input
        className="canary-input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{ margin: "6px 0 14px" }}
      />

      {isLimit && (
        <>
          <label className="canary-stat-label">Limit price (¢)</label>
          <input
            className="canary-input"
            inputMode="decimal"
            placeholder={(price * 100).toFixed(1)}
            value={limitPx}
            onChange={(e) => setLimitPx(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ margin: "6px 0 14px" }}
          />
        </>
      )}

      <Row
        label={simple ? "Premium" : isLimit ? "Limit price" : "Avg price"}
        value={simple ? payValue : isLimit ? cents(limitFrac) : cents(price)}
      />
      <Row
        label={simple ? "Max payout" : `${effSide.toUpperCase()} shares`}
        value={simple ? `$${filled.toFixed(2)}` : (isLimit ? limitShares : filled).toFixed(2)}
        bold
      />

      <div style={{ marginTop: 14 }}>
        {!isConnected ? (
          <div className="canary-banner">
            Connect your wallet to {simple ? "buy cover" : "trade"}.
          </div>
        ) : (
          <button
            className={`canary-btn canary-btn--block ${buyYes ? "canary-btn--yes" : "canary-btn--no"}`}
            onClick={() => setOpen(true)}
            disabled={!plan}
            title={disabledReason}
          >
            {!live
              ? "Market not Live."
              : simple
              ? "Buy protection"
              : `Buy ${effSide.toUpperCase()}`}
          </button>
        )}
        {isConnected && live && disabledReason && (
          <div className="canary-blink-reason" style={{ marginTop: 8 }}>
            {disabledReason}
          </div>
        )}
      </div>

      <BlinkDeposit
        open={open}
        onClose={() => setOpen(false)}
        onDone={refetch}
        title={simple ? "Buy cover" : `Buy ${effSide.toUpperCase()}`}
        assetSymbol={m.asset}
        assetColor="var(--c-accent)"
        rows={rows}
        payLabel="You pay"
        payValue={payValue}
        cta={simple ? "Buy cover" : `Buy ${effSide.toUpperCase()}`}
        plan={plan}
        disabledReason={disabledReason}
      />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
        marginBottom: 8,
      }}
    >
      <span style={{ color: "var(--c-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--sans-stack)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: bold ? 600 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
