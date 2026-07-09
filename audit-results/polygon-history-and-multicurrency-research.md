# Research: Polygon-era sale history + multi-currency buy (GHST/USDC/ETH)

Date: 2026-07-09. All endpoints, selectors, and addresses below were verified live (curl POST / Base RPC loupe calls) or extracted directly from the live dapp.aavegotchi.com bundle. No code changes made.

---

## 1. Polygon-era sale history — SOLVED, keyless endpoint verified

### Working endpoint (no API key)

```
https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-matic/prod/gn
```

Same Goldsky project as our existing Base endpoint (`src/lib/env.ts` `aavegotchi-core-base`), just `-matic` instead of `-base`. This is **exactly what the official dapp queries**: the URL was extracted verbatim from the live dapp JS bundle (chunk list at dapp.aavegotchi.com, grep of all 225 `_next/static/chunks/*.js`).

### Verification (real POST responses, 2026-07-09)

Parcel 8965 (the dapp's "SOLD (1 YR AGO) 130.00 GHST" case):

```graphql
{ erc721Listings(where:{tokenId:"8965", category:"4", timePurchased_gt:"0"}) {
    id tokenId category priceInWei timePurchased buyer seller } }
```
```json
{"data":{"erc721Listings":[{"id":"287430","tokenId":"8965","category":"4",
  "priceInWei":"130000000000000000000","timePurchased":"1740104851",
  "buyer":"0xc4cb6cb969e8b4e309ab98e4da51b77887afad96",
  "seller":"0xe5f6dbc39334f3e79c149efb8c8c9c8dec474af1"}]}}
```
130 GHST, 2025-02-21 — matches the dapp exactly.

Portal #117 ("sold for 3000 GHST years ago"):

```json
{"data":{"erc721Listings":[
  {"id":"90468","tokenId":"117","category":"0","priceInWei":"2695000000000000000000","timePurchased":"1627503793"},
  {"id":"98171","tokenId":"117","category":"0","priceInWei":"3000000000000000000000","timePurchased":"1629320363"}]}}
```
2,695 GHST (2021-07-28) and 3,000 GHST (2021-08-18) — matches.

ERC1155 (wearable) sale history also works via `erc1155Purchases` (verified; latest Polygon-era purchase timestamp 1753619979 = 2025-07-27, i.e. history runs right up to the Base migration).

### Health / freshness

`_meta`: block 89,496,601, `hasIndexingErrors: false`, deployment `QmXJuSPPmoduUHamTCEeVxknGWAPQWh1eV4cyUmXpybFsH`. Polygon block 89,496,601 timestamp = **2026-07-01** (checked via polygon-bor-rpc.publicnode.com), so Goldsky is still actively indexing this subgraph near Polygon head — it is live and maintained, not a frozen archive. (Polygon-side markets are dead post-migration, so the sale data is effectively final after July 2025 regardless.)

### Sibling matic subgraphs (same project, all in the dapp bundle)

- `aavegotchi-gbm-baazaar-matic/prod/gn` — Polygon-era GBM auction history. Verified with an `auctions` query (returned auction id 24185, 225 GHST highest bid).
- `aavegotchi-alchemica-matic/prod/gn` — present in bundle, not tested.

### Dead ends checked

- `https://api.thegraph.com/subgraphs/name/aavegotchi/aavegotchi-core-matic` — dead (Cloudflare 301; hosted service sunset). The dapp bundle still contains this string but as legacy config.
- The Graph decentralized-network gateway was not needed (it requires an API key; irrelevant since the Goldsky mirror is keyless and is what Pixelcraft themselves run).
- No `api.aavegotchi.com`-style cross-chain sale-history REST API exists in the bundle; the dapp does cross-chain history purely by querying both `-base` and `-matic` subgraphs.

### Integration note for GotchiCloset

Add a `CORE_SUBGRAPH_MATIC` constant and, in sale-history code paths (`src/lib/explorer/priceHistory.ts` etc.), query both endpoints and merge (all matic `timePurchased` values predate Base ones, so a simple concat+sort works). The matic endpoint does not need the `coreSubgraphFetch` failover wrapper (that failover targets our self-published Base mirror); a plain fetch is fine, or extend the wrapper with a matic entry later. Schema is the same core-subgraph schema (`erc721Listings`, `erc1155Listings`, `erc1155Purchases`).

---

## 2. Multi-currency buy (GHST / USDC / ETH) — mechanism identified and verified

### Mechanism: ONE transaction via diamond facets (no aggregator API, no client-side pre-swap)

The dapp calls two payable functions **on the Aavegotchi Diamond itself** (Base: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`). ABI extracted from live bundle chunk `25048-12d051507fc0583c.js`; selectors computed with viem and confirmed deployed via DiamondLoupe `facetAddress(bytes4)` calls against Base mainnet:

| Function | Selector | Facet (live on diamond) |
|---|---|---|
| `swapAndBuyERC721(address tokenIn, uint256 swapAmount, uint256 minGhstOut, uint256 swapDeadline, uint256 listingId, address contractAddress, uint256 priceInWei, uint256 tokenId, address recipient) payable` | `0xfc45790c` | `0x05f97E9d23b0DFa96A1c349a6685b2A046729f37` |
| `swapAndBuyERC1155(address tokenIn, uint256 swapAmount, uint256 minGhstOut, uint256 swapDeadline, uint256 listingId, address contractAddress, uint256 itemId, uint256 quantity, uint256 priceInWei, address recipient) payable` | `0x0df1c37a` | `0x8CdAA1184a75E00Ea82262723bEa47bA81aA78e9` |

Source: `aavegotchi/aavegotchi-base` → `contracts/Aavegotchi/facets/ERC721MarketplaceSwapFacet.sol` + `contracts/Aavegotchi/libraries/LibTokenSwap.sol` (also `SWAP_AND_BUY_INTEGRATION.md` and `scripts/upgrades/upgrade-addSwapAndBuy.ts`).

### What happens inside (from LibTokenSwap.sol)

1. `tokenIn = address(0)` means ETH (`msg.value` must equal `swapAmount`); `tokenIn = USDC` (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) means the diamond does `transferFrom` (so the user must have **approved the diamond** for USDC first).
2. Swap to GHST via **zRouter** (multi-AMM router, hardcoded constant): `0x0000000000404FECAf36E6184245475eE1254835` (verified: has code on Base; note the address printed in SWAP_AND_BUY_INTEGRATION.md is a typo — the LibTokenSwap constant is authoritative).
   - USDC path: `swapAeroCL` (Aerodrome concentrated-liquidity, tickSpacing 2000), fallback `swapV2` on revert.
   - ETH/other path: `swapAero` (Aerodrome volatile pair), fallback `swapV2`.
3. GHST lands in the diamond, which executes the listing with itself as buyer, transfers the NFT to `recipient`, and **refunds any excess GHST (not the input token) to `recipient`**.
4. Guards: `minGhstOut >= priceInWei` (x quantity for 1155) required; swap slippage reverts the whole tx atomically ("Insufficient output amount"); `swapDeadline <= now + 24h`.

### How the client sizes the swap (quote)

There is **no on-chain quoter on the diamond**: the upgrade script mentions `getGHSTAmountOut` but both plausible selectors (`0x4cdf8b66`, `0x3be3cbdf`) loupe to `0x0` — not deployed. The official `aavegotchi/aavegotchi-baazaar-skill` repo (`references/usdc-swap-math.md`, explicitly titled "Matches Dapp Defaults") documents the client-side math:

- `minGhstOut = totalCostGhstWei` (exactly the listing price, x quantity for 1155)
- `swapAmount = ceil(usdValueInUsdc6dp * 1.01 * 1.01)` — 1% payment-fee buffer + 1% slippage buffer
- GHST/USD price from CoinGecko (`api.coingecko.com/api/v3/simple/price?ids=aavegotchi&vs_currencies=usd`); for ETH the same idea with an ETH/USD price and a slightly larger buffer.

So: off-chain USD quote + ~2% buffer, overshoot refunded as GHST.

### Feasibility for GotchiCloset (`src/components/explorer/BuyButton.tsx`)

Current flow is single-currency: balance check on `GHST_TOKEN_BASE`, then `useMarketplaceBuy` (approve GHST + execute listing). Adding USDC/ETH is **small and low-risk**, because the contract side already exists on the same diamond we already call:

Steps:
1. Add a currency picker to BuyButton (GHST default; USDC/ETH options), plus USDC/ETH balance reads.
2. New `useSwapAndBuy` hook mirroring `useMarketplaceBuy`:
   - USDC: `approve(diamond, swapAmount)` on USDC if allowance short, then `writeContract` `swapAndBuyERC721`/`swapAndBuyERC1155` with `tokenIn = USDC`, `minGhstOut = priceInWei (x qty)`, `swapDeadline = now + 300`, `recipient = address`.
   - ETH: same call with `tokenIn = 0x000...0`, `value: swapAmount`, no approval step.
3. Quote util: fetch GHST/USD (+ ETH/USD for the ETH path) from CoinGecko (free, keyless), apply the dapp-default 1%+1% buffer, ceil. Optionally show "≈ X USDC / Y ETH" on the button.
4. Simulate (`simulateContract`) before sending to surface "Insufficient output amount" early.

Estimated size: ~150–250 LOC (one hook + one quote util + button UI), no new contracts, no aggregator API keys, one tx for ETH, two (approve + buy) for USDC — identical shape to today's GHST flow.

Risks / gotchas:
- **Stale/volatile price feed** → swap can't meet `minGhstOut` → whole tx reverts atomically. Safe (user keeps funds, minus gas), but handle the revert message in the toast.
- **Refund is in GHST**, not the input currency: with the 2% buffer users receive a small GHST dust refund. Communicate this in the UI (the dapp behaves the same way).
- **Liquidity depth**: swaps route through Aerodrome GHST pools; very large purchases may exceed the buffer. Consider bumping the slippage buffer or capping non-GHST buys above a size threshold.
- **zRouter dependency**: an unaudited-by-us third-party router, but it's hardcoded in Pixelcraft's own facet and funds only transit inside one atomic tx; our client never touches it directly.
- CoinGecko rate limits: cache the price for ~60s; we already have precedent for keyless price fetches in this repo.

### Verification trail

- ABI: extracted from `https://dapp.aavegotchi.com/_next/static/chunks/25048-12d051507fc0583c.js` (downloaded 2026-07-09).
- Selectors live on diamond: `eth_call` `facetAddress(bytes4)` (`0xcdffacc6...`) on `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` via `https://mainnet.base.org`.
- Facet/library source: github.com/aavegotchi/aavegotchi-base @ 9ce0c19.
- zRouter `0x0000000000404FECAf36E6184245475eE1254835`: `eth_getCode` returns bytecode on Base.
