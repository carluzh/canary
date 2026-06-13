"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Wordmark } from "@/components/top-bar";
import { ModeToggle } from "@/components/mode-toggle";
import { ConnectWallet } from "@/components/connect-wallet";

export function SiteHeader() {
  const { isConnected } = useAccount();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        minHeight: 38,
        marginBottom: 30,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Wordmark />
        {isConnected && (
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <Link href="/portfolio" className="canary-nav">
              Portfolio
            </Link>
          </nav>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ModeToggle />
        <ConnectWallet />
      </div>
    </header>
  );
}
