"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Stable } from "@/lib/stables";
import { getMarket, isMarketActive, type Market } from "@/lib/markets";
import { usd } from "@/lib/format";
import { useLiveMarket } from "@/lib/contracts/markets-onchain";
import { BuyInsuranceModal } from "@/components/buy-insurance-modal";

const COVER = 1000;
// Placeholder share target — real URL wired in later.
const SHARE_URL = "https://canary.example";

// Type-guard only: getMarket() always resolves for a stable (markets are derived
// from STABLES), so this is never returned at runtime. Shaped as a view-only
// market so useLiveMarket would treat it as a pure mock passthrough (no reads).
function stableToFallbackMarket(s: Stable): Market {
  return {
    id: s.symbol.toLowerCase(),
    kind: "depeg",
    asset: s.symbol,
    category: "Stablecoin",
    question: `Will ${s.symbol} lose its $1 peg before expiry?`,
    insureLabel: `${s.symbol} loses its $1 peg`,
    priceYes: s.coverCost,
    liquidity: s.capacityUsed,
    volume: Math.round(s.capacityUsed * 0.42),
    resolution: "open",
    expiry: 0,
    onchainMarket: null,
    underwriteMarket: null,
    status: "view-only",
  };
}

// Apostrophe-grouped whole dollars (e.g. 1000 -> "1'000").
const grp = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");

function premiumStr(n: number): string {
  if (n >= 100) return `$${grp(Math.round(n / 5) * 5)}`;
  if (n >= 10) return `$${Math.round(n)}`;
  return `$${n.toFixed(1)}`;
}

// Deterministic sparkline for a token's YES-share price (stable per symbol).
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// YES-share price history (0..1 premium), a deterministic random walk that ends
// exactly at the current premium so the last point matches the displayed cents
// and every hovered point reads as a plausible past quote.
const SPARK_N = 28;
function sparkSeries(symbol: string, current: number): number[] {
  let a = hashSeed(symbol) >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Walk backwards from the current premium, then reverse so it lands on it.
  const back: number[] = [];
  let v = current;
  for (let i = 0; i < SPARK_N; i++) {
    back.push(v);
    v *= 1 + (rng() - 0.5) * 0.28;
    v = Math.max(current * 0.4, Math.min(current * 2.2, v));
  }
  return back.reverse();
}

