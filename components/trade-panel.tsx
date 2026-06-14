"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useMode } from "@/lib/web3/mode";
import { type Market } from "@/lib/markets";
import { cents, pct, usd } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/contracts/addresses";
import { CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { PRICE_SCALE, type OrderBook } from "@/lib/contracts/canary";
import { getOnchainMarket, useOrderBook } from "@/lib/contracts/markets-onchain";
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

export function TradePanel({
  m,
  intent,
  forceExpert,
}: {
  m: Market;
  // Picked from a clickable order book (market detail) — sets side + amount.
  intent?: { side: "yes" | "no"; amount?: number } | null;
  // Force the expert (trade) UI regardless of the global Simple/Expert mode.
  forceExpert?: boolean;
}) {
  const { mode } = useMode();
  const { isConnected } = useAccount();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);

  // Sync from an order-book pick.
  useEffect(() => {
    if (!intent) return;
    setSide(intent.side);
    if (intent.amount != null) setAmount(String(Math.round(intent.amount)));
  }, [intent]);

  const onchainMarket = getOnchainMarket(m.asset);
  const { book, refetch } = useOrderBook(onchainMarket);
  const live = !!onchainMarket;

  // Prefill the cover amount when arriving from a card's "Cover $X" option
  // (e.g. /market/usdt?cover=1000).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cover");
    if (c && /^\d+(\.\d+)?$/.test(c)) setAmount(c);
  }, []);

  const simple = !forceExpert && mode === "simple";
  const n = parseFloat(amount) || 0;
  const effSide = simple ? "yes" : side;
  const buyYes = effSide === "yes";
  const price = buyYes ? m.priceYes : 1 - m.priceYes;

  // simple: input = desired cover (payout); premium = cover × price.
  // expert: input = USDC spent; shares = spent ÷ price.
  const displayPremium = simple ? n * m.priceYes : n;
  const shares = simple ? n : price > 0 ? n / price : 0;

  // Executable plan against the live book. coverShares == YES/NO exposure.
  const plan = useMemo<DepositPlan | null>(() => {
    if (!live || !onchainMarket) return null;
    const want = toShares(shares);
    if (want === 0n) return null;
    const { calls, premium, filled } = planBuySide(onchainMarket, book, want, buyYes);
    if (calls.length === 0 || filled === 0n) return null;
    return { token: USDC_ADDRESS, spender: onchainMarket, amount: premium, calls };
  }, [live, onchainMarket, book, shares, buyYes]);

  // Prefer the real premium from the book once we have a plan.
  const payValue = plan ? `${usd(Number(plan.amount) / 1e6)} USDC` : `$${displayPremium.toFixed(2)}`;

  const rows: DepositRow[] = simple
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

  const disabledReason = !live
    ? `Live deposit is enabled for USDe in this demo. ${m.asset} market is coming soon.`
    : !plan
    ? n > 0
      ? "Not enough liquidity in the book for that size yet."
      : "Enter an amount to deposit."
    : undefined;

  return (
    <div className="canary-panel">
      {simple ? (
        <div style={{ marginBottom: 14 }}>
          <div className="canary-kicker" style={{ marginBottom: 6 }}>
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
        {simple ? "Cover amount (USDC)" : "Amount (USDC)"}
      </label>
      <input
        className="canary-input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{ margin: "6px 0 14px" }}
      />

      <Row
        label={simple ? "Premium" : "Avg price"}
        value={simple ? payValue : cents(price)}
      />
      <Row
        label={simple ? "Max payout" : `${effSide.toUpperCase()} shares`}
        value={simple ? `$${shares.toFixed(2)}` : shares.toFixed(2)}
        bold
      />

      <div style={{ marginTop: 14 }}>
        {!isConnected ? (
          <div className="canary-banner">
            Connect your wallet to {simple ? "buy cover" : "trade"}.
          </div>
        ) : (
          <button
            className={`canary-btn canary-btn--block ${
              buyYes ? "canary-btn--yes" : "canary-btn--no"
            }`}
            onClick={() => setOpen(true)}
            disabled={!plan}
            title={disabledReason}
          >
            {simple ? "Buy protection" : `Buy ${effSide.toUpperCase()}`}
          </button>
        )}
        {/* not-live ("coming soon") is surfaced as a callout above the panel;
            inline reasons are only the live amount/liquidity hints */}
        {isConnected && live && disabledReason && (
          <div className="canary-blink-reason" style={{ marginTop: 8 }}>
            {disabledReason}
          </div>
        )}
      </div>

      {simple && (
        <p
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--c-faint)",
            fontFamily: "var(--sans-stack)",
          }}
        >
          {`1 cover token redeems for $1 if the event resolves YES (${pct(m.priceYes)} implied).`}
        </p>
      )}

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
