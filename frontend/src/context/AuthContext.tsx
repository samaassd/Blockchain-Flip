import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY, PublicUser } from "@/src/api/client";

WebBrowser.maybeCompleteAuthSession();

// Guard: the same session_id can surface from multiple sources (result.url,
// url listener, getInitialURL, re-mounts). Only exchange each one once.
const processedSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function cleanWebUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const u = new URL(window.location.href);
  u.searchParams.delete("session_id");
  let hash = u.hash || "";
  if (hash.includes("session_id")) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    params.delete("session_id");
    const rest = params.toString();
    hash = rest ? `#${rest}` : "";
  }
  window.history.replaceState(window.history.state, "", u.pathname + u.search + hash);
}

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<boolean>;
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

  // Exchange a one-time session_id (from the Google redirect) for a 7-day session_token
  const exchangeSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (processedSessionIds.has(sessionId)) return false;
    processedSessionIds.add(sessionId);
    try {
      const res = await api.post<{ session_token: string; user: PublicUser }>("/auth/session", {
        session_id: sessionId,
      });
      await storage.secureSet(TOKEN_KEY, res.session_token);
      setUser(res.user);
      cleanWebUrl();
      return true;
    } catch (e) {
      console.warn("Google session exchange failed", e);
      return false;
    }
  }, []);

  const exchangeRef = useRef(exchangeSession);
  exchangeRef.current = exchangeSession;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      // 1) Process a session_id from the auth redirect FIRST (before existing token)
      let sessionId: string | null = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        sessionId = extractSessionId(window.location.hash) || extractSessionId(window.location.search);
      } else {
        sessionId = extractSessionId(await Linking.getInitialURL());
        sub = Linking.addEventListener("url", (e) => {
          const sid = extractSessionId(e.url);
          if (sid) exchangeRef.current(sid);
        });
      }
      if (sessionId && (await exchangeRef.current(sessionId))) {
        setLoading(false);
        return;
      }
      // 2) Otherwise check an existing stored token
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (token) await refreshUser();
      setLoading(false);
    })();
    return () => { sub?.remove(); };
  }, [refreshUser]);

  const loginWithGoogle = async (): Promise<boolean> => {
    const redirectUrl = Platform.OS === "web"
      ? window.location.origin + "/"
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return false; // page navigates away; exchange happens on return
    }

    // Mobile: register the listener BEFORE opening — on Android the browser can
    // return "dismiss" with no URL even when the deep link was delivered.
    let capturedUrl: string | null = null;
    const sub = Linking.addEventListener("url", (e) => { capturedUrl = e.url; });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      const url = (result as any)?.url || capturedUrl || (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) return await exchangeSession(sid);
      return false;
    } finally {
      sub.remove();
    }
  };

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
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
