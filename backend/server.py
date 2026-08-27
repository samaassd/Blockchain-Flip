import os
import uuid
import random
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Annotated

import bcrypt
import jwt
import httpx
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from jwt.exceptions import InvalidTokenError

from chain_meta import (
    build_rpcs, CHAIN_NAMES, EVM_CHAINS, SOLANA_CHAIN,
    DEX_TO_CHAIN, SWAP_EVENT_TOPIC_V2, SOLANA_MINTS,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_HOURS = int(os.environ.get("ACCESS_TOKEN_HOURS", "24"))
COINGECKO_BASE = os.environ.get("COINGECKO_BASE", "https://api.coingecko.com/api/v3")
ONEINCH_API_KEY = os.environ.get("ONEINCH_API_KEY", "")
ALCHEMY_KEY = os.environ.get("ALCHEMY_KEY", "")
RPC_MAP = build_rpcs(ALCHEMY_KEY)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ArbScout API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("arbscout")

# ---------------- DEX universe (public DEXs) ----------------
DEXES = [
    {"id": "uniswap", "name": "Uniswap", "chain": "Ethereum", "chain_id": 1, "fee": 0.003},
    {"id": "sushiswap", "name": "SushiSwap", "chain": "Ethereum", "chain_id": 1, "fee": 0.003},
    {"id": "pancakeswap", "name": "PancakeSwap", "chain": "BNB Chain", "chain_id": 56, "fee": 0.0025},
    {"id": "curve", "name": "Curve", "chain": "Ethereum", "chain_id": 1, "fee": 0.0004},
    {"id": "balancer", "name": "Balancer", "chain": "Ethereum", "chain_id": 1, "fee": 0.002},
    {"id": "quickswap", "name": "QuickSwap", "chain": "Polygon", "chain_id": 137, "fee": 0.003},
    {"id": "aerodrome", "name": "Aerodrome", "chain": "Base", "chain_id": 8453, "fee": 0.0025},
    {"id": "raydium", "name": "Raydium", "chain": "Solana", "chain_id": 101, "fee": 0.0025},
    {"id": "orca", "name": "Orca", "chain": "Solana", "chain_id": 101, "fee": 0.003},
]

# Tokens to scan (CoinGecko IDs)
TOKENS = [
    {"id": "bitcoin", "symbol": "BTC"},
    {"id": "ethereum", "symbol": "ETH"},
    {"id": "solana", "symbol": "SOL"},
    {"id": "chainlink", "symbol": "LINK"},
    {"id": "uniswap", "symbol": "UNI"},
    {"id": "aave", "symbol": "AAVE"},
    {"id": "polygon-ecosystem-token", "symbol": "MATIC"},
    {"id": "avalanche-2", "symbol": "AVAX"},
    {"id": "arbitrum", "symbol": "ARB"},
    {"id": "optimism", "symbol": "OP"},
    {"id": "curve-dao-token", "symbol": "CRV"},
    {"id": "sushi", "symbol": "SUSHI"},
]

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    display_name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "PublicUser"

class PublicUser(BaseModel):
    id: str
    email: EmailStr
    display_name: Optional[str] = None
    balance_usd: float = 10000.0
    total_pnl: float = 0.0

class ExecuteTradeIn(BaseModel):
    opportunity_id: str
    amount_usd: float = Field(gt=0)

class TradeOut(BaseModel):
    id: str
    pair: str
    buy_dex: str
    sell_dex: str
    amount_usd: float
    spread_pct: float
    gross_profit: float
    gas_fee: float
    net_profit: float
    status: str
    executed_at: str
    mode: str
    tx_hash: Optional[str] = None
    chain_id: Optional[int] = None
    wallet_address: Optional[str] = None
    explorer_url: Optional[str] = None

TokenOut.model_rebuild()

# ---------------- Auth utilities ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(hours=ACCESS_TOKEN_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def user_public(doc: dict) -> PublicUser:
    return PublicUser(
        id=doc["id"],
        email=doc["email"],
        display_name=doc.get("display_name"),
        balance_usd=float(doc.get("balance_usd", 10000.0)),
        total_pnl=float(doc.get("total_pnl", 0.0)),
    )

async def current_user(creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]):
    err = HTTPException(status_code=401, detail="Invalid or expired token")
    if not creds or creds.scheme.lower() != "bearer":
        raise err
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub")
        if not uid:
            raise err
    except InvalidTokenError:
        raise err
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise err
    return user

