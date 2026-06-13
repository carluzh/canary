// Frozen market interface — mirrors interfaces/IBinaryMarket.sol in the
// contracts repo (build-plan.md §3). The frontend codes against this; the
// contracts team implements it. Swap mock data → on-chain reads with these.
export const BINARY_MARKET_ABI = [
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "yes", type: "bool" }, { name: "usdcIn", type: "uint256" }], outputs: [{ name: "sharesOut", type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "yes", type: "bool" }, { name: "sharesIn", type: "uint256" }], outputs: [{ name: "usdcOut", type: "uint256" }] },
  { type: "function", name: "priceYes", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "positionOf", stateMutability: "view", inputs: [{ name: "u", type: "address" }], outputs: [{ name: "yes", type: "uint256" }, { name: "no", type: "uint256" }] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "usdcOut", type: "uint256" }] },
  { type: "function", name: "resolve", stateMutability: "nonpayable", inputs: [{ name: "depegHappened", type: "bool" }], outputs: [] },
  { type: "function", name: "expiry", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "state", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "question", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
