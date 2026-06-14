"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useDemoMarket, useCoverMarket } from "@/lib/web3/demo-market";
import { useFeedPrice } from "@/lib/contracts/markets-onchain";

// Interactive price chart (TradingView lightweight-charts): wheel-zoom, drag-pan
// and crosshair hover come for free; we add timeframe switching and a live OHLC
// legend. Sample data is deterministic per symbol+timeframe — swap setData() for
// real candles later without touching the rest.

const UP = "#26d07c";
const DOWN = "#fb5a6a";

const TIMEFRAMES = [
  { key: "1H", bars: 60, step: 60 },
  { key: "1D", bars: 96, step: 900 },
  { key: "1W", bars: 84, step: 7200 },
  { key: "1M", bars: 60, step: 43200 },
] as const;

// Fixed anchor so the sample series is stable across reloads (no Date.now()).
const ANCHOR = 1_751_328_000; // 2025-07-01T00:00:00Z, epoch seconds

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeries(symbol: string, tfKey: string, flat: boolean): CandlestickData[] {
  const tf = TIMEFRAMES.find((t) => t.key === tfKey) ?? TIMEFRAMES[1];
  const out: CandlestickData[] = [];
  let t = ANCHOR - tf.bars * tf.step;

  // Active market (USDe): the peg held at $1.00 historically, so every past
  // candle is flat $1.00. The current candle is overwritten with the live
  // on-chain feed price by the snap effect below (true data, not synthetic).
  if (flat) {
    for (let i = 0; i < tf.bars; i++) {
      out.push({ time: t as UTCTimestamp, open: 1, high: 1, low: 1, close: 1 });
      t += tf.step;
    }
    return out;
  }

  // View-only markets keep deterministic synthetic candles (cosmetic).
  const rng = mulberry32(hashSeed(`${symbol}-${tfKey}`));
  let price = 0.35 + rng() * 0.3;
  for (let i = 0; i < tf.bars; i++) {
    const o = price;
    const c = Math.max(0.02, Math.min(0.98, o + (rng() - 0.5) * 0.06));
    const h = Math.min(0.99, Math.max(o, c) + rng() * 0.02);
    const l = Math.max(0.01, Math.min(o, c) - rng() * 0.02);
    out.push({ time: t as UTCTimestamp, open: o, high: h, low: l, close: c });
    price = c;
    t += tf.step;
  }
  return out;
}

export function PriceChart({ symbol }: { symbol: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<string>("1D");

  // For the ACTIVE USDe market we anchor the latest candle to the live feed so a
  // crash shows up as a falling line. View-only symbols stay fully synthetic:
  // useCoverMarket() returns null for them, so the feed read is disabled and the
  // chart renders deterministic sample data unchanged.
  const coverMarket = useCoverMarket(symbol);
  const { feed } = useDemoMarket();
  const liveFeed = coverMarket ? feed : null;
  const { price: livePrice } = useFeedPrice(liveFeed);
  // Active market => flat $1.00 history + a live current candle from the feed.
  const isActive = !!coverMarket;

  // Series handle + the last synthetic bar, shared between the build effect and
  // the live-snap effect so we can update the final candle in place.
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(230,232,234,0.55)",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
    });

    const data = buildSeries(symbol, tf, isActive);
    series.setData(data);
    chart.timeScale().fitContent();

    seriesRef.current = series;
    lastBarRef.current = data.length ? { ...data[data.length - 1] } : null;

    return () => {
      seriesRef.current = null;
      lastBarRef.current = null;
      chart.remove();
    };
  }, [symbol, tf, isActive]);

  // On each 1s poll, snap the latest candle's close to the live feed price for
  // the active market (high/low widen to contain it). This is purely additive:
  // when livePrice is null (view-only or pre-resolve) we leave the bar alone.
  useEffect(() => {
    const series = seriesRef.current;
    const base = lastBarRef.current;
    if (!series || !base || livePrice == null) return;

    // livePrice is the USDe/USD feed value (~$1.00, dropping to ~$0.94 on a
    // crash). No 0..1 clamp: the current candle reflects the true on-chain price,
    // opening at the $1 peg (base) and closing at the live feed.
    const close = Math.max(0, Math.min(2, livePrice));
    const next: CandlestickData = {
      ...base,
      close,
      high: Math.max(base.high, close),
      low: Math.min(base.low, close),
    };
    series.update(next);
  }, [livePrice]);

  return (
    <div className="canary-chart">
      <div className="canary-chart-bar">
        <div className="canary-chart-tfs">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              type="button"
              data-active={tf === t.key}
              className="canary-chart-tf"
              onClick={() => setTf(t.key)}
            >
              {t.key}
            </button>
          ))}
        </div>
      </div>
      <div ref={wrap} className="canary-chart-canvas" />
    </div>
  );
}
