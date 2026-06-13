import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Wordmark } from "@/components/top-bar";
import { ConnectWallet } from "@/components/connect-wallet";

// A floating, gently-bobbing element orbiting the hero value prop — echoes the
// onemore landing's hovering stickers. Positioned via `pos`, with per-element
// delay/rotation through CSS custom properties.
function Float({
  pos,
  delay = "0s",
  rot = "0deg",
  children,
}: {
  pos: CSSProperties;
  delay?: string;
  rot?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="canary-float"
      style={{ ...pos, "--d": delay, "--rot": rot } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function MarketingPage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="#how" className="canary-nav" style={{ fontSize: 14 }}>
            How it works
          </a>
          <ConnectWallet />
          <Link href="/markets" className="canary-btn canary-btn--ink">
            Launch app →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="canary-hero">
        <div className="canary-floats" aria-hidden>
          <Float pos={{ top: "15%", left: "3%" }} rot="-5deg" delay="0s">
            <div className="canary-chip">
              <div className="canary-kicker" style={{ marginBottom: 4 }}>
                USDe · depeg
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#5a7a3a" }}>YES 5¢</span>
                <span style={{ color: "#aa5f6e" }}>NO 95¢</span>
              </div>
            </div>
          </Float>

          <Float pos={{ top: "11%", right: "4%" }} rot="4deg" delay="1.1s">
            <div className="canary-chip">
              <div className="canary-kicker" style={{ marginBottom: 4 }}>
                Aave · exploit
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#5a7a3a" }}>YES 4¢</span>
                <span style={{ color: "#aa5f6e" }}>NO 96¢</span>
              </div>
            </div>
          </Float>

          <Float pos={{ top: "6%", left: "50%", marginLeft: -36 }} delay="0.4s">
            <span className="stars-sway" style={{ display: "inline-block" }}>
              <img src="/3-stars.png" alt="" width={72} style={{ opacity: 0.92 }} />
            </span>
          </Float>

          <Float pos={{ top: "47%", left: "0%" }} rot="3deg" delay="0.7s">
            <span className="canary-pill">Settled on Arc</span>
          </Float>

          <Float pos={{ top: "52%", right: "1%" }} rot="-4deg" delay="1.6s">
            <span className="canary-pill">Chainlink-resolved</span>
          </Float>

          <Float pos={{ bottom: "15%", left: "8%" }} rot="-3deg" delay="0.9s">
            <span className="canary-sticker">
              Payout up to <strong>20×</strong>
            </span>
          </Float>

          <Float pos={{ bottom: "13%", right: "9%" }} rot="5deg" delay="1.9s">
            <span className="canary-pill canary-pill--accent">
              LPs earn premium + yield
            </span>
          </Float>
        </div>

        <div className="canary-hero-content">
          <div className="canary-kicker" style={{ marginBottom: 18 }}>
            Onchain insurance markets · live on Arc
          </div>
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
            Binary markets to hedge stablecoin depegs and protocol exploits. Buy
            parametric cover in one click — or underwrite and earn. Settled on
            Arc, resolved by Chainlink.
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
              Launch app →
            </Link>
            <a
              href="#how"
              className="canary-btn canary-btn--ghost"
              style={{ padding: "13px 22px", fontSize: 15 }}
            >
              See how it works
            </a>
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
            body="Choose a market — a stablecoin depeg (USDe, USDC, DAI) or a protocol exploit (Aave, Morpho)."
          />
          <Step
            n="02"
            title="Cover or underwrite"
            body="Buy YES to hedge the event for a small premium, or sell NO to underwrite and earn premium + idle-collateral yield."
          />
          <Step
            n="03"
            title="Auto-settles on Arc"
            body="A Chainlink price feed reads the asset; a CCIP message settles the market on Arc. Winning tokens redeem for $1 of USDC."
          />
        </div>
      </section>

      {/* Two modes */}
      <section style={{ marginTop: 48 }}>
        <div
          className="canary-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          <div className="canary-card" style={{ cursor: "default" }}>
            <div className="canary-kicker" style={{ marginBottom: 10 }}>
              Simple — for protection
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
          <div className="canary-card" style={{ cursor: "default" }}>
            <div className="canary-kicker" style={{ marginBottom: 10 }}>
              Expert — for traders & LPs
            </div>
            <div
              style={{
                fontFamily: "var(--font-radley)",
                fontSize: 20,
                marginBottom: 8,
              }}
            >
              Trade YES/NO and provide liquidity
            </div>
            <p style={{ fontSize: 14, color: "rgba(30,30,30,0.6)", lineHeight: 1.55 }}>
              Live binary prices, probability bars, and an AMM. Underwrite risk,
              earn the spread plus yield on idle collateral.
            </p>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ marginTop: 64, textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-radley)",
            fontSize: "clamp(26px, 3.4vw, 40px)",
            letterSpacing: "-0.02em",
            margin: "0 0 18px",
          }}
        >
          Ready to hedge onchain risk?
        </h2>
        <Link
          href="/markets"
          className="canary-btn canary-btn--accent"
          style={{ padding: "13px 24px", fontSize: 15 }}
        >
          Launch app →
        </Link>
      </section>
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
