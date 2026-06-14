"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useMode } from "@/lib/web3/mode";
import { type Market } from "@/lib/markets";
import { cents, usd, sharesToUsd } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/contracts/addresses";
import { CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { PRICE_SCALE, planUnderwrite, type OrderBook } from "@/lib/contracts/canary";
import {
  getOnchainMarket,
  getUnderwriteMarket,
  useOrderBook,
  useYieldPosition,
} from "@/lib/contracts/markets-onchain";
import { BlinkDeposit, type DepositRow } from "@/components/blink-deposit";
import type { DepositCall, DepositPlan } from "@/lib/web3/blink";

// Fill the cheapest asks on a given side for `shares` of exposure. Generalises
// canary.ts planBuyCover to YES (buy cover) or NO; premium is what the buyer
// pays in USDC base units. Empty calls => the book has no liquidity that side.
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
    calls.push({
      address: market,
      abi: CANARY_MARKET_ABI,
      functionName: "fillOrder",
      args: [a.id, take],
    });
    need -= take;
  }
  return { calls, premium, filled: shares - need };
}

function toShares(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  // 6-dec base units; clamp the string so parseUnits never throws.
  return parseUnits(value.toFixed(6), 6);
}

// Total remaining depth on a given sell side of the live book, in 6-dec base
// units. For buy-cover we sum the YES asks: a buy of at most this many shares
// always fills, so the demo never dead-ends on "no liquidity".
function sellDepth(book: OrderBook, yes: boolean): bigint {
  let depth = 0n;
  for (const o of book.orders) {
    if (o.isYes === yes && !o.isBuy && o.remaining > 0n) depth += o.remaining;
  }
  return depth;
}

// premiumPrice is a uint64 in (0, 1e6). Default 1.5% = 15000. Returns null when
// the input is out of range so the underwrite plan stays disabled.
const PREMIUM_MAX = 1_000_000; // 1e6 exclusive
function parsePremiumPrice(raw: string): bigint | null {
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return null;
  // input is a percentage (e.g. 1.5 -> 0.015 -> 15000 scaled).
  const scaled = Math.round((pct / 100) * PREMIUM_MAX);
  if (scaled <= 0 || scaled >= PREMIUM_MAX) return null;
  return BigInt(scaled);
}