# ---------------- Auth routes ----------------
@api.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": email,
        "password_hash": hash_password(body.password),
        "display_name": body.display_name or email.split("@")[0],
        "balance_usd": 10000.0,
        "total_pnl": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return TokenOut(access_token=create_access_token(uid), user=user_public(doc))

@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    return TokenOut(access_token=create_access_token(user["id"]), user=user_public(user))

@api.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return user_public(user)

# ---------------- Market data ----------------
# Cache with circuit breaker: on 429/failure, retain the last-known-good data indefinitely
# and back off before retrying.
_prices_cache = {"ts": 0.0, "data": {}, "last_error_ts": 0.0, "error_backoff": 0.0}
_SEED_PRICES = {
    "bitcoin": 68000.0, "ethereum": 3500.0, "solana": 165.0, "chainlink": 15.0,
    "uniswap": 9.5, "aave": 105.0, "polygon-ecosystem-token": 0.55,
    "avalanche-2": 32.0, "arbitrum": 0.85, "optimism": 1.7,
    "curve-dao-token": 0.45, "sushi": 0.85,
}

async def fetch_market_prices() -> dict:
    """Fetch prices from CoinGecko with a resilient cache and backoff on 429."""
    now = datetime.now(timezone.utc).timestamp()
    cache_ttl = 90  # seconds

    # Serve fresh cache
    if _prices_cache["data"] and (now - _prices_cache["ts"] < cache_ttl):
        return _prices_cache["data"]

    # Backoff: if we recently errored, keep serving cached data
    if _prices_cache["data"] and (now - _prices_cache["last_error_ts"] < _prices_cache["error_backoff"]):
        return _prices_cache["data"]

    ids = ",".join(t["id"] for t in TOKENS)
    url = f"{COINGECKO_BASE}/coins/markets"
    params = {"vs_currency": "usd", "ids": ids, "price_change_percentage": "24h"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.get(url, params=params)
            r.raise_for_status()
            arr = r.json()
        data = {row["id"]: row for row in arr}
        _prices_cache["data"] = data
        _prices_cache["ts"] = now
        _prices_cache["error_backoff"] = 0.0
        return data
    except Exception as e:
        logger.warning(f"CoinGecko fetch failed: {e}")
        _prices_cache["last_error_ts"] = now
        # exponential backoff up to 5 minutes
        _prices_cache["error_backoff"] = min(300, max(30, _prices_cache["error_backoff"] * 2 or 30))
        if _prices_cache["data"]:
            return _prices_cache["data"]
        # Bootstrap seed so app is usable when CoinGecko is down on first call
        seed = {}
        for tok in TOKENS:
            price = _SEED_PRICES.get(tok["id"], 1.0)
            seed[tok["id"]] = {
                "id": tok["id"], "symbol": tok["symbol"], "name": tok["symbol"],
                "current_price": price, "price_change_percentage_24h": 0.0,
                "market_cap": price * 1_000_000, "image": None,
            }
        _prices_cache["data"] = seed
        _prices_cache["ts"] = now - cache_ttl + 30  # allow retry in 30s
        return seed

def build_opportunities(prices: dict) -> list:
    """Generate arbitrage opportunities by simulating slight DEX-specific price variations
    on top of real CoinGecko market prices. Uses a deterministic seed rotated every 45s
    so opportunities feel 'live' but stable long enough to trade. When buy/sell DEXs are
    on different chains, the opportunity is flagged is_cross_chain=True and a bridge step
    is added to the route."""
    seed_bucket = int(datetime.now(timezone.utc).timestamp() // 45)
    rng = random.Random(seed_bucket)
    opps = []
    for tok in TOKENS:
        row = prices.get(tok["id"])
        if not row:
            continue
        base_price = float(row.get("current_price") or 0)
        if base_price <= 0:
            continue
        sample = rng.sample(DEXES, k=min(6, len(DEXES)))
        dex_prices = []
        for d in sample:
            dev = (rng.random() - 0.5) * 0.03  # +/- 1.5%
            dex_prices.append({"dex": d, "price": base_price * (1 + dev)})
        buy = min(dex_prices, key=lambda x: x["price"])
        sell = max(dex_prices, key=lambda x: x["price"])
        if sell["price"] <= buy["price"]:
            continue
        spread_pct = (sell["price"] - buy["price"]) / buy["price"] * 100.0
        if spread_pct < 0.15:
            continue
        chain = buy["dex"]["chain"]
        gas = {"Ethereum": 8.5, "BNB Chain": 0.35, "Polygon": 0.05, "Base": 0.10, "Arbitrum": 0.20, "Solana": 0.01}.get(chain, 1.0)
        is_cross_chain = buy["dex"]["chain_id"] != sell["dex"]["chain_id"]
        opp_id = f"{tok['id']}-{buy['dex']['id']}-{sell['dex']['id']}-{seed_bucket}"
        opps.append({
            "id": opp_id,
            "token_id": tok["id"],
            "token_symbol": tok["symbol"],
            "token_name": row.get("name", tok["symbol"]),
            "token_image": row.get("image"),
            "pair": f"{tok['symbol']}/USDC",
            "base_price": round(base_price, 6),
            "buy_dex": buy["dex"],
            "sell_dex": sell["dex"],
            "buy_price": round(buy["price"], 6),
            "sell_price": round(sell["price"], 6),
            "spread_pct": round(spread_pct, 3),
            "estimated_gas_usd": gas + (3.0 if is_cross_chain else 0.0),
            "liquidity_usd": rng.randint(50_000, 5_000_000),
            "confidence": round(min(0.95, 0.5 + spread_pct / 8), 2),
            "expires_in_sec": 45 - int(datetime.now(timezone.utc).timestamp() % 45),
            "is_cross_chain": is_cross_chain,
            "buy_chain_id": buy["dex"]["chain_id"],
            "sell_chain_id": sell["dex"]["chain_id"],
        })
    opps.sort(key=lambda x: x["spread_pct"], reverse=True)
    return opps

# ---------------- Scanner routes ----------------
@api.get("/market/overview")
async def market_overview(user=Depends(current_user)):
    prices = await fetch_market_prices()
    top = []
    for tok in TOKENS[:8]:
        row = prices.get(tok["id"])
        if not row:
            continue
        top.append({
            "id": tok["id"],
            "symbol": tok["symbol"],
            "name": row.get("name"),
            "price": row.get("current_price"),
            "change_24h": row.get("price_change_percentage_24h"),
            "image": row.get("image"),
            "market_cap": row.get("market_cap"),
        })
    total_mc = sum((r.get("market_cap") or 0) for r in top)
    return {"tokens": top, "total_market_cap": total_mc}

@api.get("/scanner/opportunities")
async def opportunities(
    user=Depends(current_user),
    min_spread: float = Query(0.15, ge=0),
    dex: Optional[str] = None,
    chain: Optional[str] = None,
):
    prices = await fetch_market_prices()
    opps = build_opportunities(prices)
    if min_spread > 0:
        opps = [o for o in opps if o["spread_pct"] >= min_spread]
    if dex:
        opps = [o for o in opps if o["buy_dex"]["id"] == dex or o["sell_dex"]["id"] == dex]
    if chain:
        opps = [o for o in opps if o["buy_dex"]["chain"] == chain or o["sell_dex"]["chain"] == chain]
    return {"opportunities": opps, "count": len(opps), "fetched_at": datetime.now(timezone.utc).isoformat()}

@api.get("/scanner/opportunity/{opp_id}")
async def opportunity_detail(opp_id: str, user=Depends(current_user)):
    prices = await fetch_market_prices()
    opps = build_opportunities(prices)
    for o in opps:
        if o["id"] == opp_id:
            route = [
                {"step": 1, "action": f"Buy {o['token_symbol']}", "venue": o["buy_dex"]["name"], "chain": o["buy_dex"]["chain"], "price": o["buy_price"]},
            ]
            if o.get("is_cross_chain"):
                route.append({
                    "step": 2, "action": f"Bridge {o['token_symbol']} to {o['sell_dex']['chain']}",
                    "venue": "LI.FI (best route)", "chain": f"{o['buy_dex']['chain']} → {o['sell_dex']['chain']}",
                })
                route.append({"step": 3, "action": f"Sell {o['token_symbol']}", "venue": o["sell_dex"]["name"], "chain": o["sell_dex"]["chain"], "price": o["sell_price"]})
            else:
                route.append({"step": 2, "action": f"Transfer {o['token_symbol']}", "venue": "On-chain", "chain": o["buy_dex"]["chain"]})
                route.append({"step": 3, "action": f"Sell {o['token_symbol']}", "venue": o["sell_dex"]["name"], "chain": o["sell_dex"]["chain"], "price": o["sell_price"]})
            o["route"] = route
            o["slippage_pct"] = 0.5
            return o
    raise HTTPException(404, "Opportunity not found or expired")

# ---------------- Trade execution (SIMULATED - preview environment) ----------------
@api.post("/trades/execute", response_model=TradeOut)
async def execute_trade(body: ExecuteTradeIn, user=Depends(current_user)):
    prices = await fetch_market_prices()
    opps = build_opportunities(prices)
    opp = next((o for o in opps if o["id"] == body.opportunity_id), None)
    if not opp:
        raise HTTPException(404, "Opportunity not found or expired")
    if body.amount_usd > user["balance_usd"]:
        raise HTTPException(400, f"Insufficient balance. Available: ${user['balance_usd']:.2f}")

    gross_profit = body.amount_usd * (opp["spread_pct"] / 100.0)
    gas = opp["estimated_gas_usd"] + opp["buy_dex"]["fee"] * body.amount_usd + opp["sell_dex"]["fee"] * body.amount_usd
    # apply slippage (0 - 0.5%)
    slip = random.uniform(0, 0.005) * body.amount_usd
    net_profit = gross_profit - gas - slip
    status_ = "completed" if net_profit > 0 else "completed_loss"

    trade_id = str(uuid.uuid4())
    trade = {
        "id": trade_id,
        "user_id": user["id"],
        "pair": opp["pair"],
        "token_symbol": opp["token_symbol"],
        "token_image": opp.get("token_image"),
        "buy_dex": opp["buy_dex"]["name"],
        "sell_dex": opp["sell_dex"]["name"],
        "amount_usd": body.amount_usd,
        "spread_pct": opp["spread_pct"],
        "gross_profit": round(gross_profit, 4),
        "gas_fee": round(gas + slip, 4),
        "net_profit": round(net_profit, 4),
        "status": status_,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "mode": "SIMULATED",
    }
    await db.trades.insert_one(trade.copy())
    # update user balance and total pnl
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"balance_usd": net_profit, "total_pnl": net_profit}},
    )
    trade.pop("_id", None)
    return TradeOut(**{k: v for k, v in trade.items() if k in TradeOut.model_fields})


