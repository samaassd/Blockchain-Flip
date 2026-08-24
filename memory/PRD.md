# ArbScout — PRD

## Overview
Mobile crypto arbitrage app that scans opportunities across popular DEXs (Uniswap, SushiSwap, PancakeSwap, Curve, Balancer, QuickSwap) using real market prices from CoinGecko, and lets the user execute trades either in **SIMULATED** mode (against a virtual $10,000) or **REAL on-chain** mode via WalletConnect once a wallet is connected.

## Core Features
- Email/password auth with JWT (bcrypt)
- Live arbitrage scanner with real CoinGecko prices + resilient cache (90s TTL, exponential backoff on 429)
- Opportunity detail with route visualization, amount input, mode toggle (Simulated / On-Chain)
- **Wallet page** — Reown AppKit v2 (WalletConnect v2) with MetaMask / Trust / Rainbow support
- Simulated trade execution (updates virtual balance and P&L)
- Real on-chain execution via Uniswap V2-style routers (QuickSwap on Polygon, PancakeSwap on BNB, SushiSwap on Arbitrum, BaseSwap on Base, Uniswap V2 on Ethereum). User signs in their own wallet — app never sees keys.
- Trade history with filters, stats (total P&L, trades, win rate). On-chain trades link to their block explorer.
- Portfolio dashboard, market overview, settings

## Supported EVM chains
Ethereum, Polygon, BNB Chain, Arbitrum, Base, World Chain, Shape. Alchemy RPCs used where available. World Chain / Shape support wallet connection but do not yet have a mature Uniswap-V2 router; swaps on those chains are disabled at the router level (wallet still connects and shows balance).

## Backend (`/api/*`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /market/overview`, `GET /scanner/opportunities`, `GET /scanner/opportunity/{id}`
- `POST /trades/execute` (simulated), `POST /trades/onchain` (records real tx hash), `GET /trades/history`, `GET /portfolio/summary`

## Frontend
- Expo Router with `(auth)` and `(tabs)` groups. Tabs: Dashboard, Scanner, Wallet, History, Settings.
- Opportunity detail route: `/opportunity/[id]` with Simulated / On-Chain toggle.
- Dark-first utility UI (Deep Navy #0B101E + Electric Cyan #00E5FF).

## Non-EVM chains (Solana etc.)
Solana requires a **separate SDK track** — a Solana AppKit adapter, `@solana/web3.js`, and Jupiter (not Uniswap V2) for swap tx construction. Not included in this iteration; can be added as a follow-up.

## Preview vs. Publish
- WalletConnect wallet signing requires a native/dev build. In Expo Go preview the wallet UI renders but wallet deep-linking is unreliable. Publish via the Publish button to test real signing.
