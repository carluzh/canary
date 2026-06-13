import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, sepolia } from "./chains";

// Minimal, dependency-light wallet wiring: an injected connector (MetaMask /
// Rabbit / browser wallets) works with zero external setup. To add a
// WalletConnect modal later, drop in @reown/appkit-adapter-wagmi here.
export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepolia],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
    [sepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
