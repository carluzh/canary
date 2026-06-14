"use client";

// Always-visible demo controls for the back-to-back presenter flow. Two small,
// self-contained buttons backed by the in-app OPERATOR key (NOT the connected
// MetaMask wallet):
//   - CreateDemoMarket: spins up a fresh USDe cover market + repoints the app at
//     it via the demo-market override.
//   - CrashMarket: crashes the active demo feed and auto-settles the depeg so
//     "Redeem" lights up.
// Both gracefully disable when no operator key is configured and surface inline
// progress via the onStep callback plus a final success / error line.

import { useCallback, useState } from "react";
import {
  hasOperator,
  createCoverMarket,
  crashAndSettle,
} from "@/lib/web3/operator";
import { useDemoMarket } from "@/lib/web3/demo-market";

// ---- Shared helpers -------------------------------------------------------

/** Shorten an 0x address to 0x1234…abcd for compact display. */
function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** One run can be idle, running, done (ok) or errored. */
type RunStatus = "idle" | "running" | "done" | "error";

const OPERATOR_HINT = "Set NEXT_PUBLIC_OPERATOR_KEY to enable demo controls.";

// Inline style tokens (kept here so we don't touch canary.css).
const wrapStyle: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
};
const lineStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.3,
  color: "var(--c-muted)",
  maxWidth: 260,
};
const errLineStyle: React.CSSProperties = {
  ...lineStyle,
  color: "#fb5a6a",
};
const okLineStyle: React.CSSProperties = {
  ...lineStyle,
  color: "var(--c-ink)",
};

/** Small CSS-free spinner glyph that rotates via inline animation. */
function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        marginRight: 6,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "canary-demo-spin 0.7s linear infinite",
        verticalAlign: "middle",
        opacity: 0.8,
      }}
    />
  );
}

// Keyframes injected once (inline, not in canary.css).
function SpinKeyframes() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: "@keyframes canary-demo-spin{to{transform:rotate(360deg)}}",
      }}
    />
  );
}

// ---- Create -------------------------------------------------------------

export function CreateDemoMarket() {
  const { setCoverMarket } = useDemoMarket();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [step, setStep] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const ready = hasOperator();
  const running = status === "running";

  const onClick = useCallback(async () => {
    if (!ready || running) return;
    setStatus("running");
    setStep("Starting");
    setResult("");
    setError("");
    try {
      const { market, feed } = await createCoverMarket((s) => setStep(s));
      setCoverMarket(market, feed);
      setResult(`New market ready ${shortAddr(market)}`);
      setStatus("done");
      setStep("");
    } catch (err) {
      setError((err as Error).message || "Create failed");
      setStatus("error");
      setStep("");
    }
  }, [ready, running, setCoverMarket]);

  return (
    <div style={wrapStyle}>
      <SpinKeyframes />
      <button
        type="button"
        className="canary-btn canary-btn--ink"
        onClick={onClick}
        disabled={!ready || running}
        title={ready ? "Create a fresh USDe cover market" : OPERATOR_HINT}
      >
        {running ? <Spinner /> : null}
        Create Demo Market
      </button>

      {!ready ? <span style={lineStyle}>{OPERATOR_HINT}</span> : null}
      {ready && running && step ? <span style={lineStyle}>{step}</span> : null}
      {status === "done" && result ? (
        <span style={okLineStyle}>{result}</span>
      ) : null}
      {status === "error" && error ? (
        <span style={errLineStyle}>{error}</span>
      ) : null}
    </div>
  );
}

// ---- Crash --------------------------------------------------------------

export function CrashMarket() {
  const { coverMarket, feed } = useDemoMarket();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [step, setStep] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const ready = hasOperator();
  const running = status === "running";

  const onClick = useCallback(async () => {
    if (!ready || running) return;
    setStatus("running");
    setStep("Starting");
    setResult("");
    setError("");
    try {
      await crashAndSettle(coverMarket, feed, (s) => setStep(s));
      setResult("Depeg settled. Redeem now enabled.");
      setStatus("done");
      setStep("");
    } catch (err) {
      setError((err as Error).message || "Crash failed");
      setStatus("error");
      setStep("");
    }
  }, [ready, running, coverMarket, feed]);

  return (
    <div style={wrapStyle}>
      <SpinKeyframes />
      <button
        type="button"
        className="canary-btn"
        onClick={onClick}
        disabled={!ready || running}
        title={ready ? "Crash the demo feed and settle the depeg" : OPERATOR_HINT}
        style={{
          background: "#e5484d",
          color: "#ffffff",
          border: "none",
          fontWeight: 600,
          opacity: !ready || running ? 0.55 : 1,
        }}
      >
        {running ? <Spinner /> : null}
        Crash USDe
      </button>

      {!ready ? <span style={lineStyle}>{OPERATOR_HINT}</span> : null}
      {ready && running && step ? <span style={lineStyle}>{step}</span> : null}
      {status === "done" && result ? (
        <span style={okLineStyle}>{result}</span>
      ) : null}
      {status === "error" && error ? (
        <span style={errLineStyle}>{error}</span>
      ) : null}
    </div>
  );
}
