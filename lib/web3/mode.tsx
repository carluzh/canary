"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Two product surfaces over the same markets:
//   simple  → insurance-first ("buy protection against a depeg")
//   expert  → market-making / trading-first (YES/NO prices, odds, provide liquidity)
export type Mode = "simple" | "expert";

const ModeContext = createContext<{
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
}>({ mode: "simple", setMode: () => {}, toggle: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("simple");

  useEffect(() => {
    const saved = localStorage.getItem("canary-mode");
    if (saved === "simple" || saved === "expert") setMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("canary-mode", mode);
  }, [mode]);

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode,
        toggle: () => setMode((m) => (m === "simple" ? "expert" : "simple")),
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
