"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import PoissonDiskSampling from "poisson-disk-sampling";
import { STABLES, type Stable } from "@/lib/stables";
import { usd } from "@/lib/format";

// Positioning logic ported verbatim from Uniswap's IconCloud
// (packages/uniswap/src/components/IconCloud). Tokens are scattered with
// Poisson-disk sampling, never overlapping yet reading as an organic cloud.
// Tokens that land in the central band behind the headline (or near the top)
// are pushed back with extra blur and lower opacity; per-token size, blur,
// opacity, rotation, float duration, and mount delay are all randomised.

// Deterministic placement: a fixed-seed PRNG drives both the Poisson sampler
// and the per-token size/opacity/tilt, so the cloud is identical on every load
// (for a given viewport) rather than re-randomised each render. Bump SEED to
// reshuffle the arrangement.
const SEED = 0x9e3879b9;
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const intFrom = (rng: () => number, min: number, max: number) =>
  Math.floor(rng() * (max - min + 1) + min);
const floatFrom = (rng: () => number, min: number, max: number) =>
  rng() * (max - min) + min;

// Small, airy icons (Uniswap ships 50–96; these are deliberately smaller).
const MIN_ITEM_SIZE = 40;
const MAX_ITEM_SIZE = 52;
// Lower than Uniswap's 500 for a lighter blur.
const BLUR_STRENGTH = 150;
// No icon's centre may fall within this many px of the horizontal midline, so
// the headline / subtext / button column stays clear of tokens.
const CENTER_CLEAR_RADIUS = 260;
// Use most of the width (small edge inset) so tokens scatter across each side
// rather than stacking in a narrow column.
const CANVAS_SCALE_X = 0.92;
// Candidate spacing — loose enough to read as an organic Poisson scatter, dense
// enough that each side yields more candidates than we need.
const MIN_DISTANCE = 120;
const MAX_DISTANCE = 180;
const TOKENS_PER_SIDE = 5;
// If the hover card (opening rightward) would need more than this much room to
// the right of the icon than the viewport allows, open it leftward instead.
const CARD_FLIP_BUDGET = 200;

// Center-out token priority: the biggest stablecoins are assigned to the
// positions nearest the headline, the rest fan outward. This only changes which
// token lands on which (seed-fixed) position, never the positions themselves.
const CLOUD_ORDER = [
  "USDT",
  "USDe",
  "DAI",
  "USDS",
  "USD1",
  "USDG",
  "GHO",
  "USD0",
  "crvUSD",
  "BOLD",
];
const ORDERED_STABLES: Stable[] = [
  ...CLOUD_ORDER.map((sym) => STABLES.find((s) => s.symbol === sym)).filter(
    (s): s is Stable => Boolean(s)
  ),
  // Any stables not listed above still appear, after the prioritised ones.
  ...STABLES.filter((s) => !CLOUD_ORDER.includes(s.symbol)),
];

type CloudPoint = {
  x: number;
  y: number;
  blur: number;
  size: number;
  opacity: number;
  rotation: number;
  delay: number;
  // When true the icon is anchored by its right edge (rightX) and the hover
  // card opens leftward, so a right-edge token's card stays in the viewport.
  flip: boolean;
  rightX: number;
  stable: Stable;
};

// A sampled position before a token is assigned to it. `cx`/`cy` are the icon's
// centre (used for left/right split, spread selection, and mount-in delay).
type Candidate = {
  cx: number;
  cy: number;
  x: number;
  y: number;
  blur: number;
  size: number;
  opacity: number;
  rotation: number;
};

// Farthest-point sampling: pick `count` candidates that are maximally far apart
// in 2D, which approximates blue-noise/Poisson spacing — an even, organic
// scatter rather than a column. Seeds from the candidate nearest the side's
// centroid so the result is stable.
function pickSpread(arr: Candidate[], count: number): Candidate[] {
  if (arr.length <= count) return arr;
  const cxAvg = arr.reduce((s, c) => s + c.cx, 0) / arr.length;
  const cyAvg = arr.reduce((s, c) => s + c.cy, 0) / arr.length;
  const remaining = [...arr];
  let seed = 0;
  let seedDist = Infinity;
  remaining.forEach((c, i) => {
    const d = (c.cx - cxAvg) ** 2 + (c.cy - cyAvg) ** 2;
    if (d < seedDist) {
      seedDist = d;
      seed = i;
    }
  });
  const chosen: Candidate[] = [remaining.splice(seed, 1)[0]!];
  while (chosen.length < count && remaining.length) {
    let bestIdx = 0;
    let bestDist = -1;
    remaining.forEach((c, i) => {
      let minD = Infinity;
      for (const ch of chosen) {
        const d = (c.cx - ch.cx) ** 2 + (c.cy - ch.cy) ** 2;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        bestIdx = i;
      }
    });
    chosen.push(remaining.splice(bestIdx, 1)[0]!);
  }
  return chosen;
}