export function TradePanel({
  m,
  intent,
  forceExpert,
  forceSimple,
  defaultAmount,
}: {
  m: Market;
  // Picked from a clickable order book (market detail) — sets side + amount.
  intent?: { side: "yes" | "no"; amount?: number } | null;
  // Force the expert (trade) UI regardless of the global Simple/Expert mode.
  forceExpert?: boolean;
  // Force the simple (insurance) UI — used by the Simple buy modal.
  forceSimple?: boolean;
  // Prefill the cover/amount input.
  defaultAmount?: number;
}) {
  const { mode } = useMode();
  const { isConnected, address } = useAccount();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState(() =>
    defaultAmount != null ? String(defaultAmount) : ""
  );
  const [open, setOpen] = useState(false);
  // Buy cover (default) vs. underwrite the yield market.
  const [tradeMode, setTradeMode] = useState<"buy" | "underwrite">("buy");
  // Premium the underwriter asks for, as a percentage. 1.5% = 15000 scaled.
  const [premiumPct, setPremiumPct] = useState("1.5");

  // Sync from an order-book pick.
  useEffect(() => {
    if (!intent) return;
    setSide(intent.side);
    if (intent.amount != null) setAmount(String(Math.round(intent.amount)));
  }, [intent]);

  const onchainMarket = getOnchainMarket(m.asset);
  const { book, refetch } = useOrderBook(onchainMarket);
  const live = !!onchainMarket;

  // Underwrite targets the YIELD market (mintSets + sell YES), NOT the demo
  // buy-cover book. Enabled only where a yield market exists (active USDe).
  const yieldMarket = getUnderwriteMarket(m.asset);
  const canUnderwrite = !!yieldMarket;
  const yieldPos = useYieldPosition(yieldMarket, address);

  // Underwrite is an expert affordance; never surface it in the simple modal.
  const showUnderwrite = !forceSimple && (forceExpert || mode === "expert") && canUnderwrite;
  // If the panel can't underwrite, never leave the user stuck in that mode.
  const effMode: "buy" | "underwrite" =
    showUnderwrite && tradeMode === "underwrite" ? "underwrite" : "buy";
  const underwriting = effMode === "underwrite";

  // Prefill the cover amount when arriving from a card's "Cover $X" option
  // (e.g. /market/usdt?cover=1000).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cover");
    if (c && /^\d+(\.\d+)?$/.test(c)) setAmount(c);
  }, []);

  const simple = forceSimple || (!forceExpert && mode === "simple");
  const n = parseFloat(amount) || 0;
  const effSide = simple ? "yes" : side;
  const buyYes = effSide === "yes";
  const price = buyYes ? m.priceYes : 1 - m.priceYes;

  // simple: input = desired cover (payout); premium = cover × price.
  // expert: input = USDC spent; shares = spent ÷ price.
  const displayPremium = simple ? n * m.priceYes : n;
  const shares = simple ? n : price > 0 ? n / price : 0;

  // Buy-cover clamp: the most cover the seeded YES asks can fill, in USD. A demo
  // buy of up to this much always fills, so we cap rather than dead-end on a bare
  // "not enough liquidity". Only meaningful on the buy side (YES asks consumed).
  const maxFillable = useMemo(
    () => (live ? sharesToUsd(sellDepth(book, buyYes)) : 0),
    [live, book, buyYes]
  );
  // Desired cover exposure (shares) before clamping.
  const wantShares = simple ? n : price > 0 ? n / price : 0;
  const overDepth =
    !underwriting && live && maxFillable > 0 && wantShares > maxFillable + 1e-6;

  // Parsed underwrite premium price (uint64, scaled by 1e6). null when invalid.
  const premiumPrice = useMemo(() => parsePremiumPrice(premiumPct), [premiumPct]);

  // Executable plan: either buy-cover against the demo book (clamped to depth)
  // or underwrite the yield market (mintSets + sell YES at premiumPrice).
  const plan = useMemo<DepositPlan | null>(() => {
    if (underwriting) {
      if (!yieldMarket || premiumPrice == null) return null;
      // input is USDC collateral to lock into a complete set (6-dec base units).
      const collateral = toShares(n);
      if (collateral === 0n) return null;
      const calls = planUnderwrite(yieldMarket, collateral, premiumPrice) as DepositCall[];
      // amount approved/escrowed is the mintSets collateral, NOT a premium.
      return { token: USDC_ADDRESS, spender: yieldMarket, amount: collateral, calls };
    }
    if (!live || !onchainMarket) return null;
    // Clamp the requested shares to the seeded depth so the fill always lands.
    const capped = maxFillable > 0 ? Math.min(wantShares, maxFillable) : wantShares;
    const want = toShares(capped);
    if (want === 0n) return null;
    const { calls, premium, filled } = planBuySide(onchainMarket, book, want, buyYes);
    if (calls.length === 0 || filled === 0n) return null;
    return { token: USDC_ADDRESS, spender: onchainMarket, amount: premium, calls };
  }, [
    underwriting,
    yieldMarket,
    premiumPrice,
    n,
    live,
    onchainMarket,
    book,
    wantShares,
    maxFillable,
    buyYes,
  ]);

  // Prefer the real premium/collateral from the plan once we have it.
  const payValue = plan ? `${usd(Number(plan.amount) / 1e6)} USDC` : `$${displayPremium.toFixed(2)}`;

  const rows: DepositRow[] = underwriting
    ? [
        { label: "Collateral", value: usd(n) },
        { label: "Sell YES at", value: `${(premiumPrice != null ? Number(premiumPrice) / 1e4 : 0).toFixed(2)}%` },
        { label: "Keep", value: "NO side (earns yield)" },
      ]
    : simple
    ? [
        { label: "Cover amount", value: usd(n) },
        { label: "Max payout", value: usd(shares) },
        { label: "If no depeg", value: "Premium only" },
      ]
    : [
        { label: "Side", value: effSide.toUpperCase() },
        { label: "Avg price", value: cents(price) },
        { label: `${effSide.toUpperCase()} shares`, value: shares.toFixed(2) },
      ];

  const disabledReason = underwriting
    ? !canUnderwrite
      ? `Underwriting is enabled for USDe in this demo. ${m.asset} market is coming soon.`
      : premiumPrice == null
      ? "Set a premium between 0% and 100%."
      : !plan
      ? n > 0
        ? "Enter a valid collateral amount to underwrite."
        : "Enter an amount to deposit."
      : undefined
    : !live
    ? `Live deposit is enabled for USDe in this demo. ${m.asset} market is coming soon.`
    : overDepth
    ? `Max ${usd(maxFillable)} available at current depth.`
    : !plan
    ? n > 0
      ? "Not enough liquidity in the book for that size yet."
      : "Enter an amount to deposit."
    : undefined;

  return (
    <div className="canary-panel">
      {/* Buy cover (default) vs. underwrite the yield market. Expert only, and
          only where a yield market exists. Keeps buy-cover the default. */}
      {showUnderwrite && (
        <div className="canary-toggle-buysell" style={{ marginBottom: 14 }}>
          <button data-active={!underwriting} onClick={() => setTradeMode("buy")}>
            Buy cover
          </button>
          <button data-active={underwriting} onClick={() => setTradeMode("underwrite")}>
            Underwrite
          </button>
        </div>
      )}

      {underwriting ? (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              marginBottom: 6,
              fontFamily: "var(--sans-stack)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Underwrite cover
          </div>
          <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
            Deposit collateral, sell the YES side, and keep NO. You earn the
            premium if there is no depeg.
          </div>
        </div>
      ) : simple ? (
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
            Buy YES · {cents(m.priceYes)}
          </button>
          <button data-active={side === "no"} data-side="no" onClick={() => setSide("no")}>
            Buy NO · {cents(1 - m.priceYes)}
          </button>
        </div>
      )}

      <label className="canary-stat-label">
        {underwriting
          ? "Collateral (USDC)"
          : simple
          ? "Cover amount (USDC)"
          : "Amount (USDC)"}
      </label>
      <input
        className="canary-input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{ margin: "6px 0 14px" }}
      />

      {underwriting ? (
        <>
          <label className="canary-stat-label">Premium asked (%)</label>
          <input
            className="canary-input"
            inputMode="decimal"
            placeholder="1.5"
            value={premiumPct}
            onChange={(e) => setPremiumPct(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ margin: "6px 0 14px" }}
          />
          <Row label="Collateral" value={usd(n)} />
          <Row
            label="Sell YES at"
            value={`${(premiumPrice != null ? Number(premiumPrice) / 1e4 : 0).toFixed(2)}%`}
            bold
          />
          {(yieldPos.pending > 0n || yieldPos.claimable > 0n) && (
            <div className="canary-blink-reason" style={{ marginTop: 8 }}>
              Your idle collateral earns yield. Pending {usd(sharesToUsd(yieldPos.pending))},
              claimable {usd(sharesToUsd(yieldPos.claimable))}.
            </div>
          )}
        </>
      ) : (
        <>
          <Row
            label={simple ? "Premium" : "Avg price"}
            value={simple ? payValue : cents(price)}
          />
          <Row
            label={simple ? "Max payout" : `${effSide.toUpperCase()} shares`}
            value={simple ? `$${shares.toFixed(2)}` : shares.toFixed(2)}
            bold
          />
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {!isConnected ? (
          <div className="canary-banner">
            Connect your wallet to{" "}
            {underwriting ? "underwrite" : simple ? "buy cover" : "trade"}.
          </div>
        ) : (
          <button
            className={`canary-btn canary-btn--block ${
              underwriting ? "canary-btn--no" : buyYes ? "canary-btn--yes" : "canary-btn--no"
            }`}
            onClick={() => setOpen(true)}
            disabled={!plan}
            title={disabledReason}
          >
            {underwriting
              ? "Underwrite"
              : !live
              ? "Market not Live."
              : simple
              ? "Buy protection"
              : `Buy ${effSide.toUpperCase()}`}
          </button>
        )}
        {/* not-live ("coming soon") is surfaced as a callout above the panel;
            inline reasons are only the live amount/liquidity/cap hints */}
        {isConnected && (underwriting ? canUnderwrite : live) && disabledReason && (
          <div className="canary-blink-reason" style={{ marginTop: 8 }}>
            {disabledReason}
          </div>
        )}
      </div>

      <BlinkDeposit
        open={open}
        onClose={() => setOpen(false)}
        onDone={refetch}
        title={underwriting ? "Underwrite cover" : simple ? "Buy cover" : `Buy ${effSide.toUpperCase()}`}
        assetSymbol={m.asset}
        assetColor="var(--c-accent)"
        rows={rows}
        payLabel={underwriting ? "You deposit" : "You pay"}
        payValue={payValue}
        cta={underwriting ? "Underwrite" : simple ? "Buy cover" : `Buy ${effSide.toUpperCase()}`}
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
