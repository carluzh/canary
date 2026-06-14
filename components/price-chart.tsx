"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

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

function buildSeries(symbol: string, tfKey: string): CandlestickData[] {
  const tf = TIMEFRAMES.find((t) => t.key === tfKey) ?? TIMEFRAMES[1];
  const rng = mulberry32(hashSeed(`${symbol}-${tfKey}`));
  const out: CandlestickData[] = [];
  let price = 0.35 + rng() * 0.3;
  let t = ANCHOR - tf.bars * tf.step;
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

    const data = buildSeries(symbol, tf);
    series.setData(data);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [symbol, tf]);

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
