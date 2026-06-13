import Link from "next/link";

const ACCENT = "var(--c-kicker)";

// Canary wordmark: rendered in the normal sans used across the app (same as
// the "Launch app" button). The logo mask is filled with currentColor, so it
// is black on the light header and flips to light on the dark footer.
// Optional label (e.g. "Market") renders as a finer "_Label".
export function Wordmark({
  label,
  size = "large",
}: {
  label?: string;
  size?: "large" | "small";
}) {
  const iconSize = size === "small" ? 19 : 24;
  const fontSize = size === "small" ? 16 : 20;
  return (
    <Link
      href="/"
      aria-label={`Canary${label ? ` ${label}` : ""} - home`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: iconSize,
          height: iconSize,
          backgroundColor: "currentColor",
          WebkitMaskImage: "url(/logo.png)",
          maskImage: "url(/logo.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
      <span
        style={{
          fontSize,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          transform: "translateY(-2px)",
        }}
      >
        <span style={{ fontFamily: "var(--sans-stack)", fontWeight: 600 }}>
          canary
        </span>
        {label ? (
          <span
            style={{
              fontFamily: "var(--sans-stack)",
              fontWeight: 400,
              color: ACCENT,
            }}
          >
            _{label}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
