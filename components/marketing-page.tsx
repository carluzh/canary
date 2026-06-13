"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { Wordmark } from "@/components/top-bar";
import { Draggable } from "@/components/draggable";
import { SiteFooter } from "@/components/site-footer";
import { STABLES } from "@/lib/stables";
import { usd } from "@/lib/format";
import { useMode } from "@/lib/web3/mode";

// One uniform floating sticker. Every sticker shares the exact same shell
// (.canary-sticker-card / row / bar / fill); only color, logo, label, optional
// right-aligned meta, and the bar fill width differ. Tinted via --brand.
// Stickers share one shell but render in three shapes:
//  available -> "$X available" + bottom bar (only these get a bar)
//  apy       -> logo + symbol + a prominent APY, no bar
//  plain     -> logo + label (Arc / Chainlink), no bar
function Sticker({
  logo,
  color,
  label,
  availableUsd,
  fill,
  apy,
}: {
  logo: string;
  color: string;
  label?: string;
  availableUsd?: number;
  fill?: number; // 0..100
  apy?: string;
}) {
  return (
    <div
      className="canary-sticker-card"
      style={{ ["--brand"]: color } as CSSProperties}
    >
      <div className="canary-sticker-row">
        <img src={logo} alt="" />
        {availableUsd != null ? (
          <span className="canary-sticker-label">
            {usd(availableUsd)}{" "}
            <span className="canary-sticker-sub">available</span>
          </span>
        ) : apy != null ? (
          <>
            <span className="canary-sticker-label">{label}</span>
            <span className="canary-sticker-apy">{apy}</span>
          </>
        ) : (
          <span className="canary-sticker-label">{label}</span>
        )}
      </div>
      {availableUsd != null ? (
        <div className="canary-sticker-bar">
          <div className="canary-sticker-fill" style={{ width: `${fill}%` }} />
        </div>
      ) : null}
    </div>
  );
}