export function StableCard({ s }: { s: Stable }) {
  const sym = s.symbol.toLowerCase();
  const volume = Math.round(s.capacityUsed * 0.42);
  const [open, setOpen] = useState(false);
  const market = getMarket(sym);
  // Every stable maps 1:1 to a Market (markets are derived from STABLES), so this
  // synthetic view-only stand-in is only a type guard for the hook and is never
  // used at runtime. A view-only market makes useLiveMarket a pure mock
  // passthrough (no reads issued), so it stays safe regardless.
  const liveMarket = useMemo<Market>(
    () => market ?? stableToFallbackMarket(s),
    [market, s]
  );
  const active = isMarketActive(liveMarket);

  // Live cover price (YES price == cost of cover, 0..1). Safe for every market:
  // view-only markets get a pure mock passthrough (price == priceYes) and issue
  // no reads. We only swap in the live read once it has resolved (!isLoading) so
  // the first paint stays the deterministic mock value (no hydration mismatch /
  // no flash through the empty-book 0.5 default).
  const live = useLiveMarket(liveMarket);
  const coverCost =
    active && live.live && !live.isLoading ? live.price : s.coverCost;

  // YES-share price line. Hovering it surfaces the point under the cursor in the
  // price field; with no hover we show the current (last) value == cover cost.
  // The series ends exactly on the (live or mock) cover cost, so its last point
  // is anchored to the displayed cents.
  const series = useMemo(
    () => sparkSeries(s.symbol, coverCost),
    [s.symbol, coverCost]
  );
  const [hoverVal, setHoverVal] = useState<number | null>(null);
  const shown = hoverVal ?? series[series.length - 1];
  const yesCents = `${(shown * 100).toFixed(1)}¢`;

  const band =
    coverCost <= 0.02 ? "cheap" : coverCost <= 0.035 ? "fair" : "pricey";
  const verdict =
    band === "cheap" ? "Cheap" : band === "fair" ? "Fair" : "Expensive";
  // Tooltip copy speaks to what the price means for the buyer, per band.
  const verdictTip =
    band === "cheap"
      ? `The market sees a low chance of ${s.symbol} depegging, so cover is inexpensive.`
      : band === "fair"
      ? `Premium is in line with the market's implied depeg risk for ${s.symbol}.`
      : `The market is pricing in elevated depeg risk for ${s.symbol}, so cover costs more.`;

  const shareHref = `https://x.com/intent/tweet?text=${encodeURIComponent(
    `Insure your ${s.symbol} against a depeg on canary.`
  )}&url=${encodeURIComponent(SHARE_URL)}`;

  // View-only cards expose no buy path: opening the cover modal is suppressed and
  // the card root reads as inert (CSS dims it + makes the cover-row non-clickable).
  const openCover = () => {
    if (active) setOpen(true);
  };

  return (
    <div
      className="canary-stable-card"
      style={{ ["--brand"]: s.color } as CSSProperties}
      data-inactive={active ? undefined : "true"}
      role="button"
      tabIndex={0}
      aria-disabled={active ? undefined : true}
      onClick={openCover}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openCover();
        }
      }}
    >
      <div className="canary-stable-head">
        <span className="canary-stable-id">
          <TokenLogo s={s} />
          <span style={{ minWidth: 0 }}>
            <span className="canary-stable-name">{s.name}</span>
            <span className="canary-stable-ticker">{s.symbol}</span>
          </span>
        </span>
        {active ? (
          <span
            className="canary-verdict"
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="canary-verdict-dot" data-band={band} aria-hidden />
            <span className="canary-verdict-word">{verdict}</span>
            <span className="canary-verdict-tip" role="tooltip">
              {verdictTip}
            </span>
          </span>
        ) : (
          <span className="canary-soon">View Only</span>
        )}
      </div>

      <div className="canary-card-body">
        {/* clean market: YES share price as a line graph, hover to inspect */}
        <div className="canary-yes">
          <div className="canary-yes-top">
            <span className="canary-yes-price" data-hover={hoverVal != null}>
              {yesCents}
            </span>
          </div>
          <Sparkline series={series} onHover={setHoverVal} />
        </div>

        {/* single cover quote -> opens the simple buy modal */}
        <div className="canary-cover-row">
          <span className="canary-cover-label">Cover ${grp(COVER)}</span>
          <span className="canary-cover-box">{premiumStr(COVER * coverCost)}</span>
        </div>

        {/* muted footer: volume (left) + share (right) */}
        <div className="canary-card-foot">
          <span className="canary-card-vol">{usd(volume)} Volume</span>
          <a
            className="canary-share"
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share ${s.symbol} cover`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="square"
              strokeMiterlimit={10}
              strokeWidth={2}
              aria-hidden
            >
              <polyline points="12 16 12 1.5 12 2.5" />
              <polyline points="8 5.5 12 1.5 16 5.5" />
              <path d="m16,10h2c1.1046,0,2,.8954,2,2v8c0,1.1046-.8954,2-2,2H6c-1.1046,0-2-.8954-2-2v-8c0-1.1046.8954-2,2-2h2" />
            </svg>
          </a>
        </div>
      </div>

      {market && (
        <BuyInsuranceModal
          market={market}
          stable={s}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Interactive price line: a vertical guide + dot follow the cursor, and the
// hovered value is lifted to the parent so the price field reflects it.
function Sparkline({
  series,
  onHover,
}: {
  series: number[];
  onHover: (v: number | null) => void;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const N = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const px = (i: number) => (i / (N - 1)) * 100; // 0..100, also % of width
  const py = (v: number) => 26 - ((v - min) / range) * 24 - 1; // viewBox units

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(N - 1, Math.round(frac * (N - 1))));
    setIdx(i);
    onHover(series[i]!);
  };
  const leave = () => {
    setIdx(null);
    onHover(null);
  };

  const points = series
    .map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`)
    .join(" ");

  return (
    <div
      className="canary-spark-wrap"
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <svg
        className="canary-yes-spark"
        viewBox="0 0 100 26"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {idx != null && (
          <line
            x1={px(idx)}
            y1={0}
            x2={px(idx)}
            y2={26}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.45}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {idx != null && (
        <span
          className="canary-spark-dot"
          style={{
            left: `${px(idx)}%`,
            top: `${(py(series[idx]!) / 26) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

function TokenLogo({ s }: { s: Stable }) {
  const [err, setErr] = useState(false);
  if (s.logo && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={s.logo}
        alt={s.symbol}
        className="canary-stable-logo"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <span className="canary-stable-fallback" style={{ background: s.color }}>
      {s.symbol.slice(0, 1)}
    </span>
  );
}