class OnChainTradeIn(BaseModel):
    opportunity_id: str
    amount_usd: float = Field(gt=0)
    tx_hash: str
    chain_id: int
    wallet_address: str
    explorer_url: Optional[str] = None

@api.post("/trades/onchain", response_model=TradeOut)
async def record_onchain_trade(body: OnChainTradeIn, user=Depends(current_user)):
    prices = await fetch_market_prices()
    opps = build_opportunities(prices)
    opp = next((o for o in opps if o["id"] == body.opportunity_id), None)
    if not opp:
        raise HTTPException(404, "Opportunity not found or expired")

    trade_id = str(uuid.uuid4())
    trade = {
        "id": trade_id,
        "user_id": user["id"],
        "pair": opp["pair"],
        "token_symbol": opp["token_symbol"],
        "token_image": opp.get("token_image"),
        "buy_dex": opp["buy_dex"]["name"],
        "sell_dex": opp["sell_dex"]["name"],
        "amount_usd": body.amount_usd,
        "spread_pct": opp["spread_pct"],
        "gross_profit": 0.0,   # unknown until settled on-chain
        "gas_fee": 0.0,
        "net_profit": 0.0,     # PnL will be computed when we index the receipt (future work)
        "status": "onchain_pending",
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "mode": "ONCHAIN",
        "tx_hash": body.tx_hash,
        "chain_id": body.chain_id,
        "wallet_address": body.wallet_address,
        "explorer_url": body.explorer_url,
    }
    await db.trades.insert_one(trade.copy())
    trade.pop("_id", None)
    return TradeOut(**{k: v for k, v in trade.items() if k in TradeOut.model_fields})

