import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "arbscout_token";

export type ApiError = { status: number; message: string };

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }
  if (!res.ok) {
    const message = body?.detail || `Request failed (${res.status})`;
    throw { status: res.status, message } as ApiError;
  }
  return body as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p, { method: "GET" }),
  post: <T = any>(p: string, body?: any) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};

export type PublicUser = {
  id: string;
  email: string;
  display_name?: string;
  balance_usd: number;
  total_pnl: number;
};

export type Opportunity = {
  id: string;
  token_id: string;
  token_symbol: string;
  token_name: string;
  token_image?: string;
  pair: string;
  base_price: number;
  buy_dex: { id: string; name: string; chain: string; fee: number };
  sell_dex: { id: string; name: string; chain: string; fee: number };
  buy_price: number;
  sell_price: number;
  spread_pct: number;
  estimated_gas_usd: number;
  liquidity_usd: number;
  confidence: number;
  expires_in_sec: number;
  route?: { step: number; action: string; venue: string; chain: string; price?: number }[];
  slippage_pct?: number;
};

export type Trade = {
  id: string;
  pair: string;
  token_symbol: string;
  token_image?: string;
  buy_dex: string;
  sell_dex: string;
  amount_usd: number;
  spread_pct: number;
  gross_profit: number;
  gas_fee: number;
  net_profit: number;
  status: string;
  executed_at: string;
  mode: string;
  tx_hash?: string;
  chain_id?: number;
  wallet_address?: string;
  explorer_url?: string;
};
