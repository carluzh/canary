"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Wordmark } from "@/components/top-bar";
import { TradePanel } from "@/components/trade-panel";
import { SiteFooter } from "@/components/site-footer";
import { ConnectWallet } from "@/components/connect-wallet";
import { PriceChart } from "@/components/price-chart";
import { OrderBook, type OrderPick } from "@/components/order-book";
import { ProvideLiquidity } from "@/components/provide-liquidity";
import { getMarket, marketTitle, isMarketActive, type Market } from "@/lib/markets";
import { STABLES } from "@/lib/stables";
import {
  useLiveMarket,
  useMarketState,
  useMarketInfo,
  useUserPosition,
  useYieldPosition,
  useFeedPrice,
} from "@/lib/contracts/markets-onchain";
import { useDemoMarket, useCoverMarket } from "@/lib/web3/demo-market";
import { CrashMarket } from "@/components/demo-controls";
import { MarketState, CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { DEFAULT_CHAIN_ID, RELAYED_MARKET_ADDRESS } from "@/lib/contracts/addresses";
import { redeem } from "@/lib/contracts/canary";
import { usd, cents, pct, timeLeft, formatDate, sharesToUsd } from "@/lib/format";

// Consolidated on the Expert look: dark theme, sans type, the same chart and
// order book as the markets overview. The token + title + stats stick to the top
// of the left column (the right column sticks alongside); picking a level in the
// order book fills a Buy YES / Buy NO intent.
export function MarketDetail({ id }: { id: string }) {
  const m = getMarket(id);
  const [intent, setIntent] = useState<{ side: "yes" | "no"; amount?: number } | null>(null);
  if (!m) return null;
  return <MarketDetailLive m={m} intent={intent} setIntent={setIntent} />;
}

function MarketDetailLive({
  m,
  intent,
  setIntent,
}: {
  m: Market;
  intent: { side: "yes" | "no"; amount?: number } | null;
  setIntent: (i: { side: "yes" | "no"; amount?: number } | null) => void;
}) {
  const stable = STABLES.find((s) => s.symbol === m.asset);
  const live = isMarketActive(m);
  const onPick = (p: OrderPick) => setIntent({ side: p.side, amount: p.size });
  // Side (YES/NO) shared between the order book and the trade panel.
  const [side, setSide] = useState<"yes" | "no">("yes");

  // useLiveMarket is safe for all markets (mock passthrough when view-only), so
  // the first paint stays deterministic with the mock value and only the active
  // USDe market swaps to live reads once they resolve.
  const { price, liquidity, marketState } = useLiveMarket(m);
  // Override-aware active cover-market address: a freshly-created demo market is
  // reflected here so the state badge / expiry follow the new market (null for
  // view-only symbols, which keeps the static behavior). Falls back to the
  // static address while the override resolves.
  const coverMarket = useCoverMarket(m.asset) ?? m.onchainMarket;
  const { state: badgeState } = useMarketState(coverMarket);
  const { expiry: expirySec } = useMarketInfo(coverMarket);

  // Live underlying feed price (USDe/USD). Polls every 1s, so it visibly falls
  // when the market is crashed on stage. Distinct from the cover cost / YES
  // price shown in the stats grid.
  const { feed } = useDemoMarket();
  const { price: feedPrice } = useFeedPrice(live ? feed : null);

  // Live YES price drives YES / NO / implied-probability for the active market;
  // view-only keeps the mock priceYes.
  const yesPrice = live ? price : m.priceYes;
  const liq = live ? liquidity : m.liquidity;
  // Active market: countdown off the on-chain expiry (seconds) once it resolves;
  // fall back to the mock expiry (ms) before that and for view-only markets.
  const expiryMs = live && expirySec > 0 ? expirySec * 1000 : m.expiry;

  return (
    <main className="canary-shell" data-theme="expert" style={{ paddingBottom: 0 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Wordmark />
        <ConnectWallet />
      </header>

      <div className="canary-detail-grid">
        <div>
          {/* sticky identity + stats (scrolls, then pins, no divider) */}
          <div className="canary-detail-head">
            <div className="canary-detail-id">
              {stable?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stable.logo} alt="" className="canary-stable-logo" />
              ) : (
                <span
                  className="canary-stable-fallback"
                  style={{ background: stable?.color ?? "#e0b15a" }}
                >
                  {m.asset.slice(0, 1)}
                </span>
              )}
              <h1 className="canary-detail-title">{marketTitle(m, expiryMs)}</h1>
              {live ? <StatusBadge state={badgeState} /> : (
                <span className="canary-soon">View Only</span>
              )}
            </div>
            <div className="canary-detail-stats">
              <Stat label="YES event" value={cents(yesPrice)} />
              <Stat label="NO safe" value={cents(1 - yesPrice)} />
              <Stat label="Implied prob." value={pct(yesPrice)} />
              <Stat label="Liquidity" value={usd(liq)} />
              <Stat label="Volume" value={usd(m.volume)} />
              <Stat label="Resolves" value={timeLeft(expiryMs)} />
            </div>
          </div>

          <div className="canary-detail-chart">
            <PriceChart symbol={m.asset} />
          </div>

          <OrderBook
            m={m}
            onPick={onPick}
            side={side}
            onSideChange={setSide}
            headerAction={live ? <ProvideLiquidity m={m} /> : undefined}
          />

          <section style={{ marginTop: 32 }}>
            <h2 className="canary-detail-h2">How this resolves</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--c-muted)", margin: 0 }}>
              Settlement is automatic and permissionless. A Chainlink {m.asset}
              /USD feed on Ethereum Sepolia is relayed to the market on Arc over
              CCIP. No committee, no vote.
            </p>
            <dl className="canary-res">
              <div>
                <dt>Underlying</dt>
                <dd>{m.asset} / USD</dd>
              </div>
              <div>
                <dt>Oracle</dt>
                <dd>Chainlink price feed (Sepolia → Arc via CCIP)</dd>
              </div>
              <div>
                <dt>Resolves YES</dt>
                <dd>
                  feed at or below <strong>$0.95</strong> (5% below peg),
                  sustained for <strong>5s (for Demo)</strong>, any time before expiry
                </dd>
              </div>
              <div>
                <dt>Resolves NO</dt>
                <dd>no sustained breach by expiry</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{formatDate(expiryMs)}</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>permissionless. Anyone can settle once the breach or expiry condition is met</dd>
              </div>
              <div>
                <dt>Payout</dt>
                <dd>
                  winning token redeems for <strong>$1 USDC</strong>, losing for $0
                </dd>
              </div>
            </dl>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--c-faint)", marginTop: 14 }}>
              While the market is open, idle USDC collateral earns yield. YES
              holders receive a rebate, with no protocol fee on testnet.
            </p>
            {live && (
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--c-faint)", marginTop: 10 }}>
                Honest note: this live demo settles via the mock demo feed so the
                depeg can be triggered on stage.{" "}
                {RELAYED_MARKET_ADDRESS
                  ? "A separate relayed market mirrors the real Chainlink-via-CCIP signal and is read-only."
                  : "The real Chainlink-via-CCIP signal is wired as a read-only relayed market."}
              </p>
            )}
          </section>
        </div>

        <aside className="canary-detail-aside">
          {!live && (
            <div className="canary-callout-danger">
              Live deposit is enabled for USDe in this demo. {m.asset} market is
              view only.
            </div>
          )}
          <TradePanel m={m} forceExpert intent={intent} side={side} onSideChange={setSide} />
          <PositionPanel
            m={m}
            live={live}
            marketState={marketState}
            market={coverMarket}
          />
          {live && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <FeedTicker price={feedPrice} />
              <CrashMarket />
            </div>
          )}
        </aside>
      </div>

      <div style={{ marginTop: 40 }}>
        <Link href="/markets" className="canary-nav">
          ← All markets
        </Link>
      </div>

      <SiteFooter />
      <div aria-hidden style={{ height: 30 }} />
    </main>
  );
}

