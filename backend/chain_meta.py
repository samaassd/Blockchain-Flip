"""Chain/DEX metadata and helpers shared across services."""

# Alchemy-based RPCs where available; public RPCs for others.
def build_rpcs(alchemy_key: str) -> dict:
    alc = lambda sub: f"https://{sub}.g.alchemy.com/v2/{alchemy_key}" if alchemy_key else ""
    return {
        1:     alc("eth-mainnet")     or "https://cloudflare-eth.com",
        137:   alc("polygon-mainnet") or "https://polygon-rpc.com",
        56:    "https://bsc-dataseed.binance.org",
        42161: alc("arb-mainnet")     or "https://arb1.arbitrum.io/rpc",
        8453:  alc("base-mainnet")    or "https://mainnet.base.org",
        480:   alc("worldchain-mainnet") or "https://worldchain-mainnet.g.alchemy.com/public",
        360:   alc("shape-mainnet")   or "https://mainnet.shape.network",
    }

CHAIN_NAMES = {
    1: "Ethereum",
    137: "Polygon",
    56: "BNB Chain",
    42161: "Arbitrum",
    8453: "Base",
    480: "World Chain",
    360: "Shape",
    101: "Solana",   # non-EVM
}

EVM_CHAINS = {1, 137, 56, 42161, 8453, 480, 360}
SOLANA_CHAIN = 101

# DEX → chainId
DEX_TO_CHAIN = {
    "uniswap": 1,
    "sushiswap": 1,
    "curve": 1,
    "balancer": 1,
    "pancakeswap": 56,
    "quickswap": 137,
    "raydium": 101,     # Solana
    "orca": 101,        # Solana
    "aerodrome": 8453,  # Base
}

# Uniswap V2-style Swap event topic (for PnL reconciliation)
SWAP_EVENT_TOPIC_V2 = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"

# Solana token mints for our scanner tokens
SOLANA_MINTS = {
    "solana": "So11111111111111111111111111111111111111112",  # SOL (wSOL for Jupiter)
    "usd-coin": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
    "raydium": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    "jupiter-exchange-solana": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
}
