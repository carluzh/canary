"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/top-bar";
import { TradePanel } from "@/components/trade-panel";
import { SiteFooter } from "@/components/site-footer";
import { ConnectWallet } from "@/components/connect-wallet";
import { PriceChart } from "@/components/price-chart";
import { OrderBook, type OrderPick } from "@/components/order-book";
import { getMarket, marketTitle } from "@/lib/markets";
import { STABLES } from "@/lib/stables";
import { getOnchainMarket } from "@/lib/contracts/markets-onchain";
import { usd, cents, pct, timeLeft, formatDate } from "@/lib/format";

// Consolidated on the Expert look: dark theme, sans type, the same chart and
// order book as the markets overview. The token + title + stats stick to the top
// of the left column (the right column sticks alongside); picking a level in the
// order book fills a Buy YES / Buy NO intent.
export function MarketDetail({ id }: { id: string }) {
  const m = getMarket(id);
  const [intent, setIntent] = useState<{ side: "yes" | "no"; amount?: number } | null>(null);
  if (!m) return null;

  const stable = STABLES.find((s) => s.symbol === m.asset);
  const live = !!getOnchainMarket(m.asset);
  const onPick = (p: OrderPick) => setIntent({ side: p.side, amount: p.size });

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
          {/* sticky identity + stats (scrolls, then pins — no divider) */}
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
              <h1 className="canary-detail-title">{marketTitle(m)}</h1>
            </div>
            <div className="canary-detail-stats">
              <Stat label="YES (event)" value={cents(m.priceYes)} />
              <Stat label="NO (safe)" value={cents(1 - m.priceYes)} />
              <Stat label="Implied prob." value={pct(m.priceYes)} />
              <Stat label="Liquidity" value={usd(m.liquidity)} />
              <Stat label="Volume" value={usd(m.volume)} />
              <Stat label="Resolves" value={timeLeft(m.expiry)} />
            </div>
          </div>

          <div className="canary-detail-chart">
            <PriceChart symbol={m.asset} />
          </div>

          <OrderBook m={m} onPick={onPick} />

          <section style={{ marginTop: 32 }}>
            <h2 className="canary-detail-h2">How this resolves</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--c-muted)", margin: 0 }}>
              Settlement is automatic and permissionless — a Chainlink {m.asset}
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
                  sustained for <strong>15 min</strong>, any time before expiry
                </dd>
              </div>
              <div>
                <dt>Resolves NO</dt>
                <dd>no sustained breach by expiry</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{formatDate(m.expiry)}</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>permissionless — anyone can settle once the breach or expiry condition is met</dd>
              </div>
              <div>
                <dt>Payout</dt>
                <dd>
                  winning token redeems for <strong>$1 USDC</strong>, losing for $0
                </dd>
              </div>
            </dl>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--c-faint)", marginTop: 14 }}>
              While the market is open, idle USDC collateral earns yield — YES
              holders receive a rebate, with no protocol fee on testnet.
            </p>
          </section>
        </div>

        <aside className="canary-detail-aside">
          {!live && (
            <div className="canary-callout-danger">
              Live deposit is enabled for USDe in this demo. {m.asset} market is
              coming soon.
            </div>
          )}
          <TradePanel m={m} forceExpert intent={intent} />
          <div className="canary-panel" style={{ marginTop: 14 }}>
            <div className="canary-panel-title">No position yet.</div>
          </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="canary-stat-label">{label}</div>
      <div className="canary-stat-value">{value}</div>
    </div>
  );
}
