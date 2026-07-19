"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Mode = "supervised" | "unsupervised" | "off";

type ModeContextType = {
  mode: Mode;
  setMode: (m: Mode) => void;
};

const ModeContext = createContext<ModeContextType>({
  mode: "supervised",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("supervised");
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}