// Bottom-right summary sticker: total available insurance + a logo line that
// loops infinitely through all available token logos.
function AvailableInsuranceSticker() {
  const totalAvailable = STABLES.reduce(
    (sum, s) => sum + (s.capacityTotal - s.capacityUsed),
    0
  );
  const logos = STABLES.map((s) => s.logo).filter(
    (l): l is string => Boolean(l)
  );
  const loop = [...logos, ...logos];
  return (
    <div
      className="canary-sticker-card"
      style={{ ["--brand"]: "#ee9259", width: 222 } as CSSProperties}
    >
      <div className="canary-sticker-row">
        <span className="canary-sticker-label">Available Insurance</span>
        <span className="canary-sticker-label" style={{ marginLeft: "auto" }}>
          {usd(totalAvailable)}
        </span>
      </div>
      <div className="canary-logo-marquee">
        <div className="canary-logo-track">
          {loop.map((l, i) => (
            <img key={i} src={l} alt="" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketingPage() {
  const { setMode } = useMode();
  const router = useRouter();

  const enter = (mode: "simple" | "expert") => {
    setMode(mode);
    router.push("/markets");
  };

  const usdt = STABLES.find((s) => s.symbol === "USDT")!;
  const usde = STABLES.find((s) => s.symbol === "USDe")!;

  const availablePct = (capacityTotal: number, capacityUsed: number) =>
    Math.round(((capacityTotal - capacityUsed) / capacityTotal) * 100);

  return (
    <main className="canary-shell" style={{ paddingTop: 24 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Wordmark />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a
            href="#how"
            className="canary-nav"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            How it works
          </a>
          <Link href="/markets" className="canary-launch">
            Launch app
            <span className="canary-launch-arrow">→</span>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="canary-hero">
        <div className="canary-rings" aria-hidden>
          <div className="canary-ring" style={{ width: 380, height: 380 }} />
          <div className="canary-ring" style={{ width: 600, height: 600 }} />
        </div>

        <div className="canary-floats">
          {/* decorative 3-stars, draggable but static */}
          <Draggable className="canary-drag" style={{ top: "6%", left: "50%", marginLeft: -36 }}>
            <img src="/3-stars.png" alt="" width={72} style={{ opacity: 0.92, display: "block" }} />
          </Draggable>

          {/* top-left */}
          <Draggable className="canary-drag" style={{ top: "13%", left: "2%" }}>
            <Sticker
              logo="/tokens/usdt.png"
              color="#26A17B"
              availableUsd={usdt.capacityTotal - usdt.capacityUsed}
              fill={availablePct(usdt.capacityTotal, usdt.capacityUsed)}
            />
          </Draggable>

          {/* top-right */}
          <Draggable className="canary-drag" style={{ top: "11%", right: "3%" }}>
            <Sticker
              logo="/tokens/usde.png"
              color="#2D2D2D"
              availableUsd={usde.capacityTotal - usde.capacityUsed}
              fill={availablePct(usde.capacityTotal, usde.capacityUsed)}
            />
          </Draggable>

          {/* mid-left */}
          <Draggable className="canary-drag" style={{ top: "48%", left: "0%" }}>
            <Sticker logo="/tokens/arc.png" color="#1B3158" label="Settled on Arc" />
          </Draggable>

          {/* mid-right */}
          <Draggable className="canary-drag" style={{ top: "46%", right: "1%" }}>
            <Sticker logo="/tokens/dai.png" color="#F5AC37" label="DAI" apy="7.2% APY" />
          </Draggable>

          {/* bottom */}
          <Draggable className="canary-drag" style={{ bottom: "13%", left: "8%" }}>
            <Sticker logo="/tokens/chainlink.png" color="#375BD2" label="Chainlink resolved" />
          </Draggable>

          {/* bottom-right */}
          <Draggable className="canary-drag" style={{ bottom: "12%", right: "5%" }}>
            <AvailableInsuranceSticker />
          </Draggable>
        </div>

        <div className="canary-hero-content">
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-radley)",
              fontSize: "clamp(40px, 7vw, 82px)",
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
            }}
          >
            Your <span style={{ color: "#ee9259" }}>canary</span>
            <br />
            for onchain risk
          </h1>
          <p
            style={{
              margin: "24px auto 0",
              maxWidth: 540,
              fontFamily: "var(--font-radley)",
              fontSize: 18,
              lineHeight: 1.5,
              color: "rgba(30,30,30,0.62)",
            }}
          >
            Binary insurance markets on stablecoins, settled on Arc. Buy
            parametric cover in one click, or trade YES and NO to underwrite and
            earn. Resolved by Chainlink.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              marginTop: 30,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/markets"
              className="canary-btn canary-btn--accent"
              style={{ padding: "13px 22px", fontSize: 15 }}
            >
              Launch app
              <span className="canary-launch-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ marginTop: 48, scrollMarginTop: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-radley)",
            fontSize: "clamp(24px, 3vw, 34px)",
            letterSpacing: "-0.02em",
            margin: "0 0 22px",
          }}
        >
          How it works
        </h2>
        <div
          className="canary-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
        >
          <Step
            n="01"
            title="Pick a risk"
            body="Choose a market. A stablecoin depeg (USDe, USDC, DAI) or a protocol exploit (Aave, Morpho)."
          />
          <Step
            n="02"
            title="Cover or underwrite"
            body="Buy YES to hedge the event for a small premium, or sell NO to underwrite and earn premium plus idle-collateral yield."
          />
          <Step
            n="03"
            title="Auto-settles on Arc"
            body="A Chainlink price feed reads the asset. A CCIP message settles the market on Arc. Winning tokens redeem for $1 of USDC."
          />
        </div>
      </section>

      {/* Two modes */}
      <div className="canary-divider" />
      <section style={{ marginTop: 48 }}>
        <div
          className="canary-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          <div
            className="canary-card canary-mode-card canary-mode-card--simple"
            role="button"
            tabIndex={0}
            onClick={() => enter("simple")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                enter("simple");
              }
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h3 className="canary-mode-card-title">Simple</h3>
              <div className="canary-mode-card-desc">for protection</div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-radley)",
                fontSize: 20,
                marginBottom: 8,
              }}
            >
              Insure your stablecoins in one click
            </div>
            <p style={{ fontSize: 14, color: "rgba(30,30,30,0.6)", lineHeight: 1.55 }}>
              Pay a small premium, get a fixed payout if the depeg or exploit
              happens. No order books, no jargon.
            </p>
          </div>
          <div
            className="canary-card canary-mode-card canary-mode-card--expert"
            role="button"
            tabIndex={0}
            onClick={() => enter("expert")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                enter("expert");
              }
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h3 className="canary-mode-card-title">Expert</h3>
              <div className="canary-mode-card-desc">for traders and LPs</div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-radley)",
                fontSize: 20,
                marginBottom: 8,
                color: "#f4f4f4",
              }}
            >
              Trade YES/NO and provide liquidity
            </div>
            <p style={{ fontSize: 14, color: "rgba(234,234,234,0.62)", lineHeight: 1.55 }}>
              Live binary prices, probability bars, and an AMM. Underwrite risk,
              earn the spread plus yield on idle collateral.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="canary-step">
      <div className="canary-step-n">{n}</div>
      <div
        style={{
          fontFamily: "var(--font-radley)",
          fontSize: 19,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <p style={{ fontSize: 14, color: "rgba(30,30,30,0.6)", lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}
