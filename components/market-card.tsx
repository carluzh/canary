"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { STABLES, type Stable } from "@/lib/stables";
import { type Market, marketTitle, isMarketActive } from "@/lib/markets";
import { usd, timeLeft } from "@/lib/format";
import { useLiveMarket } from "@/lib/contracts/markets-onchain";
import { PriceChart } from "@/components/price-chart";
import { OrderBook } from "@/components/order-book";

// Expert surface: a market-maker's market row. Same family as the Simple
// StableCard (crisp header coin, sans type, muted Liquidity/Volume footer), with
// an interactive chart on the left and a limit-order book over a Start-Trading /
// share / promotions action row on the right.

const SHARE_URL = "https://canary.example";

export function MarketCard({ m }: { m: Market }) {
  const stable: Stable | undefined = STABLES.find((s) => s.symbol === m.asset);
  const active = isMarketActive(m);

  // Live reads for the active (USDe) market: liquidity = book depth in USD.
  // View-only markets get a pure mock passthrough (liquidity = m.liquidity),
  // so this is safe to call unconditionally and keeps the visuals identical.
  // Keep the mock value as the deterministic first paint until the live book
  // resolves (live + loaded + non-empty) so USDe does not hydration-mismatch.
  const { liquidity: liveLiquidity, live, isLoading } = useLiveMarket(m);
  const liquidity = live && !isLoading && liveLiquidity > 0 ? liveLiquidity : m.liquidity;

  const rewards = Math.max(1, Math.round(liquidity / 200_000));

  const shareHref = `https://x.com/intent/tweet?text=${encodeURIComponent(
    `Trading the ${m.asset} depeg market on canary.`
  )}&url=${encodeURIComponent(SHARE_URL)}`;

  return (
    <div
      className="canary-mm-card"
      data-inactive={active ? undefined : "true"}
      style={{ ["--brand"]: stable?.color ?? "#e0b15a" } as CSSProperties}
    >
      {/* left half: identity → interactive chart → liquidity/volume */}
      <div className="canary-mm-main">
        <div className="canary-mm-head">
          <TokenLogo s={stable} symbol={m.asset} />
          <div style={{ minWidth: 0 }}>
            <div className="canary-mm-name">
              {marketTitle(m)}
              {!active && <span className="canary-soon">View Only</span>}
            </div>
            <div className="canary-mm-sub">
              {stable?.name ?? m.asset} · {timeLeft(m.expiry)}
            </div>
          </div>
        </div>

        <div className="canary-mm-chart">
          <PriceChart symbol={m.asset} />
        </div>

        <div className="canary-mm-foot">
          <span>
            Liquidity <strong>{usd(liquidity)}</strong>
          </span>
          <span>
            Volume <strong>{usd(m.volume)}</strong>
          </span>
        </div>
      </div>

      {/* right half: compact order book + actions */}
      <div className="canary-ob-col">
        <OrderBook m={m} />

        <div className="canary-mm-actions">
          {active ? (
            <Link
              href={`/market/${m.id}`}
              className="canary-btn canary-btn--ink canary-mm-cta"
            >
              Start Trading
            </Link>
          ) : (
            <div
              className="canary-btn canary-btn--ink canary-mm-cta"
              aria-disabled="true"
            >
              Start Trading
            </div>
          )}
          {active ? (
          <a
            className="canary-mm-iconbtn"
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share ${m.asset} market`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="square" strokeMiterlimit={10} strokeWidth={2} aria-hidden>
              <polyline points="12 16 12 1.5 12 2.5" />
              <polyline points="8 5.5 12 1.5 16 5.5" />
              <path d="m16,10h2c1.1046,0,2,.8954,2,2v8c0,1.1046-.8954,2-2,2H6c-1.1046,0-2-.8954-2-2v-8c0-1.1046.8954-2,2-2h2" />
            </svg>
          </a>
          ) : (
            <span
              className="canary-mm-iconbtn"
              aria-disabled="true"
              aria-label={`Share ${m.asset} market`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="square" strokeMiterlimit={10} strokeWidth={2} aria-hidden>
                <polyline points="12 16 12 1.5 12 2.5" />
                <polyline points="8 5.5 12 1.5 16 5.5" />
                <path d="m16,10h2c1.1046,0,2,.8954,2,2v8c0,1.1046-.8954,2-2,2H6c-1.1046,0-2-.8954-2-2v-8c0-1.1046.8954-2,2-2h2" />
              </svg>
            </span>
          )}
          <span className="canary-mm-iconbtn canary-promo" tabIndex={0} role="button" aria-label="Rewards">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M3,9.5v4.75c0,1.517,1.233,2.75,2.75,2.75h2.5v-7.5H3Z" fill="currentColor" />
              <path d="M9.75,9.5v7.5h2.5c1.517,0,2.75-1.233,2.75-2.75v-4.75h-5.25Z" fill="currentColor" />
              <path d="M15.25,4.5h-.462c.135-.307,.212-.644,.212-1,0-1.378-1.121-2.5-2.5-2.5-1.761,0-2.864,1.231-3.5,2.339-.636-1.107-1.739-2.339-3.5-2.339-1.379,0-2.5,1.122-2.5,2.5,0,.356,.077,.693,.212,1h-.462c-.965,0-1.75,.776-1.75,1.75s.785,1.75,1.75,1.75H15.25c.965,0,1.75-.782,1.75-1.75s-.785-1.75-1.75-1.75Zm-2.75-2c.552,0,1,.449,1,1s-.448,1-1,1h-2.419c.405-.86,1.176-2,2.419-2ZM4.5,3.5c0-.551,.448-1,1-1,1.234,0,2.007,1.14,2.415,2h-2.415c-.552,0-1-.449-1-1Z" fill="currentColor" />
            </svg>
            <div className="canary-promo-tip" role="tooltip">
              <p className="canary-promo-tip-lead">
                Earn rewards by placing limit orders near the mid.
              </p>
              <div className="canary-promo-rows">
                <div>
                  <span>Rewards</span>
                  <span className="canary-promo-val">
                    <i className="canary-coin">$</i> {rewards}
                  </span>
                </div>
                <div>
                  <span>Max spread</span>
                  <span className="canary-promo-fig">±4¢</span>
                </div>
                <div>
                  <span>Min shares</span>
                  <span className="canary-promo-fig">50</span>
                </div>
              </div>
              <div className="canary-promo-div" />
              <p className="canary-promo-tip-lead">
                Attract more liquidity by sponsoring rewards for this market.
              </p>
              <div className="canary-promo-add">Add rewards</div>
            </div>
          </span>
        </div>
      </div>
    </div>
  );
}

// Same crisp header coin as Simple's StableCard (circular logo + initial fallback).
function TokenLogo({ s, symbol }: { s: Stable | undefined; symbol: string }) {
  const [err, setErr] = useState(false);
  if (s?.logo && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={s.logo}
        alt={symbol}
        className="canary-stable-logo"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <span className="canary-stable-fallback" style={{ background: s?.color ?? "#e0b15a" }}>
      {symbol.slice(0, 1)}
    </span>
  );
}
