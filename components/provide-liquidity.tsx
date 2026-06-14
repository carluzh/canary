"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { type Market } from "@/lib/markets";
import { cents, usd } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/contracts/addresses";
import { CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { useCoverMarket } from "@/lib/web3/demo-market";
import { useLiveMarket } from "@/lib/contracts/markets-onchain";
import { ConnectWallet } from "@/components/connect-wallet";
import { BlinkDeposit, type DepositRow } from "@/components/blink-deposit";
import type { DepositCall, DepositPlan } from "@/lib/web3/blink";

// The maker / liquidity-provider flow, gated behind a button on the order book.
// Polymarket-style: a deposit mints equal YES + NO shares which are posted as
// limit orders on BOTH sides of the book (a YES ask so people can Buy YES, a NO
// ask so people can Buy NO). The LP earns the spread when those fill, plus yield
// on the idle collateral. Minting is intentionally hidden from the taker panel
// and only exposed here.

function toShares(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return parseUnits(value.toFixed(6), 6);
}

const clampPrice = (p: number) => Math.min(999_999, Math.max(1, Math.round(p)));

export function ProvideLiquidity({ m }: { m: Market }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: "1px solid var(--c-border)",
          color: "var(--c-accent)",
          fontFamily: "var(--sans-stack)",
          fontSize: 12,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 8,
          whiteSpace: "nowrap",
        }}
      >
        + Provide Liquidity
      </button>
      {open && <LpModal m={m} onClose={() => setOpen(false)} />}
    </>
  );
}

function LpModal({ m, onClose }: { m: Market; onClose: () => void }) {
  const { isConnected } = useAccount();
  const market = useCoverMarket(m.asset);
  const { price } = useLiveMarket(m); // live YES price, 0..1
  const [amount, setAmount] = useState("20");
  const [deposit, setDeposit] = useState(false);

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const n = parseFloat(amount) || 0;
  // Post each side at the current mid: YES ask at the YES price, NO ask at the NO
  // price. Adds two-sided depth so both Buy YES and Buy NO can fill.
  const yesAsk = clampPrice(price * 1e6);
  const noAsk = clampPrice((1 - price) * 1e6);

  const plan = useMemo<DepositPlan | null>(() => {
    if (!market) return null;
    const N = toShares(n);
    if (N === 0n) return null;
    const calls: DepositCall[] = [
      { address: market, abi: CANARY_MARKET_ABI, functionName: "mintSets", args: [N] },
      { address: market, abi: CANARY_MARKET_ABI, functionName: "placeOrder", args: [true, false, BigInt(yesAsk), N] },
      { address: market, abi: CANARY_MARKET_ABI, functionName: "placeOrder", args: [false, false, BigInt(noAsk), N] },
    ];
    return { token: USDC_ADDRESS, spender: market, amount: N, calls };
  }, [market, n, yesAsk, noAsk]);

  const rows: DepositRow[] = [
    { label: "You deposit", value: usd(n) },
    { label: "Mints", value: `${n.toFixed(2)} YES + ${n.toFixed(2)} NO` },
    { label: "Posts", value: `Sell YES ${cents(yesAsk / 1e6)} / NO ${cents(noAsk / 1e6)}` },
  ];

  const disabledReason = !market
    ? `Liquidity is enabled for USDe in this demo. ${m.asset} market is coming soon.`
    : !plan
    ? "Enter an amount to provide."
    : undefined;

  return createPortal(
    <div
      className="canary-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Provide liquidity"
      onClick={() => onClose()}
    >
      <div
        className="canary-shell"
        data-theme="expert"
        style={
          {
            width: "min(440px, calc(100vw - 32px))",
            background: "#15181c",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            padding: 22,
            minHeight: 0,
            margin: 0,
          } as CSSProperties
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-radley)",
              fontSize: 20,
              color: "var(--c-ink)",
            }}
          >
            Provide Liquidity
          </div>
          <button
            className="canary-modal-x"
            onClick={onClose}
            aria-label="Close"
            style={{ color: "var(--c-muted)" }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--c-muted)", margin: "0 0 16px" }}>
          Make a market. Your deposit mints equal YES + NO shares, posted as limit
          orders on both sides of the book. You earn the spread when traders fill
          them, plus yield on the idle collateral while the market is open.
        </p>

        <label className="canary-stat-label">Amount (USDC)</label>
        <input
          className="canary-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ margin: "6px 0 14px" }}
        />

        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            <span style={{ color: "var(--c-muted)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--sans-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {r.value}
            </span>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          {!isConnected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="canary-banner">Connect your wallet to provide liquidity.</div>
              <ConnectWallet />
            </div>
          ) : (
            <button
              className="canary-btn canary-btn--accent canary-btn--block"
              onClick={() => setDeposit(true)}
              disabled={!plan}
              title={disabledReason}
            >
              Provide Liquidity
            </button>
          )}
          {isConnected && !!market && disabledReason && (
            <div className="canary-blink-reason" style={{ marginTop: 8 }}>
              {disabledReason}
            </div>
          )}
        </div>

        <BlinkDeposit
          open={deposit}
          onClose={() => setDeposit(false)}
          onDone={onClose}
          title="Provide liquidity"
          assetSymbol={m.asset}
          assetColor="var(--c-accent)"
          rows={rows}
          payLabel="You deposit"
          payValue={`${usd(n)} USDC`}
          cta="Provide liquidity"
          plan={plan}
          disabledReason={disabledReason}
        />
      </div>
    </div>,
    document.body
  );
}
