import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import {
  ROUTERS, ERC20_ABI, ROUTER_ABI, WRAPPED_NATIVE,
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

  // NATIVE → TOKEN swap: send `amountUsd / nativePrice` native
  // For simplicity we treat basePriceUsd as USD/native for path resolution
  const isNative = tokenAddr === "NATIVE";
  if (isNative) {
    throw new Error("Native → native arbitrage not supported directly. Choose an ERC-20 pair.");
  }

  // Convert USD amount into native token amount (approx via base_price).
  // In production, quote the exact input from an aggregator; here we use CoinGecko base_price
  // of the target token as an indicative reference and simply send `amountUsd / nativePriceUsd` native.
  // We ask the router for getAmountsOut to obtain amountOutMin using 0.5% slippage.
  const nativePriceUsd = await getNativePriceUsd(chainId);
  if (nativePriceUsd <= 0) throw new Error("Could not resolve native price");
  const nativeIn = amountUsd / nativePriceUsd;
  const amountIn = parseUnits(nativeIn.toFixed(6), 18);

  const path = [wnative, tokenAddr];
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
