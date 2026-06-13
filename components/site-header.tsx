"use client";

import Link from "next/link";
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
        marginBottom: 30,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Wordmark />
        <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
          <Link href="/markets" className="canary-nav">
            Markets
          </Link>
          <Link href="/portfolio" className="canary-nav">
            Portfolio
          </Link>
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ModeToggle />
        <ConnectWallet />
      </div>
    </header>
  );
}
