// Drop-in replacement for the frontend's lib/contracts/addresses.ts.
// After `forge script script/Deploy.s.sol` runs, copy contracts/deployments.json
// into the frontend (e.g. lib/contracts/deployments.json) and import it — the
// addresses below read from it so there are no hand-copied hex strings.
import { arcTestnet } from "@/lib/web3/chains";
import deployments from "./deployments.json";

// Arc testnet USDC — 6-decimal ERC-20 interface. (Native gas USDC is 18-dec and
// handled by the chain; never take collateral via msg.value.)
export const USDC_ADDRESS = (deployments.usdc ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
export const USDC_DECIMALS = 6;

export const MARKET_FACTORY_ADDRESS = deployments.factory as `0x${string}`;
export const DEMO_MARKET_ADDRESS = deployments.demoMarket as `0x${string}`;
export const DEMO_FEED_ADDRESS = deployments.demoFeed as `0x${string}`;

// Yield/underwrite deployment — the only market where yield view fns
// (totalCollateralValue, yieldStrategy, claimableYield, pendingYield) are safe
// to call; they revert on the demo market. Used as the underwrite target.
export const YIELD_MARKET_ADDRESS = deployments.yieldMarket as `0x${string}`;
export const YIELD_VAULT_ADDRESS = deployments.yieldVault as `0x${string}`;
export const YIELD_FACTORY_ADDRESS = deployments.yieldFactory as `0x${string}`;

// Optional CCIP-relayed "live Chainlink data" market (zero address if not deployed).
const ZERO = "0x0000000000000000000000000000000000000000";
export const RELAYED_FEED_ADDRESS =
  deployments.relayedFeed && deployments.relayedFeed !== ZERO ? (deployments.relayedFeed as `0x${string}`) : null;
export const RELAYED_MARKET_ADDRESS =
  deployments.relayedMarket && deployments.relayedMarket !== ZERO ? (deployments.relayedMarket as `0x${string}`) : null;

export const DEPLOYED: boolean = !!MARKET_FACTORY_ADDRESS && MARKET_FACTORY_ADDRESS !== ZERO;
export const DEFAULT_CHAIN_ID = arcTestnet.id;