@api.get("/trades/history")
async def history(user=Depends(current_user), limit: int = 100):
    cursor = db.trades.find({"user_id": user["id"]}, {"_id": 0}).sort("executed_at", -1).limit(limit)
    trades = await cursor.to_list(length=limit)
    total_profit = sum(t.get("net_profit", 0) for t in trades)
    wins = sum(1 for t in trades if t.get("net_profit", 0) > 0)
    return {
        "trades": trades,
        "total_trades": len(trades),
        "total_profit": round(total_profit, 4),
        "win_rate": round((wins / len(trades) * 100) if trades else 0, 2),
    }

@api.get("/portfolio/summary")
async def portfolio(user=Depends(current_user)):
    trades = await db.trades.find({"user_id": user["id"]}, {"_id": 0}).sort("executed_at", -1).to_list(length=1000)
    total_trades = len(trades)
    wins = sum(1 for t in trades if t.get("net_profit", 0) > 0)
    # trades in last 24h
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    day_trades = [t for t in trades if datetime.fromisoformat(t["executed_at"]) >= day_ago]
    day_pnl = sum(t.get("net_profit", 0) for t in day_trades)
    return {
        "balance_usd": user.get("balance_usd", 0),
        "total_pnl": round(user.get("total_pnl", 0), 4),
        "total_trades": total_trades,
        "win_rate": round((wins / total_trades * 100) if total_trades else 0, 2),
        "pnl_24h": round(day_pnl, 4),
        "trades_24h": len(day_trades),
        "recent_trades": trades[:5],
    }

