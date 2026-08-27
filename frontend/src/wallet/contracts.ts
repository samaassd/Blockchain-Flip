import { CHAINS } from "@/src/wallet/appkit";

// Uniswap V2-style routers per chain (verified deployments; where a V2 router isn't
// available, we mark the chain unsupported for direct swaps).
export const ROUTERS: Record<number, { name: string; address: string }> = {
  1:     { name: "Uniswap V2 Router",     address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
  137:   { name: "QuickSwap V2 Router",   address: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff" },
  56:    { name: "PancakeSwap V2 Router", address: "0x10ED43C718714eb63d5aA57B78B54704E256024E" },
  42161: { name: "SushiSwap Router (Arb)", address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506" },
  8453:  { name: "BaseSwap Router",       address: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86" },
  // World Chain: primary DEX is Uniswap V3 — V2 router not deployed. Wallet still connects.
  // Shape: no mature V2 router — wallet connects; swaps unavailable.
};

// Wrapped native per chain
export const WRAPPED_NATIVE: Record<number, string> = {
  1:     "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH (mainnet)
  137:   "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
  56:    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH (Arbitrum)
  8453:  "0x4200000000000000000000000000000000000006", // WETH (Base)
};

// Token addresses per chain (subset — matches our CoinGecko token ids)
export const TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  chainlink: {
    1: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    137: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    56: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    42161: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
    8453: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
  },
  uniswap: {
    1: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    137: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
    42161: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
    8453: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83",
  },
  aave: {
    1: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    137: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    42161: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
  },
  sushi: {
    1: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    137: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a",
    42161: "0xd4d42F0b6DEF4CE0383636770eF773390d85c61A",
  },
  "curve-dao-token": {
    1: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    137: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
    42161: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
  },
  // ARB is an ERC-20 token (not the gas coin) on both mainnet and Arbitrum One
  arbitrum: {
    1: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
    42161: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  },
};

// USDC per chain — used as the counter-asset when the arb token is the chain's native coin
export const USDC: Record<number, string> = {
  1:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  56:    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Native token → chainId map
export const NATIVE_TOKENS: Record<string, number> = {
  ethereum: 1,
  "polygon-ecosystem-token": 137,
};

export function tokenAddressFor(tokenId: string, chainId: number): string | null {
  if (TOKEN_ADDRESSES[tokenId]?.[chainId]) return TOKEN_ADDRESSES[tokenId][chainId];
  if (NATIVE_TOKENS[tokenId] === chainId) return "NATIVE";
  return null;
}

export function explorerTx(chainId: number, hash: string): string {
  const chain = Object.values(CHAINS).find((c) => c.chainId === chainId);
  return `${chain?.explorerUrl || "https://polygonscan.com"}/tx/${hash}`;
}

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
];

export const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn,address[] calldata path) view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin,address[] calldata path,address to,uint deadline) payable returns (uint[] memory amounts)",
];
