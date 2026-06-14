"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { Stable } from "@/lib/stables";
import { getMarket } from "@/lib/markets";
import { usd, formatDate, timeLeft, sharesToUsd } from "@/lib/format";
import { useCoverMarket } from "@/lib/web3/demo-market";
import { useUserPosition } from "@/lib/contracts/markets-onchain";

// A single open-cover position (YES balance > 0). Self-hides when there is no
// position and reports presence up so the section can show a count / empty
// state. Display-only, and reuses the stable-card visual language.
export function PositionCard({
  stable,
  address,
  onReport,
}: {
  stable: Stable;
  address?: `0x${string}`;
  onReport: (symbol: string, has: boolean) => void;
}) {
  const market = useCoverMarket(stable.symbol);
  const { yes } = useUserPosition(market, address);
  const has = yes > 0n;

  useEffect(() => {
    onReport(stable.symbol, has);
    return () => onReport(stable.symbol, false);
  }, [has, stable.symbol, onReport]);

  if (!has) return null;

  const m = getMarket(stable.symbol.toLowerCase());
  const cover = sharesToUsd(yes); // YES shares each redeem for $1 → cover == payout

  return (
    <Link
      href={`/market/${stable.symbol.toLowerCase()}`}
      className="canary-position-card"
      style={{ ["--brand"]: stable.color } as CSSProperties}
    >
      <div className="canary-stable-head" style={{ marginBottom: 14 }}>
        <span className="canary-stable-id">
          <TokenLogo stable={stable} />
          <span style={{ minWidth: 0 }}>
            <span className="canary-stable-name">{stable.name}</span>
            <span className="canary-stable-ticker">{stable.symbol} cover</span>
          </span>
        </span>
        <span className="canary-position-pill">Active</span>
      </div>

      <dl className="canary-res" style={{ marginTop: "auto" }}>
        <div>
          <dt>Cover</dt>
          <dd>
            <strong>{usd(cover)}</strong>
          </dd>
        </div>
        <div>
          <dt>Pays out if</dt>
          <dd>{stable.symbol} loses its $1 peg</dd>
        </div>
        <div>
          <dt>Covered until</dt>
          <dd>{m ? `${formatDate(m.expiry)} · ${timeLeft(m.expiry)}` : "—"}</dd>
        </div>
      </dl>
    </Link>
  );
}

function TokenLogo({ stable }: { stable: Stable }) {
  const [err, setErr] = useState(false);
  if (stable.logo && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={stable.logo}
        alt={stable.symbol}
        className="canary-stable-logo"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <span className="canary-stable-fallback" style={{ background: stable.color }}>
      {stable.symbol.slice(0, 1)}
    </span>
  );
}