// Live underlying-feed ticker (USDe/USD). Clearly labeled as the FEED price so
// it is not confused with the cover cost / YES price. Polls every 1s via
// useFeedPrice, so it visibly falls when the depeg is triggered on stage. Below
// the 0.95 peg threshold it picks up a subtle danger tint + hint.
function FeedTicker({ price }: { price: number | null }) {
  const belowPeg = price != null && price < 0.95;
  const color = belowPeg ? "var(--c-no, #e0556b)" : "var(--c-ink)";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: "var(--sans-stack)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--c-muted)",
        }}
      >
        USDe price
      </span>
      <span
        style={{
          fontFamily: "var(--sans-stack)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 13,
          fontWeight: 700,
          color,
        }}
      >
        {price != null ? `$${price.toFixed(2)}` : "$--"}
      </span>
      {belowPeg && (
        <span
          style={{
            fontFamily: "var(--sans-stack)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--c-no, #e0556b)",
          }}
        >
          below peg
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="canary-stat-label">{label}</div>
      <div className="canary-stat-value">{value}</div>
    </div>
  );
}

function StatusBadge({ state }: { state: MarketState }) {
  const label =
    state === MarketState.TriggeredYes
      ? "Triggered: depeg confirmed"
      : state === MarketState.ExpiredNo
      ? "Expired: no depeg"
      : "Open";
  const color =
    state === MarketState.TriggeredYes
      ? "var(--c-no, #e0556b)"
      : state === MarketState.ExpiredNo
      ? "var(--c-muted)"
      : "var(--c-yes, #3fb27f)";
  return (
    <span
      style={{
        fontFamily: "var(--sans-stack)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// Live "Your position" panel. View-only markets get a small banner and keep the
// mock stats (TradePanel self-disables for them). For the active USDe market we
// read the user's YES (cover) / NO (underwrite) share balances and expose a
// Redeem button that is only enabled once the market has resolved AND the user
// holds the winning side.
function PositionPanel({
  m,
  live,
  marketState,
  market,
}: {
  m: Market;
  live: boolean;
  marketState: MarketState;
  // Override-aware active market address (resolves a freshly-created demo
  // market). Position / state / redeem all target this rather than the static
  // m.onchainMarket so the panel reflects the live override.
  market: `0x${string}` | null;
}) {
  const { address, isConnected } = useAccount();
  // Buy cover gives YES; underwrite mints a set and holds both YES + NO, all on
  // this one market, so the full position reads from a single contract.
  const { yes, no } = useUserPosition(market, address);
  // Yield accrued to the held NO (non-zero only on a yield-enabled market).
  const { claimable: yieldClaimable } = useYieldPosition(market, address);

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!txHash },
  });

  // After a confirmed redeem, clear the write state. useUserPosition polls every
  // 10s on its own interval, so the new (zeroed) balance refetches without a
  // manual handle, and the button flips out of the redeemable state.
  useEffect(() => {
    if (isSuccess) reset();
  }, [isSuccess, reset]);

  if (!live) {
    return (
      <div className="canary-panel" style={{ marginTop: 14 }}>
        <div className="canary-panel-title">Your position</div>
        <div className="canary-banner" style={{ marginTop: 10 }}>
          View only. This market is cosmetic. No live position.
        </div>
      </div>
    );
  }

  const yesUsd = sharesToUsd(yes);
  const noUsd = sharesToUsd(no);
  const claimableUsd = sharesToUsd(yieldClaimable);
  const hasPosition = yes > 0n || no > 0n;

  // Resolved + holding the winning side => redeemable.
  const resolved = marketState !== MarketState.Open;
  const winningSide =
    marketState === MarketState.TriggeredYes
      ? "yes"
      : marketState === MarketState.ExpiredNo
      ? "no"
      : null;
  const holdsWinner =
    (winningSide === "yes" && yes > 0n) || (winningSide === "no" && no > 0n);
  const canRedeem = resolved && holdsWinner && !!market;

  const busy = isPending || isMining;
  const onRedeem = () => {
    if (!market) return;
    // redeem(market) -> { address, functionName: "redeem", args: [] }; use the
    // typed ABI directly so wagmi's writeContract overload resolves cleanly.
    const call = redeem(market);
    writeContract({
      address: call.address,
      abi: CANARY_MARKET_ABI,
      functionName: call.functionName,
      args: call.args,
      chainId: DEFAULT_CHAIN_ID,
    });
  };

  return (
    <div className="canary-panel" style={{ marginTop: 14 }}>
      <div className="canary-panel-title">Your position</div>

      {!isConnected ? (
        <div className="canary-banner" style={{ marginTop: 10 }}>
          Connect your wallet to view your position.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            <PosRow label="Cover (YES shares)" value={`$${yesUsd.toFixed(2)}`} />
            <PosRow label="Underwriting (NO shares)" value={`$${noUsd.toFixed(2)}`} />
            {yieldClaimable > 0n && (
              <PosRow label="Yield claimable" value={`$${claimableUsd.toFixed(2)}`} />
            )}
          </div>

          {!hasPosition && (
            <div style={{ fontSize: 12.5, color: "var(--c-faint)", marginTop: 8 }}>
              No position yet.
            </div>
          )}

          {hasPosition && (
            <div style={{ marginTop: 14 }}>
              <button
                className="canary-btn canary-btn--accent canary-btn--block"
                onClick={onRedeem}
                disabled={!canRedeem || busy}
                title={
                  !resolved
                    ? "Redeem unlocks once the market resolves."
                    : !holdsWinner
                    ? "You do not hold the winning side."
                    : undefined
                }
              >
                {busy ? (
                  <span className="canary-spinner" aria-hidden />
                ) : isSuccess ? (
                  "Redeemed"
                ) : (
                  "Redeem"
                )}
              </button>
              <div style={{ fontSize: 12, color: "var(--c-faint)", marginTop: 8 }}>
                {!resolved
                  ? "Redeem unlocks once the market resolves."
                  : winningSide === "yes"
                  ? "Depeg confirmed. YES redeems for $1 each."
                  : "Expired with no depeg. NO redeems for $1 each."}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PosRow({ label, value }: { label: string; value: string }) {
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
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}