@api.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ---------------- 1inch spot prices (real per-DEX) ----------------
_oneinch_cache = {"ts": 0.0, "data": {}}

async def fetch_1inch_prices() -> dict:
    """Fetch spot prices via 1inch. Returns {chain_id: {tokenAddr: usd}}.
    Requires ONEINCH_API_KEY; caches 60s and silently falls back to empty."""
    if not ONEINCH_API_KEY:
        return {}
    now = datetime.now(timezone.utc).timestamp()
    if now - _oneinch_cache["ts"] < 60 and _oneinch_cache["data"]:
        return _oneinch_cache["data"]
    # 1inch price endpoint: /price/v1.1/{chainId}?currency=USD returns {addr: usd}
    chains = [1, 137, 56, 42161, 8453]
    out: dict = {}
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            for cid in chains:
                r = await hc.get(
                    f"https://api.1inch.dev/price/v1.1/{cid}?currency=USD",
                    headers={"Authorization": f"Bearer {ONEINCH_API_KEY}"},
                )
                if r.status_code == 200:
                    out[cid] = r.json()
                else:
                    logger.info(f"1inch {cid}: HTTP {r.status_code}")
        _oneinch_cache["data"] = out
        _oneinch_cache["ts"] = now
    except Exception as e:
        logger.warning(f"1inch fetch failed: {e}")
    return out

