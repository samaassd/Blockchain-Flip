import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import {
  ROUTERS, ROUTER_ABI, WRAPPED_NATIVE, USDC,
  tokenAddressFor, explorerTx,
} from "@/src/wallet/contracts";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export type SwapResult = { hash: string; explorer: string };

/**
 * Prepare and send a real on-chain swap using Uniswap V2-style router.
 * User signs both approval (if needed) and swap in their wallet.
 * amountUsd is converted to native/token amount using base_price from the opportunity.
 */
export async function executeOnChainSwap(params: {
  eip1193: Eip1193;
  userAddress: string;
  chainId: number;
  tokenId: string;
  amountUsd: number;
  basePriceUsd: number;
}): Promise<SwapResult> {
  const { eip1193, userAddress, chainId, tokenId, amountUsd, basePriceUsd } = params;

  const router = ROUTERS[chainId];
  if (!router) throw new Error(`Chain ${chainId} not supported`);

  const wnative = WRAPPED_NATIVE[chainId];
  const tokenAddr = tokenAddressFor(tokenId, chainId);
  if (!tokenAddr) throw new Error("Token not deployed on this chain");

  const provider = new BrowserProvider(eip1193 as any);
  const signer = await provider.getSigner(userAddress);
  const routerC = new Contract(router.address, ROUTER_ABI, signer);

  // If the arb token IS the chain's native coin (e.g. ETH, POL), a native→native
  // swap is meaningless (just wrapping). Instead we realize the arbitrage against
  // USDC: swap native → USDC. basePriceUsd is the native coin's USD price here.
  const isNative = tokenAddr === "NATIVE";

  // Convert USD amount into native token amount.
  // For native-coin opportunities the token's own price IS the native price;
  // otherwise use the chain's indicative native price.
  const nativePriceUsd = isNative ? basePriceUsd : await getNativePriceUsd(chainId);
  if (nativePriceUsd <= 0) throw new Error("Could not resolve native price");
  const nativeIn = amountUsd / nativePriceUsd;
  const amountIn = parseUnits(nativeIn.toFixed(6), 18);

  const outToken = isNative ? USDC[chainId] : tokenAddr;
  if (!outToken) throw new Error("No USDC pair available on this chain");

  const path = [wnative, outToken];
  const quoted = (await routerC.getAmountsOut(amountIn, path)) as bigint[];
  const quotedOut = quoted[quoted.length - 1];
  const amountOutMin = (quotedOut * 9950n) / 10000n; // 0.5% slippage
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const tx = await routerC.swapExactETHForTokens(
    amountOutMin, path, userAddress, deadline, { value: amountIn }
  );
  return { hash: tx.hash, explorer: explorerTx(chainId, tx.hash) };
}

async function getNativePriceUsd(chainId: number): Promise<number> {
  const map: Record<number, number> = { 1: 3500, 137: 0.55, 56: 620, 42161: 3500, 8453: 3500 };
  return map[chainId] || 1;
}

export { formatUnits };
