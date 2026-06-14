"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/web3/chains";
import { shortAddr } from "@/lib/format";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        className="canary-btn canary-btn--ink"
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const wrongChain = chainId !== arcTestnet.id;
  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {wrongChain && (
        <button
          className="canary-btn canary-btn--warn"
          onClick={() => switchChain({ chainId: arcTestnet.id })}
        >
          Switch to Arc
        </button>
      )}
      <button
        className="canary-btn canary-btn--account"
        onClick={() => disconnect()}
        title="Sign out"
      >
        <span className="canary-account-label">
          <span className="canary-account-addr">{shortAddr(address)}</span>
          <span className="canary-account-signout">Sign out</span>
        </span>
      </button>
    </div>
  );
}