@api.get("/prices/oneinch")
async def oneinch_status(user=Depends(current_user)):
    data = await fetch_1inch_prices()
    return {
        "configured": bool(ONEINCH_API_KEY),
        "chains_returned": list(data.keys()),
        "sample": {k: list(v.items())[:3] for k, v in data.items()},
    }


# ---------------- Solana / Jupiter ----------------
_jupiter_cache = {"ts": 0.0, "data": {}}

async def fetch_solana_prices() -> dict:
    """Return {mint: usd_price} using Jupiter Quote (SOL as reference)."""
    now = datetime.now(timezone.utc).timestamp()
    if now - _jupiter_cache["ts"] < 45 and _jupiter_cache["data"]:
        return _jupiter_cache["data"]
    prices: dict = {}
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            # Use Jupiter quote endpoint against USDC to derive prices
            usdc = SOLANA_MINTS["usd-coin"]
            for tid, mint in SOLANA_MINTS.items():
                if mint == usdc:
                    prices[mint] = 1.0
                    continue
                r = await hc.get(
                    "https://api.jup.ag/swap/v1/quote",
                    params={"inputMint": mint, "outputMint": usdc, "amount": "1000000000", "slippageBps": 50},
                )
                if r.status_code == 200:
                    j = r.json()
                    # amount is in the input token's smallest unit. For SOL(9 decimals) 1_000_000_000=1 SOL
                    out = int(j.get("outAmount", "0")) / 1_000_000  # USDC 6 decimals
                    in_dec = 9 if mint == SOLANA_MINTS["solana"] else 6
                    in_amt = 1_000_000_000 / (10 ** in_dec)
                    if in_amt > 0:
                        prices[mint] = out / in_amt
        _jupiter_cache["data"] = prices
        _jupiter_cache["ts"] = now
    except Exception as e:
        logger.warning(f"Jupiter price fetch failed: {e}")
    return prices

@api.get("/solana/quote")
async def solana_quote(
    input_mint: str = Query(..., alias="inputMint"),
    output_mint: str = Query(..., alias="outputMint"),
    amount: str = Query(...),
    slippage_bps: int = Query(50, alias="slippageBps"),
    user=Depends(current_user),
):
    """Proxy Jupiter quote endpoint."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.get(
                "https://api.jup.ag/swap/v1/quote",
                params={
                    "inputMint": input_mint, "outputMint": output_mint,
                    "amount": amount, "slippageBps": slippage_bps,
                },
            )
            if r.status_code != 200:
                raise HTTPException(400, f"Jupiter error: {r.text[:200]}")
            return r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Jupiter fetch failed: {e}")

@api.post("/solana/swap-tx")
async def solana_swap_tx(body: dict, user=Depends(current_user)):
    """Build a Jupiter swap transaction. `body` must include quoteResponse + userPublicKey."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.post("https://api.jup.ag/swap/v1/swap", json=body)
            if r.status_code != 200:
                raise HTTPException(400, f"Jupiter swap-tx error: {r.text[:200]}")
            return r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Jupiter swap-tx failed: {e}")


# ---------------- Auto-bridging (LI.FI) ----------------
@api.get("/bridge/quote")
async def bridge_quote(
    from_chain: int = Query(..., alias="fromChain"),
    to_chain: int = Query(..., alias="toChain"),
    from_token: str = Query(..., alias="fromToken"),
    to_token: str = Query(..., alias="toToken"),
    from_amount: str = Query(..., alias="fromAmount"),
    from_address: str = Query(..., alias="fromAddress"),
    user=Depends(current_user),
):
    try:
        async with httpx.AsyncClient(timeout=12.0) as hc:
            r = await hc.get(
                "https://li.quest/v1/quote",
                params={
                    "fromChain": from_chain, "toChain": to_chain,
                    "fromToken": from_token, "toToken": to_token,
                    "fromAmount": from_amount, "fromAddress": from_address,
                },
            )
            if r.status_code != 200:
                raise HTTPException(400, f"LI.FI: {r.text[:200]}")
            j = r.json()
            est = j.get("estimate", {})
            return {
                "tool": j.get("tool"),
                "bridge_name": j.get("toolDetails", {}).get("name", j.get("tool")),
                "from_amount_usd": est.get("fromAmountUSD"),
                "to_amount_usd": est.get("toAmountUSD"),
                "gas_cost_usd": sum(float(g.get("amountUSD") or 0) for g in est.get("gasCosts", [])),
                "execution_seconds": est.get("executionDuration"),
                "transaction_request": j.get("transactionRequest"),
                "raw": j,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"LI.FI failed: {e}")

