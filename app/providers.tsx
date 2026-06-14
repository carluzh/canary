"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/web3/wagmi";
import { ModeProvider } from "@/lib/web3/mode";
import { DemoMarketProvider } from "@/lib/web3/demo-market";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ModeProvider>
          <DemoMarketProvider>{children}</DemoMarketProvider>
        </ModeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
