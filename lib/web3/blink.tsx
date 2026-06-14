"use client";

// ============================================================================
//  BLINK ADAPTER SEAM
// ----------------------------------------------------------------------------
//  Blink = a stablecoin-deposit SDK: it pulls USDC straight from the user's
//  wallet so a deposit feels native (no leaving the app, no pasting addresses).
//  We wrap our two USDC-funding moments with it:
//    - Buy cover  : approve -> fillOrder(s)        (planBuyCover)
//    - Underwrite : approve -> mintSets + placeOrder (planUnderwrite)
//
//  This hook is the ONE place that touches the funding rail. Today it executes
//  the approve+calls through the connected (injected) wallet via wagmi. When the
//  real Blink SDK is in hand, swap the body of `executeFunding` below for the
//  SDK call — nothing else in the app needs to change. See `fundViaBlink`.
// ============================================================================

import { useCallback, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import type { Abi, Address, Hash } from "viem";
import { erc20Abi } from "viem";
import { arcTestnet } from "@/lib/web3/chains";

// Flip to true once the Blink SDK is wired into `fundViaBlink`. Until then the
// flow runs live against Arc through the connected wallet (identical UX).
export const BLINK_SDK_ENABLED = false;

export type DepositCall = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

// Everything Blink needs to fund a moment: the token to pull, who to approve,
// how much, and the contract calls that consume it. `calls` already encodes
// whether this is a buy-cover (fillOrders) or an underwrite (mintSets+placeOrder).
export type DepositPlan = {
  token: Address; // USDC
  spender: Address; // the market that pulls the USDC
  amount: bigint; // USDC to approve / pull, in 6-dec base units
  calls: DepositCall[]; // sequential calls run after approval
};

export type DepositPhase =
  | "idle"
  | "switching" // moving the wallet onto Arc
  | "approving" // one-time USDC allowance for the market
  | "funding" // running the deposit calls
  | "success"
  | "error";

export type DepositState = {
  phase: DepositPhase;
  stepIndex: number; // which funding call is in flight (0-based)
  totalSteps: number; // number of funding calls (excludes approve)
  approved: boolean; // allowance was already sufficient / just granted
  approveHash?: Hash;
  txHashes: Hash[];
  error?: string;
};

const IDLE: DepositState = {
  phase: "idle",
  stepIndex: 0,
  totalSteps: 0,
  approved: false,
  txHashes: [],
};

export function useBlinkDeposit() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<DepositState>(IDLE);
  // Guard against overlapping deposits (double-click on Confirm).
  const running = useRef(false);

  const reset = useCallback(() => {
    running.current = false;
    setState(IDLE);
  }, []);

  const deposit = useCallback(
    async (plan: DepositPlan): Promise<boolean> => {
      if (running.current) return false;
      if (!isConnected || !address) {
        setState({ ...IDLE, phase: "error", error: "Connect your wallet first." });
        return false;
      }
      if (!publicClient) {
        setState({ ...IDLE, phase: "error", error: "No Arc RPC client available." });
        return false;
      }
      if (plan.calls.length === 0) {
        setState({ ...IDLE, phase: "error", error: "No liquidity to fill yet." });
        return false;
      }

      running.current = true;
      setState({ ...IDLE, totalSteps: plan.calls.length, phase: "switching" });

      try {
        // 1. Make sure the wallet is on Arc before any write.
        if (chainId !== arcTestnet.id) {
          await switchChainAsync({ chainId: arcTestnet.id });
        }

        await executeFunding({
          plan,
          owner: address,
          publicClient,
          writeContractAsync,
          onPhase: (patch) => setState((s) => ({ ...s, ...patch })),
        });

        setState((s) => ({ ...s, phase: "success" }));
        return true;
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: "error",
          error: humanizeError(err),
        }));
        return false;
      } finally {
        running.current = false;
      }
    },
    [address, chainId, isConnected, publicClient, switchChainAsync, writeContractAsync]
  );

  return { state, deposit, reset };
}

// ---------------------------------------------------------------------------
// Funding executor — THE SWAP POINT.
// ---------------------------------------------------------------------------

type Executor = {
  plan: DepositPlan;
  owner: Address;
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  onPhase: (patch: Partial<DepositState>) => void;
};

async function executeFunding(ctx: Executor): Promise<void> {
  if (BLINK_SDK_ENABLED) {
    await fundViaBlink(ctx);
  } else {
    await fundViaInjectedWallet(ctx);
  }
}

/**
 * Drop-in target for the real Blink SDK. When you have it, call its deposit
 * primitive here with `plan.token` / `plan.amount` / `plan.spender` / `plan.calls`
 * and report progress through `onPhase`, then set BLINK_SDK_ENABLED = true.
 * The UI (BlinkDeposit modal) reads exactly the same DepositState either way.
 */
async function fundViaBlink(_ctx: Executor): Promise<void> {
  // e.g. await blink.deposit({ token, amount, spender, calls, onStep })
  throw new Error("Blink SDK not wired yet — set BLINK_SDK_ENABLED once fundViaBlink is implemented.");
}

/**
 * Fallback rail used until the SDK lands: pull USDC via the connected wallet.
 * approve (skipped if allowance already covers it) -> run each funding call,
 * waiting for each receipt so the modal can advance one clean step at a time.
 */
async function fundViaInjectedWallet(ctx: Executor): Promise<void> {
  const { plan, owner, publicClient, writeContractAsync, onPhase } = ctx;

  // 1. Approve USDC for the market — but only if the existing allowance is short.
  const allowance = (await publicClient.readContract({
    address: plan.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, plan.spender],
  })) as bigint;

  if (allowance < plan.amount) {
    onPhase({ phase: "approving" });
    const approveHash = await writeContractAsync({
      address: plan.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [plan.spender, plan.amount],
      chainId: arcTestnet.id,
    });
    onPhase({ approveHash });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  onPhase({ approved: true, phase: "funding" });

  // 2. Run the funding calls sequentially, surfacing each step.
  const txHashes: Hash[] = [];
  for (let i = 0; i < plan.calls.length; i++) {
    onPhase({ stepIndex: i });
    const c = plan.calls[i]!;
    const hash = await writeContractAsync({
      address: c.address,
      // wagmi's deep generics can't infer a runtime-built call; the ABI/args are
      // validated on-chain. Cast narrowly to keep the call shape honest.
      abi: c.abi as Abi,
      functionName: c.functionName,
      args: c.args as unknown[],
      chainId: arcTestnet.id,
    } as never);
    txHashes.push(hash);
    onPhase({ txHashes: [...txHashes] });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Transaction rejected.";
  if (/insufficient funds|exceeds balance|InsufficientBalance/i.test(msg))
    return "Not enough USDC in your wallet.";
  if (/chain|network|switch/i.test(msg)) return "Switch your wallet to Arc and try again.";
  // Keep it short for the modal; full error is in the console via the throw.
  return msg.length > 120 ? msg.slice(0, 117) + "…" : msg;
}
