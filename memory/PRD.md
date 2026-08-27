# ArbScout — PRD

## Overview
Mobile crypto arbitrage app that scans opportunities across popular DEXs on both EVM chains and Solana. Users can execute in **SIMULATED** mode (virtual $10K) or **REAL on-chain** mode via WalletConnect / injected wallets, with automatic cross-chain bridging via LI.FI and post-execution PnL reconciliation from the tx receipt.

## Core Features
- Email/password auth (JWT + bcrypt)
- **Real-price scanner** — CoinGecko base prices + optional 1inch spot prices, resilient cache with backoff
- **Solana support** — Raydium / Orca DEXs; Jupiter API proxy (`/solana/quote`, `/solana/swap-tx`) builds real swap tx
- **Auto-bridging** — cross-chain opportunities show a LI.FI bridge step, `/bridge/quote` returns a real transaction request
- **Wallet page** — cross-platform `useWallet` hook (web: injected browser wallet; native: Reown AppKit / WalletConnect). Shows real native balance from RPC.
- **On-chain execution** — Uniswap V2-style routers per EVM chain, ethers.js sign flow
- **PnL reconciliation** — after signing, `/trades/reconcile` polls the receipt, parses swap events, updates net_profit + gas cost
- Dashboard, Scanner, Wallet, History, Settings tabs

## Backend (`/api/*`)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Market: `GET /market/overview`, `GET /scanner/opportunities`, `GET /scanner/opportunity/{id}`
- Prices: `GET /prices/oneinch` (graceful 1inch spot-price probe)
- Solana: `GET /solana/quote`, `POST /solana/swap-tx` (Jupiter proxies)
- Bridge: `GET /bridge/chains`, `GET /bridge/quote` (LI.FI proxies)
- Trades: `POST /trades/execute` (simulated), `POST /trades/onchain` (record real tx), `POST /trades/reconcile` (parse receipt), `GET /trades/history`, `GET /portfolio/summary`

## Chains
Ethereum, Polygon, BNB Chain, Arbitrum, Base, World Chain, Shape (EVM) + Solana (via Jupiter).

## Known caveats
- **1inch key** currently invalid (401 from upstream) — endpoint is graceful; regenerate at portal.1inch.dev and paste over `ONEINCH_API_KEY` to enable.
- **Solana wallet signing** is preview-stub — no Reown Solana RN adapter available; production needs Phantom deep-link or a Solana WalletConnect flow.
- **World Chain / Shape** support wallet connection but no Uniswap V2 router deployed — swaps are gracefully disabled on those chains.
- **WalletConnect deep-linking to MetaMask/Trust/Rainbow** only works fully on a native/dev build (Publish button).

## Update (Aug 27, 2026)
- Fixed "Native → native arbitrage not supported" error: native-coin opportunities (ETH, POL) now execute as native → USDC swaps via the V2 router instead of being blocked (src/wallet/swap.ts, contracts.ts).
- Corrected ARB mapping: ARB is now treated as an ERC-20 (mainnet + Arbitrum One), not a native coin.