// The point-generation routine, adapted from IconCloud's useMemo body.
// `topBound`/`bottomBound` are container-relative y limits (the bottom of the
// 3-stars image and the bottom of the Launch app button); icons stay strictly
// between them so none sits above the stars or below the button. Poisson
// sampling gives organic, non-overlapping candidates; we then take exactly
// TOKENS_PER_SIDE on the left and right.
function buildPoints(
  w: number,
  topBound: number,
  bottomBound: number
): CloudPoint[] {
  // Inset the vertical band by half the largest icon so a centred icon never
  // pokes past either bound.
  const halfMax = MAX_ITEM_SIZE / 2;
  const bandTop = topBound + halfMax;
  const ch = bottomBound - halfMax - bandTop;
  if (ch <= 0) return [];

  // Centred horizontal sub-box; vertical extent is the bounded band.
  const cw = w * CANVAS_SCALE_X;
  const offsetX = (w - cw) / 2;

  const rng = mulberry32(SEED);
  const sampler = new PoissonDiskSampling(
    {
      shape: [cw, ch],
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      tries: 10,
    },
    rng
  );

  const candidates: Candidate[] = sampler
    .fill()
    // Shift sampled points into container space (centred box, bounded band).
    .map(([sx = 0, sy = 0]) => [sx + offsetX, sy + bandTop] as [number, number])
    // Drop everything in the central column so no token sits under or beside
    // the headline text.
    .filter(([x = 0]) => Math.abs(x - w / 2) > CENTER_CLEAR_RADIUS)
    .map(([cx = 0, cy = 0]) => {
      const size = intFrom(rng, MIN_ITEM_SIZE, MAX_ITEM_SIZE);
      return {
        cx,
        cy,
        // Centre each icon on its sampled point.
        x: cx - 0.5 * size,
        y: cy - 0.5 * size,
        blur: (1 / size) * BLUR_STRENGTH,
        size,
        opacity: floatFrom(rng, 0.5, 1.0),
        // Static per-token tilt for organic variety (no idle motion).
        rotation: intFrom(rng, -16, 16),
      };
    });

  const left = candidates.filter((c) => c.cx < w / 2);
  const right = candidates.filter((c) => c.cx >= w / 2);
  const chosen = [
    ...pickSpread(left, TOKENS_PER_SIDE),
    ...pickSpread(right, TOKENS_PER_SIDE),
  ];

  // Assign tokens center-out: positions closest to the headline get the
  // highest-priority stablecoins (ORDERED_STABLES). Positions are untouched.
  const byCenter = [...chosen].sort(
    (a, b) => Math.abs(a.cx - w / 2) - Math.abs(b.cx - w / 2)
  );
  return byCenter.map((c, i) => {
    const { cx, cy, ...rest } = c;
    void cy;
    // Flip the card to open leftward if opening rightward would run it past the
    // viewport's right edge.
    const flip = rest.x + rest.size + CARD_FLIP_BUDGET > w;
    return {
      ...rest,
      delay: Math.abs(cx - w / 2) / 800,
      flip,
      rightX: w - (rest.x + rest.size),
      stable: ORDERED_STABLES[i % ORDERED_STABLES.length]!,
    } satisfies CloudPoint;
  });
}

export function TokenCloud() {
  const ref = useRef<HTMLDivElement>(null);
  // Sampling needs the rendered box size and Math.random, so it only runs on
  // the client after mount. SSR renders an empty cloud (no hydration drift).
  const [points, setPoints] = useState<CloudPoint[]>([]);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;
      // Container-relative y of the 3-stars bottom and the Launch button bottom;
      // fall back to a sensible band if the elements aren't found.
      const topEl = document.querySelector('[data-cloud-bound="top"]');
      const botEl = document.querySelector('[data-cloud-bound="bottom"]');
      const topBound = topEl
        ? topEl.getBoundingClientRect().bottom - rect.top
        : h * 0.1;
      const bottomBound = botEl
        ? botEl.getBoundingClientRect().bottom - rect.top
        : h * 0.9;
      setPoints(buildPoints(w, topBound, bottomBound));
    };
    measure();
    // Fonts can reflow the headline/button after first paint, shifting the
    // bottom bound; re-measure once they're ready.
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Staggered mount-in: each icon reveals after `delay` seconds, mirroring
  // Uniswap's TokenIconPositioner (setTimeout + startTransition), so the cloud
  // ripples outward from the centre.
  useEffect(() => {
    setVisible(new Set());
    const timers = points.map((p, i) =>
      setTimeout(() => {
        setVisible((prev) => new Set(prev).add(i));
      }, p.delay * 1000)
    );
    return () => timers.forEach(clearTimeout);
  }, [points]);

  return (
    <div className="canary-cloud" aria-hidden ref={ref}>
      {points.map((p, i) => {
        const s = p.stable;
        const available = s.capacityTotal - s.capacityUsed;
        return (
          <figure
            key={`${s.symbol}-${i}`}
            className={`canary-cloud-item${p.flip ? " canary-cloud-item--r" : ""}`}
            data-visible={visible.has(i)}
            style={
              {
                top: `${p.y}px`,
                left: p.flip ? undefined : `${p.x}px`,
                right: p.flip ? `${p.rightX}px` : undefined,
                ["--size"]: `${p.size}px`,
                ["--blur"]: `${p.blur}px`,
                ["--op"]: p.opacity,
                ["--rot"]: `${p.rotation}deg`,
                ["--brand"]: s.color,
              } as CSSProperties
            }
          >
            {s.logo ? (
              <img src={s.logo} alt="" className="canary-cloud-logo" />
            ) : null}
            <figcaption className="canary-cloud-card">
              <span className="canary-cloud-amt">{s.symbol}</span>
              <span className="canary-cloud-sub">
                <span className="canary-cloud-val">{usd(available)}</span>{" "}
                available
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
