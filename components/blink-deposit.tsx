"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/connect-wallet";
import { arcTestnet } from "@/lib/web3/chains";
import { useBlinkDeposit, type DepositPlan } from "@/lib/web3/blink";

// The deposit step — the moment Blink owns. The parent builds an executable
// `plan` (approve -> fillOrder for cover, or approve -> mintSets+placeOrder for
// underwrite) and the human-readable summary; this modal runs it and shows one
// clean, branded progress flow. Identical surface for both funding moments.

export type DepositRow = { label: string; value: string };

export type BlinkDepositProps = {
  open: boolean;
  onClose: () => void;
  onDone?: () => void; // fired after a successful deposit (e.g. refetch book)
  title: string; // "Buy cover" / "Underwrite USDe"
  assetSymbol: string;
  assetColor: string;
  rows: DepositRow[]; // summary lines (Cover amount, Premium, ...)
  payLabel: string; // "You pay"
  payValue: string; // "0.08 USDC"
  cta: string; // "Buy cover" / "Underwrite"
  plan: DepositPlan | null; // null => nothing to fund (no liquidity)
  disabledReason?: string; // why the plan is null, shown inline
};

const explorerTx = (hash: string) =>
  `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;

export function BlinkDeposit(props: BlinkDepositProps) {
  const { open, onClose, onDone, plan } = props;
  const { isConnected } = useAccount();
  const { state, deposit, reset } = useBlinkDeposit();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reset the flow each time the modal opens; close on Escape.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.phase !== "approving" && state.phase !== "funding")
        onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, state.phase]);

  // Fire onDone once on success.
  useEffect(() => {
    if (state.phase === "success") onDone?.();
  }, [state.phase, onDone]);

  if (!mounted || !open) return null;

  const busy = state.phase === "switching" || state.phase === "approving" || state.phase === "funding";
  const done = state.phase === "success";

  const run = async () => {
    if (!plan) return;
    await deposit(plan);
  };

  return createPortal(
    <div
      className="canary-blink-overlay"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="canary-blink-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${props.title} with Blink`}
        style={{ ["--brand"]: props.assetColor } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Blink, front and centre */}
        <div className="canary-blink-head">
          <BlinkBadge />
          {!busy && (
            <button className="canary-blink-x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <div className="canary-blink-title">
          {props.title}
          <span className="canary-blink-chip">{props.assetSymbol}</span>
        </div>

        <div className="canary-blink-rows">
          {props.rows.map((r) => (
            <div key={r.label} className="canary-blink-row">
              <span>{r.label}</span>
              <span className="canary-mono">{r.value}</span>
            </div>
          ))}
          <div className="canary-blink-row canary-blink-pay">
            <span>{props.payLabel}</span>
            <span className="canary-mono">{props.payValue}</span>
          </div>
        </div>

        <Steps state={state} />

        {/* Action zone */}
        {!isConnected ? (
          <div className="canary-blink-connect">
            <div className="canary-blink-connect-note">Connect your wallet to deposit.</div>
            <ConnectWallet />
          </div>
        ) : done ? (
          <div className="canary-blink-doneblock">
            <div className="canary-blink-success">Deposit complete</div>
            {state.txHashes[0] && (
              <a
                className="canary-blink-link"
                href={explorerTx(state.txHashes[state.txHashes.length - 1]!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Arcscan →
              </a>
            )}
            <button className="canary-btn canary-btn--accent canary-btn--block" onClick={onClose}>
              Done
            </button>
          </div>
        ) : state.phase === "error" ? (
          <div className="canary-blink-doneblock">
            <div className="canary-blink-err">{state.error}</div>
            <button
              className="canary-btn canary-btn--accent canary-btn--block"
              onClick={run}
              disabled={!plan}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <button
              className="canary-btn canary-btn--accent canary-btn--block canary-blink-confirm"
              onClick={run}
              disabled={!plan || busy}
            >
              {busy ? <Spinner /> : `Confirm · ${props.cta}`}
            </button>
            {!plan && props.disabledReason && (
              <div className="canary-blink-reason">{props.disabledReason}</div>
            )}
          </>
        )}

        <div className="canary-blink-foot">
          USDC is pulled from your wallet on Arc. You stay in the app the whole time.
        </div>
      </div>
    </div>,
    document.body
  );
}

// Three-node progress: Approve -> Fund -> Confirmed, reflecting DepositState.
function Steps({ state }: { state: ReturnType<typeof useBlinkDeposit>["state"] }) {
  const approveState =
    state.phase === "idle"
      ? "pending"
      : state.phase === "switching" || state.phase === "approving"
      ? "active"
      : "done";
  const fundState =
    state.phase === "funding"
      ? "active"
      : state.phase === "success"
      ? "done"
      : "pending";
  const confirmState = state.phase === "success" ? "done" : "pending";

  const fundLabel =
    state.totalSteps > 1 && state.phase === "funding"
      ? `Fund deposit (${state.stepIndex + 1}/${state.totalSteps})`
      : "Fund deposit";

  return (
    <div className="canary-blink-steps">
      <Step n={1} label="Approve USDC" status={approveState} />
      <span className="canary-blink-steprail" />
      <Step n={2} label={fundLabel} status={fundState} />
      <span className="canary-blink-steprail" />
      <Step n={3} label="Confirmed" status={confirmState} />
    </div>
  );
}

function Step({
  n,
  label,
  status,
}: {
  n: number;
  label: string;
  status: "pending" | "active" | "done";
}) {
  return (
    <div className="canary-blink-step" data-status={status}>
      <span className="canary-blink-stepdot">
        {status === "done" ? "✓" : status === "active" ? <Spinner small /> : n}
      </span>
      <span className="canary-blink-steplabel">{label}</span>
    </div>
  );
}

// Blink brand lockup. Swap the glyph/wordmark for the official Blink asset from
// the booth when available; kept on-theme (accent + lightning) until then.
function BlinkBadge() {
  return (
    <div className="canary-blink-badge">
      <span className="canary-blink-bolt" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      </span>
      <span className="canary-blink-word">Blink</span>
      <span className="canary-blink-sub">instant deposit</span>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  return <span className={small ? "canary-spinner canary-spinner--sm" : "canary-spinner"} aria-hidden />;
}
