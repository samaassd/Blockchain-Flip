import "@walletconnect/react-native-compat";
import "react-native-get-random-values";

import { createAppKit, AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";

export const REOWN_PROJECT_ID = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID || "";
const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_KEY || "";
const alc = (sub: string) => (ALCHEMY_KEY ? `https://${sub}.g.alchemy.com/v2/${ALCHEMY_KEY}` : "");

const metadata = {
  name: "ArbScout",
  description: "Live DEX arbitrage — real wallet execution",
  url: "https://blockchain-flip.preview.emergentagent.com",
  icons: ["https://blockchain-flip.preview.emergentagent.com/icon.png"],
  redirect: {
    native: "frontend://",
    universal: "https://blockchain-flip.preview.emergentagent.com",
  },
};

function evmNetwork(cfg: {
  id: number; name: string; currency: string; currencyName?: string;
  rpc: string; explorer: string; explorerName?: string;
}) {
  return {
    id: cfg.id,
    name: cfg.name,
    nativeCurrency: { name: cfg.currencyName || cfg.currency, symbol: cfg.currency, decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: cfg.explorerName || "Explorer", url: cfg.explorer } },
    chainNamespace: "eip155" as const,
    caipNetworkId: `eip155:${cfg.id}` as const,
    testnet: false,
  };
}

// EVM chains — Ethereum, Polygon, BNB, Arbitrum, Base, World Chain, Shape.
// Uses Alchemy RPCs where supported; BNB uses its public data-seed.
export const NETWORKS = [
  evmNetwork({ id: 1,     name: "Ethereum",    currency: "ETH", currencyName: "Ether",   rpc: alc("eth-mainnet")       || "https://cloudflare-eth.com",           explorer: "https://etherscan.io",   explorerName: "Etherscan" }),
  evmNetwork({ id: 137,   name: "Polygon",     currency: "POL", currencyName: "Polygon", rpc: alc("polygon-mainnet")   || "https://polygon-rpc.com",               explorer: "https://polygonscan.com", explorerName: "PolygonScan" }),
  evmNetwork({ id: 56,    name: "BNB Chain",   currency: "BNB", currencyName: "BNB",     rpc: "https://bsc-dataseed.binance.org",                                explorer: "https://bscscan.com",     explorerName: "BscScan" }),
  evmNetwork({ id: 42161, name: "Arbitrum",    currency: "ETH", currencyName: "Ether",   rpc: alc("arb-mainnet")       || "https://arb1.arbitrum.io/rpc",         explorer: "https://arbiscan.io",     explorerName: "Arbiscan" }),
  evmNetwork({ id: 8453,  name: "Base",        currency: "ETH", currencyName: "Ether",   rpc: alc("base-mainnet")      || "https://mainnet.base.org",             explorer: "https://basescan.org",    explorerName: "BaseScan" }),
  evmNetwork({ id: 480,   name: "World Chain", currency: "ETH", currencyName: "Ether",   rpc: alc("worldchain-mainnet")|| "https://worldchain-mainnet.g.alchemy.com/public", explorer: "https://worldscan.org", explorerName: "WorldScan" }),
  evmNetwork({ id: 360,   name: "Shape",       currency: "ETH", currencyName: "Ether",   rpc: alc("shape-mainnet")     || "https://mainnet.shape.network",         explorer: "https://shapescan.xyz",   explorerName: "ShapeScan" }),
];

export const CHAINS = {
  ethereum:  { chainId: 1,     name: "Ethereum",    currency: "ETH", explorerUrl: "https://etherscan.io" },
  polygon:   { chainId: 137,   name: "Polygon",     currency: "POL", explorerUrl: "https://polygonscan.com" },
  bnb:       { chainId: 56,    name: "BNB Chain",   currency: "BNB", explorerUrl: "https://bscscan.com" },
  arbitrum:  { chainId: 42161, name: "Arbitrum",    currency: "ETH", explorerUrl: "https://arbiscan.io" },
  base:      { chainId: 8453,  name: "Base",        currency: "ETH", explorerUrl: "https://basescan.org" },
  worldchain:{ chainId: 480,   name: "World Chain", currency: "ETH", explorerUrl: "https://worldscan.org" },
  shape:     { chainId: 360,   name: "Shape",       currency: "ETH", explorerUrl: "https://shapescan.xyz" },
} as const;

export const CHAIN_LIST = Object.values(CHAINS);

let appKitInstance: any = null;
export function initAppKit() {
  if (appKitInstance) return appKitInstance;
  if (!REOWN_PROJECT_ID) {
    console.warn("Missing EXPO_PUBLIC_REOWN_PROJECT_ID — wallet features disabled");
    return null;
  }
  try {
    appKitInstance = createAppKit({
      projectId: REOWN_PROJECT_ID,
      adapters: [new EthersAdapter()],
      networks: NETWORKS as any,
      defaultNetwork: NETWORKS[0] as any,
      metadata,
      themeMode: "dark",
    });
    return appKitInstance;
  } catch (e) {
    console.warn("AppKit init failed", e);
    return null;
  }
}

export function getAppKit() { return appKitInstance; }

export { AppKit, AppKitProvider };
