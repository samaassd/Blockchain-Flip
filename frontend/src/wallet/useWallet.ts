import { useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import {
  useAccount, useAppKit, useWalletInfo, useProvider,
} from "@reown/appkit-react-native";
import {
  WalletState, connectInjected, hasInjectedWallet, refreshWalletState,
  subscribeInjected, switchInjectedChain, detectInjectedName,
} from "@/src/wallet/injected";
import { NETWORKS } from "@/src/wallet/appkit";

/**
 * Cross-platform wallet hook.
 *  - Web: uses window.ethereum (MetaMask / Coinbase / Rabby / Trust extensions).
 *  - Native: uses Reown AppKit (WalletConnect v2) — real deep-linking requires a native build.
 *
 * Returns a normalized WalletState + connect/disconnect/switch actions.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>("");
  const providerRef = useRef<any>(null);

  // Reown hooks (native + as a fallback on web when configured)
  let openReown: any, disconnectReown: any, switchNetworkReown: any;
  let rAddress = "", rChainId: any = 0, rConnected = false, rWalletInfo: any = null, rProvider: any = null;
  try {
    const k = useAppKit();
    openReown = k?.open;
    disconnectReown = k?.disconnect;
    switchNetworkReown = k?.switchNetwork;
    const acc = useAccount() || ({} as any);
    rAddress = acc.address || "";
    rChainId = Number(acc.chainId || 0);
    rConnected = !!acc.isConnected && rChainId > 0;
    const w = useWalletInfo?.() as any;
    rWalletInfo = w?.walletInfo || null;
    const p = useProvider?.() as any;
    rProvider = p?.walletProvider || p?.provider || null;
  } catch {}

  // Refresh from Reown state (native path)
  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      if (!rConnected || !rAddress || !rChainId) { setState(null); return; }
      try {
        const s = await refreshWalletState(rAddress, rChainId, rWalletInfo?.name || "Wallet", rProvider);
        providerRef.current = rProvider;
        setState(s);
      } catch (e: any) {
        setError(e?.message || "Failed to load wallet state");
      }
    })();
  }, [rConnected, rAddress, rChainId, rWalletInfo?.name, rProvider]);

  // Subscribe to injected wallet events (web)
  useEffect(() => {
    if (Platform.OS !== "web" || !hasInjectedWallet()) return;
    const unsub = subscribeInjected((s) => {
      if (!s) { setState(null); return; }
      setState(s as WalletState);
    });
    // Attempt silent restore if the user already granted access
    (async () => {
      try {
        // @ts-ignore
        const eth = window.ethereum;
        const accs: string[] = await eth.request({ method: "eth_accounts" });
        if (accs?.length) {
          const cidHex: string = await eth.request({ method: "eth_chainId" });
          const chainId = parseInt(cidHex, 16);
          const s = await refreshWalletState(accs[0], chainId, detectInjectedName(), eth);
          providerRef.current = eth;
          setState(s);
        }
      } catch {}
    })();
    return unsub;
  }, []);

  const connect = useCallback(async () => {
    setError(""); setConnecting(true);
    try {
      if (Platform.OS === "web") {
        if (hasInjectedWallet()) {
          const s = await connectInjected();
          // @ts-ignore
          providerRef.current = window.ethereum;
          setState(s);
        } else {
          // Fallback: open Reown modal (WalletConnect QR) on web, and surface a hint
          setError("MetaMask / Rabby / Coinbase browser extension not detected — or scan the WalletConnect QR");
          if (openReown) await openReown();
        }
      } else {
        if (openReown) await openReown();
        else setError("Wallet SDK not initialized");
      }
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Connection failed";
      if (e?.code === 4001) setError("Connection rejected");
      else setError(msg);
    } finally { setConnecting(false); }
  }, [openReown]);

  const disconnect = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        setState(null);
        providerRef.current = null;
      } else if (disconnectReown) {
        await disconnectReown();
      }
    } catch {}
  }, [disconnectReown]);

  const switchChain = useCallback(async (chainId: number) => {
    setError("");
    try {
      if (Platform.OS === "web") {
        await switchInjectedChain(chainId);
      } else if (switchNetworkReown) {
        await switchNetworkReown(`eip155:${chainId}`);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to switch chain");
    }
  }, [switchNetworkReown]);

  const refresh = useCallback(async () => {
    if (!state?.address) return;
    try {
      const s = await refreshWalletState(state.address, state.chainId, state.walletName, providerRef.current);
      setState(s);
    } catch {}
  }, [state?.address, state?.chainId, state?.walletName]);

  const isConnected = !!state && state.chainId > 0 && !!state.address;
  const provider = providerRef.current;

  return {
    state, isConnected, connecting, error,
    connect, disconnect, switchChain, refresh, provider,
    supportedChains: NETWORKS,
  };
}
