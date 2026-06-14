"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Stable } from "@/lib/stables";
import { usd } from "@/lib/format";

const COVER = 1000;
// Placeholder share target — real URL wired in later.
const SHARE_URL = "https://canary.example";

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

  // YES-share price line. Hovering it surfaces the point under the cursor in the
  // price field; with no hover we show the current (last) value == cover cost.
  const series = useMemo(
    () => sparkSeries(s.symbol, s.coverCost),
    [s.symbol, s.coverCost]
  );
  const [hoverVal, setHoverVal] = useState<number | null>(null);
  const shown = hoverVal ?? series[series.length - 1];
  const yesCents = `${(shown * 100).toFixed(1)}¢`;

  const band =
    s.coverCost <= 0.02 ? "cheap" : s.coverCost <= 0.035 ? "fair" : "pricey";
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

  return (
    <div
      className="canary-stable-card"
      style={{ ["--brand"]: s.color } as CSSProperties}
    >
      <Link href={`/market/${sym}`} className="canary-stable-head">
        <span className="canary-stable-id">
          <TokenLogo s={s} />
          <span style={{ minWidth: 0 }}>
            <span className="canary-stable-name">{s.name}</span>
            <span className="canary-stable-ticker">{s.symbol}</span>
          </span>
        </span>
        <span
          className="canary-verdict"
          tabIndex={0}
          onClick={(e) => e.preventDefault()}
        >
          <span className="canary-verdict-dot" data-band={band} aria-hidden />
          <span className="canary-verdict-word">{verdict}</span>
          <span className="canary-verdict-tip" role="tooltip">
            {verdictTip}
          </span>
        </span>
      </Link>

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

        {/* single cover quote -> deep-links with the amount prefilled */}
        <Link href={`/market/${sym}?cover=${COVER}`} className="canary-cover-row">
          <span className="canary-cover-label">Cover ${grp(COVER)}</span>
          <span className="canary-cover-box">{premiumStr(COVER * s.coverCost)}</span>
        </Link>

        {/* muted footer: volume (left) + share (right) */}
        <div className="canary-card-foot">
          <span className="canary-card-vol">{usd(volume)} Volume</span>
          <a
            className="canary-share"
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share ${s.symbol} cover`}
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
