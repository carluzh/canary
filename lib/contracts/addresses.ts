import { arcTestnet } from "@/lib/web3/chains";

// Arc testnet USDC — ERC-20 interface, 6 decimals. (Native gas USDC is 18-dec
// and handled by the chain; never take collateral via msg.value.)
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

// Populated by the contracts team from deployments.json once live. Until then,
// DEPLOYED stays false and the app runs entirely on mock data.
export const MARKET_FACTORY_ADDRESS: `0x${string}` | null = null;
export const DEPLOYED: boolean = MARKET_FACTORY_ADDRESS !== null;

export const DEFAULT_CHAIN_ID = arcTestnet.id;
