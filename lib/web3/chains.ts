import { defineChain } from "viem";
import { sepolia } from "viem/chains";

// Arc testnet — Circle's stablecoin L1 (ETHGlobal NYC sponsor chain).
// NOTE: USDC is the native gas token and uses 18-decimal *native* accounting
// (msg.value). The USDC we take as collateral is the ERC-20 interface at
// 0x3600…0000 with 6 decimals — that is handled as a token, never via msg.value.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

// Ethereum Sepolia hosts the Chainlink price read + CCIP send that settles the
// Arc market (see build-plan.md §2). Wallet can switch here for the resolver UX.
export { sepolia };
