import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type ExecutionMode = "SIMULATED" | "ONCHAIN";
export type AutoRefresh = 10 | 20 | 45 | 0; // 0 = off
export type AutoMinNet = 5 | 10 | 25 | 50; // min net profit $ to auto-execute
export type AutoTradeSize = 500 | 1000 | 2500; // simulated trade size $

type Prefs = {
  executionMode: ExecutionMode;
  autoRefreshSec: AutoRefresh;
  autoMode: boolean;
  autoMinNet: AutoMinNet;
  autoTradeSize: AutoTradeSize;
};

const DEFAULTS: Prefs = {
  executionMode: "SIMULATED",
  autoRefreshSec: 20,
  autoMode: false,
  autoMinNet: 10,
  autoTradeSize: 1000,
};

const KEY = "arbscout_prefs";

type SettingsContextValue = Prefs & {
  setExecutionMode: (m: ExecutionMode) => Promise<void>;
  setAutoRefreshSec: (s: AutoRefresh) => Promise<void>;
  setAutoMode: (on: boolean) => Promise<void>;
  setAutoMinNet: (n: AutoMinNet) => Promise<void>;
  setAutoTradeSize: (n: AutoTradeSize) => Promise<void>;
  ready: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "");
      if (saved) {
        try {
          const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
          setPrefs({ ...DEFAULTS, ...parsed });
        } catch {}
      }
      setReady(true);
    })();
  }, []);

  const save = useCallback(async (next: Prefs) => {
    setPrefs(next);
    await storage.setItem(KEY, JSON.stringify(next));
  }, []);

  const setExecutionMode = useCallback(async (m: ExecutionMode) => {
    await save({ ...prefs, executionMode: m });
  }, [prefs, save]);

  const setAutoRefreshSec = useCallback(async (s: AutoRefresh) => {
    await save({ ...prefs, autoRefreshSec: s });
  }, [prefs, save]);

  const setAutoMode = useCallback(async (on: boolean) => {
    await save({ ...prefs, autoMode: on });
  }, [prefs, save]);

  const setAutoMinNet = useCallback(async (n: AutoMinNet) => {
    await save({ ...prefs, autoMinNet: n });
  }, [prefs, save]);

  const setAutoTradeSize = useCallback(async (n: AutoTradeSize) => {
    await save({ ...prefs, autoTradeSize: n });
  }, [prefs, save]);

  return (
    <SettingsContext.Provider value={{ ...prefs, setExecutionMode, setAutoRefreshSec, setAutoMode, setAutoMinNet, setAutoTradeSize, ready }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
