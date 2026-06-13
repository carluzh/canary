"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Stable } from "@/lib/stables";
import { usd } from "@/lib/format";

export function StableCard({ s, held }: { s: Stable; held?: number }) {
  const pctUsed =
    s.capacityTotal > 0 ? Math.min(1, s.capacityUsed / s.capacityTotal) : 0;

  return (
    <Link
      href={`/market/${s.symbol.toLowerCase()}`}
      className="canary-stable-card"
      style={{ ["--brand"]: s.color } as CSSProperties}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <TokenLogo s={s} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-radley)",
              fontSize: 17,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {s.name}
          </div>
          <div className="canary-mono" style={{ fontSize: 12, color: "rgba(30,30,30,0.5)" }}>
            {s.symbol}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(30,30,30,0.62)", marginBottom: 16 }}>
        {held != null ? (
          <>
            You hold{" "}
            <strong style={{ color: s.color }}>
              {held.toLocaleString(undefined, { maximumFractionDigits: 2 })} {s.symbol}
            </strong>
          </>
        ) : (
          "Onchain cover available"
        )}
      </div>

      <div style={{ marginTop: "auto" }}>
        <div className="canary-cap-bar">
          <div
            className="canary-cap-fill"
            style={{ width: `${Math.round(pctUsed * 100)}%` }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 7,
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(30,30,30,0.5)" }}>Capacity</span>
          <span className="canary-mono" style={{ fontSize: 13, fontWeight: 600 }}>
            {usd(s.capacityTotal)}
          </span>
        </div>
      </div>
    </Link>
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
