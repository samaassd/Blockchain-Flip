import { Linking, Platform } from "react-native";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import bs58 from "bs58";
import { storage } from "@/src/utils/storage";

/**
 * Phantom deep-link connector for Solana.
 * Ref: https://docs.phantom.app/phantom-deeplinks/provider-methods/connect
 *
 * Flow:
 *  1. Generate ephemeral X25519 keypair (dapp)
 *  2. Open phantom.app/ul/v1/connect with our public key + redirect
 *  3. On redirect, Phantom returns their pubkey + nonce + encrypted payload
 *  4. Decrypt payload to obtain user's Solana public key and a session
 *
 * In preview browsers, deep-linking to Phantom app is limited — the connect
 * URL still opens Phantom Web; end-to-end callback requires a native/dev build.
 */

const REDIRECT_BASE = "https://blockchain-flip.preview.emergentagent.com";
const KEY_DAPP_KP = "phantom_dapp_kp_v1";
const KEY_SOL_SESSION = "phantom_session_v1";

export type PhantomSession = {
  publicKey: string;   // user's Solana pubkey (base58)
  session: string;     // phantom session token
  phantomEncryptionPublicKey: string; // base58
};

type DappKP = { publicKey: string; secretKey: string }; // base58

async function loadOrCreateDappKP(): Promise<DappKP> {
  const raw = await storage.getItem<string>(KEY_DAPP_KP, "");
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed?.publicKey && parsed?.secretKey) return parsed as DappKP;
    } catch {}
  }
  const kp = nacl.box.keyPair();
  const dapp: DappKP = {
    publicKey: bs58.encode(kp.publicKey),
    secretKey: bs58.encode(kp.secretKey),
  };
  await storage.setItem(KEY_DAPP_KP, JSON.stringify(dapp));
  return dapp;
}

export async function getStoredPhantomSession(): Promise<PhantomSession | null> {
  const raw = await storage.getItem<string>(KEY_SOL_SESSION, "");
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : (raw as any); } catch { return null; }
}

export async function clearPhantomSession(): Promise<void> {
  await storage.removeItem(KEY_SOL_SESSION);
}

export async function buildConnectUrl(): Promise<string> {
  const dapp = await loadOrCreateDappKP();
  const params = new URLSearchParams({
    dapp_encryption_public_key: dapp.publicKey,
    cluster: "mainnet-beta",
    app_url: REDIRECT_BASE,
    redirect_link: `${REDIRECT_BASE}/phantom-callback`,
  });
  return `https://phantom.app/ul/v1/connect?${params.toString()}`;
}

export async function openPhantomConnect(): Promise<void> {
  const url = await buildConnectUrl();
  await Linking.openURL(url);
}

/**
 * Parse a phantom redirect URL (called from a deep-link listener or the
 * "paste your Phantom response" fallback UI) and unpack the session.
 */
export async function ingestPhantomResponse(rawUrl: string): Promise<PhantomSession> {
  const url = new URL(rawUrl);
  const phantomPk = url.searchParams.get("phantom_encryption_public_key");
  const nonce = url.searchParams.get("nonce");
  const data = url.searchParams.get("data");
  const errorCode = url.searchParams.get("errorCode");
  if (errorCode) throw new Error(url.searchParams.get("errorMessage") || `Phantom error ${errorCode}`);
  if (!phantomPk || !nonce || !data) throw new Error("Malformed Phantom response");

  const dapp = await loadOrCreateDappKP();
  const shared = nacl.box.before(
    bs58.decode(phantomPk),
    bs58.decode(dapp.secretKey),
  );
  const decrypted = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), shared);
  if (!decrypted) throw new Error("Failed to decrypt Phantom response");
  const payload = JSON.parse(naclUtil.encodeUTF8(decrypted)) as {
    public_key: string;
    session: string;
  };
  const session: PhantomSession = {
    publicKey: payload.public_key,
    session: payload.session,
    phantomEncryptionPublicKey: phantomPk,
  };
  await storage.setItem(KEY_SOL_SESSION, JSON.stringify(session));
  return session;
}

/**
 * Build a signAndSendTransaction deep-link for a pre-serialized Solana
 * transaction (base58-encoded serialized message).
 */
export async function buildSignAndSendUrl(base58Tx: string): Promise<string> {
  const dapp = await loadOrCreateDappKP();
  const session = await getStoredPhantomSession();
  if (!session) throw new Error("Phantom not connected");
  const shared = nacl.box.before(
    bs58.decode(session.phantomEncryptionPublicKey),
    bs58.decode(dapp.secretKey),
  );
  const nonce = nacl.randomBytes(24);
  const payload = naclUtil.decodeUTF8(JSON.stringify({
    transaction: base58Tx,
    session: session.session,
  }));
  const encrypted = nacl.box.after(payload, nonce, shared);

  const params = new URLSearchParams({
    dapp_encryption_public_key: dapp.publicKey,
    nonce: bs58.encode(nonce),
    payload: bs58.encode(encrypted),
    redirect_link: `${REDIRECT_BASE}/phantom-callback`,
  });
  return `https://phantom.app/ul/v1/signAndSendTransaction?${params.toString()}`;
}

export function isPhantomInjected(): boolean {
  if (Platform.OS !== "web") return false;
  // @ts-ignore
  return typeof window !== "undefined" && !!(window.solana && window.solana.isPhantom);
}

// Connect via injected Phantom (browser extension) — works in web preview.
export async function connectPhantomInjected(): Promise<PhantomSession> {
  if (!isPhantomInjected()) throw new Error("Phantom extension not detected. Install from phantom.app or use the deep-link on mobile.");
  // @ts-ignore
  const provider = window.solana;
  const resp = await provider.connect();
  const session: PhantomSession = {
    publicKey: resp.publicKey.toString(),
    session: "injected",
    phantomEncryptionPublicKey: "",
  };
  await storage.setItem(KEY_SOL_SESSION, JSON.stringify(session));
  return session;
}
