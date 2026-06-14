"use client";

import { Wordmark } from "@/components/top-bar";
import { ModeToggle } from "@/components/mode-toggle";
import { ConnectWallet } from "@/components/connect-wallet";

export function SiteHeader() {
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
      <Wordmark />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ModeToggle />
        <ConnectWallet />
      </div>
    </header>
  );
}
