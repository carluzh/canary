"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
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
function sparkPoints(symbol: string): string {
  let a = hashSeed(symbol) >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = 28;
  const vals: number[] = [];
  let v = 0.5;
  for (let i = 0; i < N; i++) {
    v += (rng() - 0.5) * 0.34;
    v = Math.max(0.06, Math.min(0.94, v));
    vals.push(v);
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return vals
    .map((val, i) => {
      const x = (i / (N - 1)) * 100;
      const y = 26 - ((val - min) / range) * 24 - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function StableCard({ s }: { s: Stable }) {
  const sym = s.symbol.toLowerCase();
  const yesPrice = s.coverCost; // YES share price == market-implied depeg odds
  const yesCents = `${(yesPrice * 100).toFixed(1)}¢`;
  const volume = Math.round(s.capacityUsed * 0.42);

  const band =
    s.coverCost <= 0.02 ? "cheap" : s.coverCost <= 0.035 ? "fair" : "pricey";
  const verdict = band === "cheap" ? "Cheap" : band === "fair" ? "Fair" : "Pricey";

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
        <span className="canary-verdict" tabIndex={0}>
          <span className="canary-verdict-dot" data-band={band} aria-hidden />
          <span className="canary-verdict-word">{verdict}</span>
          <span className="canary-verdict-tip" role="tooltip">
            How cheap the cover is, priced from the market&apos;s implied
            premium. Cheap is under 2%, Fair 2 to 3.5%, Pricey over 3.5%.
          </span>
        </span>
      </Link>

      <div className="canary-card-body">
        {/* clean market: YES share price as a line graph */}
        <div className="canary-yes">
          <div className="canary-yes-top">
            <span className="canary-yes-label">YES shares</span>
            <span className="canary-yes-price">{yesCents}</span>
          </div>
          <svg
            className="canary-yes-spark"
            viewBox="0 0 100 26"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={sparkPoints(s.symbol)}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
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
