"use client";

// Runtime market override for the back-to-back demo flow. When the presenter
// creates a fresh USDe cover market between demos, we repoint the whole app at
// the new (cover, feed) pair WITHOUT a rebuild by storing the override in React
// context + localStorage. Live components resolve the active cover-market
// address through useCoverMarket() instead of the static getOnchainMarket()
// mapping, so a freshly-created market is picked up app-wide.
//
// Import direction (no cycles): this module imports addresses + active-markets
// (both pure) only; markets-onchain imports THIS module.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEMO_MARKET_ADDRESS, DEMO_FEED_ADDRESS } from "@/lib/contracts/addresses";
import { isActiveSymbol } from "@/lib/contracts/active-markets";

const STORAGE_KEY = "canary-demo-market";

export type DemoMarketState = {
  coverMarket: `0x${string}`;
  feed: `0x${string}`;
};

type DemoMarketContextValue = DemoMarketState & {
  setCoverMarket: (market: `0x${string}`, feed: `0x${string}`) => void;
};

const DEFAULTS: DemoMarketState = {
  coverMarket: DEMO_MARKET_ADDRESS,
  feed: DEMO_FEED_ADDRESS,
};

const DemoMarketContext = createContext<DemoMarketContextValue | null>(null);

// SSR-safe load: returns null on the server (or when nothing is persisted yet)
// so the provider initializes to DEFAULTS and hydrates from localStorage in a
// useEffect to avoid hydration mismatches.
function loadFromStorage(): DemoMarketState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoMarketState>;
    if (
      typeof parsed?.coverMarket === "string" &&
      typeof parsed?.feed === "string"
    ) {
      return { coverMarket: parsed.coverMarket, feed: parsed.feed };
    }
  } catch {
    // Corrupt/unparseable entry — fall back to defaults.
  }
  return null;
}

export function DemoMarketProvider({ children }: { children: React.ReactNode }) {
  // Server + first client render both start from DEFAULTS (deterministic).
  const [state, setState] = useState<DemoMarketState>(DEFAULTS);

  // Hydrate from localStorage after mount.
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) setState(stored);
  }, []);

  const setCoverMarket = useCallback(
    (market: `0x${string}`, feed: `0x${string}`) => {
      const next: DemoMarketState = { coverMarket: market, feed };
      setState(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage unavailable (private mode / quota) — in-memory override
          // still applies for this session.
        }
      }
    },
    []
  );

  const value = useMemo<DemoMarketContextValue>(
    () => ({
      coverMarket: state.coverMarket,
      feed: state.feed,
      setCoverMarket,
    }),
    [state.coverMarket, state.feed, setCoverMarket]
  );

  return (
    <DemoMarketContext.Provider value={value}>
      {children}
    </DemoMarketContext.Provider>
  );
}

// Assumes DemoMarketProvider is mounted (providers.tsx wraps the app).
export function useDemoMarket(): DemoMarketContextValue {
  const ctx = useContext(DemoMarketContext);
  if (!ctx) {
    throw new Error("useDemoMarket must be used within a DemoMarketProvider");
  }
  return ctx;
}

// Override-aware replacement for getOnchainMarket() in LIVE components: returns
// the (possibly overridden) cover-market address for active symbols, and null
// for view-only/mock symbols (same gating behavior as before).
export function useCoverMarket(symbol: string): `0x${string}` | null {
  const { coverMarket } = useDemoMarket();
  return isActiveSymbol(symbol) ? coverMarket : null;
}
