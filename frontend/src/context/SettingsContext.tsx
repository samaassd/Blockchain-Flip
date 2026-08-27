import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type ExecutionMode = "SIMULATED" | "ONCHAIN";
export type AutoRefresh = 10 | 20 | 45 | 0; // 0 = off

type Prefs = {
  executionMode: ExecutionMode;
  autoRefreshSec: AutoRefresh;
};

const DEFAULTS: Prefs = {
  executionMode: "SIMULATED",
  autoRefreshSec: 20,
};

const KEY = "arbscout_prefs";

type SettingsContextValue = Prefs & {
  setExecutionMode: (m: ExecutionMode) => Promise<void>;
  setAutoRefreshSec: (s: AutoRefresh) => Promise<void>;
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

  return (
    <SettingsContext.Provider value={{ ...prefs, setExecutionMode, setAutoRefreshSec, ready }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
