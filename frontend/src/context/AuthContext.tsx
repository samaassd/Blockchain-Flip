import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY, PublicUser } from "@/src/api/client";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.get<PublicUser>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
      await storage.secureRemove(TOKEN_KEY);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (token) await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: PublicUser }>("/auth/login", { email, password });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, displayName?: string) => {
    const res = await api.post<{ access_token: string; user: PublicUser }>("/auth/register", {
      email,
      password,
      display_name: displayName,
    });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