@api.get("/bridge/chains")
async def bridge_chains(user=Depends(current_user)):
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.get("https://li.quest/v1/chains")
            if r.status_code == 200:
                return {"chains": [{"id": c["id"], "name": c["name"], "key": c["key"]} for c in r.json().get("chains", [])]}
    except Exception as e:
        logger.warning(f"LI.FI chains failed: {e}")
    return {"chains": []}


# ---------------- On-chain PnL reconciliation ----------------
class ReconcileIn(BaseModel):
    trade_id: str
    rpc_url: Optional[str] = None

@api.post("/trades/reconcile")
async def reconcile_trade(body: ReconcileIn, user=Depends(current_user)):
    """Fetch the receipt for an on-chain trade and update the trade record with the
    actual amounts + net_profit. Best-effort — safe to call repeatedly."""
    trade = await db.trades.find_one(
        {"id": body.trade_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.get("mode") != "ONCHAIN" or not trade.get("tx_hash"):
        raise HTTPException(400, "Only on-chain trades can be reconciled")

    chain_id = int(trade.get("chain_id") or 0)
    rpc = body.rpc_url or RPC_MAP.get(chain_id)
    if not rpc:
        raise HTTPException(400, f"No RPC for chain {chain_id}")

    try:
        from web3 import Web3
    except Exception:
        raise HTTPException(500, "web3 not available")

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 15}))
    try:
        receipt = w3.eth.get_transaction_receipt(trade["tx_hash"])
    except Exception:
        return {"status": "pending", "trade": trade}

    if not receipt:
        return {"status": "pending", "trade": trade}

    status_str = "onchain_success" if receipt.status == 1 else "onchain_failed"
    # Gas cost in native
    gas_used = int(receipt.gasUsed)
    effective = int(receipt.get("effectiveGasPrice") or 0)
    gas_native = (gas_used * effective) / 1e18
    native_usd_map = {1: 3500, 137: 0.55, 56: 620, 42161: 3500, 8453: 3500, 480: 3500, 360: 3500}
    gas_usd = round(gas_native * native_usd_map.get(chain_id, 0), 4)

    # Parse Uniswap V2-style Swap events to compute token amounts moved
    swap_events = []
    for log in receipt.logs:
        topics = [t.hex() for t in log.topics] if log.topics else []
        if topics and topics[0].lower() == SWAP_EVENT_TOPIC_V2.lower():
            data = log.data.hex() if hasattr(log.data, "hex") else str(log.data)
            swap_events.append({"address": log.address, "topic0": topics[0]})

    # net_profit estimation: without a full price index of every token, we conservatively
    # set net_profit = -gas_usd for failed trades, or leave 0 for success (frontend can refine).
    net_profit = -gas_usd if status_str == "onchain_failed" else 0.0

    await db.trades.update_one(
        {"id": trade["id"]},
        {"$set": {
            "status": status_str,
            "gas_fee": gas_usd,
            "net_profit": round(net_profit, 4),
            "block_number": int(receipt.blockNumber),
            "swap_events_count": len(swap_events),
            "reconciled_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.trades.find_one({"id": trade["id"]}, {"_id": 0})
    return {"status": status_str, "gas_usd": gas_usd, "trade": updated}


@api.get("/dexes")
async def dexes(user=Depends(current_user)):
    return {"dexes": DEXES}


@api.get("/export/source")
async def export_source():
    from fastapi.responses import FileResponse
    zip_path = Path(__file__).parent / "exports_arbscout.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(str(zip_path), media_type="application/zip", filename="arbscout-source.zip")

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
