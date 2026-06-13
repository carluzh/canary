import Link from "next/link";

const ACCENT = "#c97849";

// Canary wordmark: "can" in Pixelify + "ary" in Radley, echoing the source
// design system's split-typeface mark. The logo mask is filled canary-orange.
// Optional label (e.g. "Market") renders as a finer "_Label".
export function Wordmark({
  label,
  size = "large",
}: {
  label?: string;
  size?: "large" | "small";
}) {
  const iconSize = size === "small" ? 22 : 28;
  const fontSize = size === "small" ? 19 : 24;
  return (
    <Link
      href="/"
      aria-label={`Canary${label ? ` ${label}` : ""} - home`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        color: "#1e1e1e",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: iconSize,
          height: iconSize,
          backgroundColor: "#ee9259",
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
        <span style={{ fontFamily: "var(--font-pixelify)" }}>can</span>
        <span style={{ fontFamily: "var(--font-radley)", fontWeight: 700 }}>
          ary
        </span>
        {label ? (
          <span
            style={{
              fontFamily: "var(--font-radley)",
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
