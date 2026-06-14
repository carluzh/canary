// Drop-in replacement for the frontend's lib/contracts/abi.ts.
//
// The contract is an on-chain order book (CanaryMarket), not the AMM the old
// BINARY_MARKET_ABI assumed. ABIs below are the exact, compiler-emitted
// interfaces (see abis.json). The price/buy/underwrite mapping your UI needs is
// in canary.ts; the conceptual mapping is in INTEGRATION.md.
import type { Abi } from "viem";
import abis from "./abis.json";

export const CANARY_MARKET_ABI = abis.CanaryMarket as Abi;
export const CANARY_FACTORY_ABI = abis.CanaryMarketFactory as Abi;
export const RELAYED_FEED_ABI = abis.RelayedFeed as Abi;
export const DEPEG_SENTINEL_ABI = abis.DepegSentinel as Abi;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// CanaryMarket.state() enum.
export enum MarketState {
  Open = 0,
  TriggeredYes = 1, // depeg proven -> YES pays $1
  ExpiredNo = 2,    // expired, no depeg -> NO pays $1
}
