# Get Tokens — Swap / Bridge / On-ramp — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build
**Project:** gotchi-closet
**Reference:** `2026-06-18-dapp-parity-overview.md`

---

## 1. Summary

The dapp's `/get-tokens` page helps users acquire GHST on Base via three tabs:
- **SWAP** — in-app swap (CowSwap) plus links to Aerodrome (leading Base DEX), Uniswap
  (cross-chain), Quickswap (legacy Polygon liquidity).
- **BRIDGE** — cross-chain bridge, powered by **Socket** (confirmed: `socket-bridge-base`
  subgraph in the dapp config).
- **PURCHASE** — fiat on-ramp.

Related: **buy-with-any-token** at checkout (pay a GHST listing with USDC/etc), surfaced
by the core listing fields `purchasedWithSwap` / `swapTokenIn` / `swapAmountIn` /
`swapGhstReceived`. See baazaar-collections spec §5.

---

## 2. Placement

A **new `/get-tokens` route** matches the dapp and user expectation; link it from the
wallet/GHST balance area (header) and from the inventory "Wallet" card. The actual swap/
bridge/on-ramp are **embedded third-party widgets**, so the build is integration, not
protocol work.

---

## 3. Integrations (verified directions)

| Tab | Approach |
|---|---|
| Swap (in-app) | Embed **CowSwap** widget (`@cowprotocol/widget-react` or iframe), pair to GHST `0xcD2F…BcB` on Base. Plus outbound links: Aerodrome, Uniswap, Quickswap. |
| Bridge | Embed **Socket/Bungee** widget (Socket plugin), default dest token GHST on Base. Bridge status read from `socket-bridge-base` subgraph if we want to show pending transfers. |
| Purchase | Fiat on-ramp widget (the dapp uses an on-ramp provider — verify which: Transak/Ramp/Onramper from the JS chunk) targeting GHST/USDC on Base. |

- USDC on Base: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (from config) for swap pairs.
- Verify the exact widget providers + any API keys from the dapp chunks before building;
  prefer the same providers so behavior matches.

### Buy-with-any-token (checkout)
- Verify the diamond function the dapp calls for swap-buy (likely an
  `execute…ListingWithSwap` or a router-assisted call) via JS chunk + eth_call; capture
  the router/aggregator address. Then add a "Pay with ▾" selector (GHST default) to
  `BuyButton`. Phase after the standalone get-tokens page.

---

## 4. UX
- Three tabs (Swap / Bridge / Purchase) mirroring the dapp, GHST-on-Base as the default
  target everywhere, with the DEX/links row under Swap.
- Wallet balances (GHST + alchemica) shown above (shared with inventory spec).

## 5. Build phases
1. Page shell + Swap (CowSwap embed) + DEX links.
2. Bridge (Socket embed).
3. Purchase (on-ramp embed — provider TBD from dapp).
4. Buy-with-any-token at checkout (after verifying the swap-buy function).

## 6. Acceptance (incl. dapp confirmation)
- Each tab loads its widget and can quote a GHST swap/bridge on Base (manual check).
- Buy-with-any-token: a sim/real purchase paying with USDC settles the GHST listing.
- Behavior parity with `dapp.aavegotchi.com/get-tokens` (same providers/targets).
- 0 console errors.

## 7. Open questions
- Exact widget providers + keys the dapp uses (CowSwap config, Socket app id, on-ramp).
- Swap-buy diamond function + router address.
