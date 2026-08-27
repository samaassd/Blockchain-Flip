import { Platform } from "react-native";
import { BrowserProvider, JsonRpcProvider, formatEther, Contract } from "ethers";
import { NETWORKS } from "@/src/wallet/appkit";

export type WalletState = {
  address: string;
  chainId: number;
  chainName: string;
  walletName: string;
  balanceNative: string;   // formatted native token
  balanceSymbol: string;
  balanceUsd: number | null;
  isSupportedChain: boolean;
};

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_KEY || "";
const alc = (sub: string) => (ALCHEMY_KEY ? `https://${sub}.g.alchemy.com/v2/${ALCHEMY_KEY}` : "");

// Read-only providers for balance queries per chain
export function readProviderFor(chainId: number): JsonRpcProvider | null {
  const net = NETWORKS.find((n) => n.id === chainId);
  if (!net) return null;
  const url = net.rpcUrls.default.http[0];
  return new JsonRpcProvider(url, { chainId, name: net.name });
}

export function chainInfo(chainId: number) {
  return NETWORKS.find((n) => n.id === chainId) || null;
}

// -------- Web: injected wallet (window.ethereum) --------
export function hasInjectedWallet(): boolean {
  if (Platform.OS !== "web") return false;
  // @ts-ignore
  return typeof window !== "undefined" && !!window.ethereum;
}

export function detectInjectedName(): string {
  if (!hasInjectedWallet()) return "";
  // @ts-ignore
  const eth = window.ethereum;
  if (eth.isMetaMask) return "MetaMask";
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isTrust) return "Trust";
  return "Browser Wallet";
}

export async function connectInjected(): Promise<WalletState> {
  if (!hasInjectedWallet()) throw new Error("No browser wallet detected. Install MetaMask.");
  // @ts-ignore
  const eth = window.ethereum;
  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  const cidHex: string = await eth.request({ method: "eth_chainId" });
  const chainId = parseInt(cidHex, 16);
  const address = accounts[0];
  return await refreshWalletState(address, chainId, detectInjectedName(), eth);
}

// Cross-platform: fetch balance for an address+chain via RPC
export async function refreshWalletState(
  address: string,
  chainId: number,
  walletName: string,
  eip1193?: any
): Promise<WalletState> {
  const info = chainInfo(chainId);
  const isSupported = !!info;
  let balanceStr = "0";
  let symbol = info?.nativeCurrency?.symbol || "ETH";

  try {
    if (isSupported) {
      const provider = eip1193 ? new BrowserProvider(eip1193, { chainId, name: info!.name }) : readProviderFor(chainId);
      if (provider) {
        const wei = await provider.getBalance(address);
        balanceStr = formatEther(wei);
      }
    }
  } catch (e) {
    // ignore — show 0
  }

  const bal = parseFloat(balanceStr) || 0;
  const usd = isSupported ? bal * nativeUsd(chainId) : null;

  return {
    address,
    chainId,
    chainName: info?.name || `Chain ${chainId}`,
    walletName: walletName || "Wallet",
    balanceNative: bal.toFixed(4),
    balanceSymbol: symbol,
    balanceUsd: usd,
    isSupportedChain: isSupported,
  };
}

// Rough native-token USD prices (used only for a headline balance).
function nativeUsd(chainId: number): number {
  const map: Record<number, number> = {
    1: 3500,     // ETH
    137: 0.55,   // POL
    56: 620,     // BNB
    42161: 3500, // ETH
    8453: 3500,  // ETH
    480: 3500,   // World Chain ETH
    360: 3500,   // Shape ETH
  };
  return map[chainId] || 0;
}

// -------- Injected wallet listeners (web) --------
export function subscribeInjected(cb: (state: Partial<WalletState> | null) => void): () => void {
  if (!hasInjectedWallet()) return () => {};
  // @ts-ignore
  const eth = window.ethereum;
  const onAccounts = async (accs: string[]) => {
    if (!accs || accs.length === 0) return cb(null);
    try {
      const cidHex: string = await eth.request({ method: "eth_chainId" });
      const chainId = parseInt(cidHex, 16);
      const state = await refreshWalletState(accs[0], chainId, detectInjectedName(), eth);
      cb(state);
    } catch { cb(null); }
  };
  const onChain = async (cidHex: string) => {
    try {
      const accs: string[] = await eth.request({ method: "eth_accounts" });
      if (!accs?.length) return cb(null);
      const chainId = parseInt(cidHex, 16);
      const state = await refreshWalletState(accs[0], chainId, detectInjectedName(), eth);
      cb(state);
    } catch { cb(null); }
  };
  eth.on?.("accountsChanged", onAccounts);
  eth.on?.("chainChanged", onChain);
  return () => {
    eth.removeListener?.("accountsChanged", onAccounts);
    eth.removeListener?.("chainChanged", onChain);
  };
}

// Try to switch injected wallet chain (web)
export async function switchInjectedChain(chainId: number): Promise<void> {
  if (!hasInjectedWallet()) throw new Error("No browser wallet");
  // @ts-ignore
  const eth = window.ethereum;
  const info = chainInfo(chainId);
  if (!info) throw new Error("Unsupported chain");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + chainId.toString(16) }],
    });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x" + chainId.toString(16),
          chainName: info.name,
          nativeCurrency: info.nativeCurrency,
          rpcUrls: info.rpcUrls.default.http,
          blockExplorerUrls: [info.blockExplorers.default.url],
        }],
      });
    } else {
      throw e;
    }
  }
}
