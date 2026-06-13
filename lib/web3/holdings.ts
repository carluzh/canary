"use client";

import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { STABLES } from "@/lib/stables";

// Reads the connected wallet's real Ethereum-mainnet balances for our stablecoin
// set (multicall). Used to split the insurance board into "Proposed" (what you
// hold) vs "Available" (everything else).
export function useStableHoldings() {
  const { address, isConnected } = useAccount();
  const enabled = isConnected && !!address;
  const withAddr = STABLES.filter((s) => s.address);

  const { data, isLoading } = useReadContracts({
    contracts: enabled
      ? withAddr.map((s) => ({
          address: s.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address as `0x${string}`] as const,
          chainId: mainnet.id,
        }))
      : [],
    query: { enabled },
  });

  const holdings: Record<string, number> = {};
  if (data) {
    withAddr.forEach((s, i) => {
      const r = data[i];
      if (r && r.status === "success") {
        const v = Number(formatUnits(r.result as bigint, s.decimals));
        if (v > 0) holdings[s.symbol] = v;
      }
    });
  }

  return { holdings, isLoading: enabled && isLoading };
}
