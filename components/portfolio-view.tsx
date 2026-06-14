"use client";

import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { arcTestnet } from "@/lib/web3/chains";
import { useMode } from "@/lib/web3/mode";
import { ONCHAIN_MARKETS } from "@/lib/contracts/active-markets";
import { useUserPosition, useYieldPosition, useMarketState } from "@/lib/contracts/markets-onchain";
import { YIELD_MARKET_ADDRESS, DEFAULT_CHAIN_ID } from "@/lib/contracts/addresses";
import { MarketState, CANARY_MARKET_ABI } from "@/lib/contracts/abi";
import { redeem } from "@/lib/contracts/canary";
import { sharesToUsd, usd } from "@/lib/format";

// The active symbols backed by live contracts (effectively just USDe). Each entry
// is a held-position candidate; we read YES (open cover) and NO (underwriting).
const ACTIVE_ENTRIES = Object.entries(ONCHAIN_MARKETS) as [string, `0x${string}`][];

export function PortfolioView() {
  const { mode } = useMode();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  // Live position reads for the active USDe market. ACTIVE_ENTRIES is a fixed,
  // statically-known list so the hook count is stable across renders.
  const positions = ACTIVE_ENTRIES.map(([symbol, market]) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const pos = useUserPosition(market, address);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state } = useMarketState(market);
    return { symbol, market, ...pos, state };
  });

  // Yield is only ever non-zero on the yield market.
  const { claimable } = useYieldPosition(YIELD_MARKET_ADDRESS, address);

  // Open cover = total YES-share value across active markets.
  const openCoverUsd = positions.reduce((acc, p) => acc + sharesToUsd(p.yes), 0);
  const yieldEarnedUsd = sharesToUsd(claimable);

  const hasAnyPosition = positions.some((p) => p.yes > 0n || p.no > 0n);

  return (
    <main
      className="canary-shell"
      data-theme={mode === "expert" ? "expert" : "simple"}
      style={{ paddingBottom: 0 }}
    >
      <SiteHeader />

      <h1
        style={{
          margin: "0 0 22px",
          fontFamily: "var(--font-radley)",
          fontSize: "clamp(26px, 3.4vw, 38px)",
          letterSpacing: "-0.02em",
        }}
      >
        Portfolio
      </h1>

      {!isConnected ? (
        <div className="canary-banner">
          Connect your wallet to see balances and positions.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 32, marginBottom: 30 }}>
            <Stat
              label="Wallet (Arc)"
              value={
                bal ? `${Number(bal.formatted).toFixed(2)} ${bal.symbol}` : "0.00"
              }
            />
            <Stat label="Open cover" value={usd(openCoverUsd)} />
            <Stat label="Yield earned" value={yieldEarnedUsd > 0 ? usd(yieldEarnedUsd) : "$0.00"} />
          </div>
          <div className="canary-panel">
            <div className="canary-kicker" style={{ marginBottom: 12 }}>
              Positions
            </div>
            {!hasAnyPosition ? (
              <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
                No open positions. Buy cover or provide liquidity to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {positions.map((p) =>
                  p.yes > 0n || p.no > 0n ? (
                    <PositionRow
                      key={p.market}
                      symbol={p.symbol}
                      market={p.market}
                      yes={p.yes}
                      no={p.no}
                      state={p.state}
                    />
                  ) : null
                )}
                {yieldEarnedUsd > 0 ? (
                  <YieldRow claimableUsd={yieldEarnedUsd} market={YIELD_MARKET_ADDRESS} />
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      <SiteFooter />
      <div aria-hidden style={{ height: 30 }} />
    </main>
  );
}

function PositionRow({
  symbol,
  market,
  yes,
  no,
  state,
}: {
  symbol: string;
  market: `0x${string}`;
  yes: bigint;
  no: bigint;
  state: MarketState;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    chainId: DEFAULT_CHAIN_ID,
  });

  // YES (cover) wins on a proven depeg; NO (underwriting) wins on expiry-no-depeg.
  const yesWon = state === MarketState.TriggeredYes && yes > 0n;
  const noWon = state === MarketState.ExpiredNo && no > 0n;
  const canRedeem = yesWon || noWon;

  const onRedeem = () => {
    const call = redeem(market);
    writeContract({
      address: call.address,
      abi: CANARY_MARKET_ABI,
      functionName: call.functionName,
      args: call.args,
      chainId: DEFAULT_CHAIN_ID,
    });
  };

  const busy = isPending || isConfirming;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderTop: "1px solid var(--c-border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase" }}>
          {symbol}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--c-muted)" }}>
          {yes > 0n ? <span>Cover {usd(sharesToUsd(yes))}</span> : null}
          {no > 0n ? <span>Underwriting {usd(sharesToUsd(no))}</span> : null}
        </div>
      </div>
      {canRedeem ? (
        <button
          type="button"
          className="canary-mm-cta"
          onClick={onRedeem}
          disabled={busy}
        >
          {busy ? "Redeeming..." : "Redeem"}
        </button>
      ) : null}
    </div>
  );
}

function YieldRow({
  claimableUsd,
  market,
}: {
  claimableUsd: number;
  market: `0x${string}`;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    chainId: DEFAULT_CHAIN_ID,
  });

  const onClaim = () => {
    writeContract({
      address: market,
      abi: CANARY_MARKET_ABI,
      functionName: "claimYield",
      args: [],
      chainId: DEFAULT_CHAIN_ID,
    });
  };

  const busy = isPending || isConfirming;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderTop: "1px solid var(--c-border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Yield earned</div>
        <div style={{ fontSize: 13, color: "var(--c-muted)" }}>
          {usd(claimableUsd)} claimable
        </div>
      </div>
      <button
        type="button"
        className="canary-mm-cta"
        onClick={onClaim}
        disabled={busy}
      >
        {busy ? "Claiming..." : "Claim"}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="canary-stat-label">{label}</div>
      <div className="canary-stat-value">{value}</div>
    </div>
  );
}
