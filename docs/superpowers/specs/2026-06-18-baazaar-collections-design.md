# Baazaar — Missing Collections + Buy-with-any-token — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build (data verified)
**Project:** gotchi-closet
**Reference:** see `2026-06-18-dapp-parity-overview.md` (addresses, categories, images)

---

## 1. Summary

Add the four tradeable collections the dapp's Baazaar has that we don't, plus the
Forge-items buy category, and the **buy-with-any-token** swap path. All reuse the
existing `MarketGrid` / `OwnedMarketGrid` / `MakeOfferButton` / `BuyButton` machinery
— this is config + adapters, not new infrastructure.

Missing collections (all confirmed live on Base, categories verified):

| Collection | Kind | Category | Contract |
|---|---|---|---|
| FAKE Gotchis | ERC721 | **5** | fakeGotchisNFT `0xAb59CA4A…df479` |
| FAKE Cards | ERC1155 | **6** | fakeCardsDiamond `0xe46B8902…06A9` |
| Forge items | ERC1155 | **7,8,9,11** | forgeDiamond `0x50aF2d63…186C` |
| Guardian Skins | ERC1155 | **12** | guardianSkinsDiamond `0x898d0F54…6e59` |
| Guardian Profile | ERC721 | none on-chain yet | guardianProfileDiamond `0xdc27a8BF…f45f` |

---

## 2. Placement (per "no new pages unless intuitive")

These belong in the **Explorer asset-type tabs** alongside Gotchis/Wearables/etc — the
exact pattern users already know. No new routes. Add to the Explorer asset toggle:
**FAKE Gotchis**, **FAKE Cards**, **Guardians**, **Forge** (group the collection tabs
after Portals; Forge next to Items). Guardian Skins can be a sub-tab/filter under
Guardians, or its own tab if volume justifies.

---

## 3. Data & contracts (verified)

- **Listings + offers + FAKE metadata** all live in `aavegotchi-core-base`
  (`erc721Listings` / `erc1155Listings` filtered by `category`, and
  `erc721BuyOrders` / `erc1155BuyOrders`). `ERC721Listing` carries `fakeGotchi_name`,
  `fakeGotchi_publisher`, `fakeGotchi_artist`, `fakeGotchi_editions`, etc — use these
  for FAKE cards/labels.
- **Buy**: `executeERC721ListingToRecipient` / `executeERC1155ListingToRecipient`
  (already wired in `useMarketplaceBuy`) — just pass the right contract + category.
- **Offers**: `placeERC721BuyOrder` / `placeERC1155BuyOrder` (already wired). Re-verify
  ERC721 `validationOptions` length for FAKE Gotchi (cat 5) — gotchis need 3; parcels
  took `[]`; FAKE likely `[]` (CONFIRM by eth_call before shipping the offer button).
- **Bulk list (owned)**: extend `OwnedMarketGrid` `OwnedKind` + `LISTING_CATEGORY`
  + `TOKEN_CONTRACT` with fakegotchi(5,721,fakeGotchisNFT), fakecard(6,1155,fakeCards),
  forge(7/8/9/11,1155,forgeDiamond — pick category per item type), guardianskin(12,1155).
  Owned enumeration: ERC721 via subgraph `{owner}`; ERC1155 via the diamond's balances
  read (verify each diamond exposes an `*Balances(address)` like `itemBalances`).

### Verify-then-build checklist
1. eth_call a listing + a buy on one FAKE Gotchi, one FAKE Card, one Forge item, one
   Guardian Skin (business revert = correct).
2. Confirm Guardian Profile is sale-enabled on Base (no listings observed) — if not,
   ship Guardians as **view + skins-trading only** and note it.
3. Forge: map which forge item **type** maps to category 7 vs 8 vs 9 vs 11 (query
   distinct `category` per `erc1155TypeId` range; label them Alloy/Cores/Geodes/etc).

---

## 4. Images (verified — see overview §4)

- **FAKE Gotchis / Cards**: core subgraph `fakeGotchiNFTTokens.metadata
  { thumbnailHash, fileHash }` → `https://arweave.net/{hash}` (or existing
  `FakeGotchiImage` proxy `dapp.aavegotchi.com/api/image/proxy?hash=…`). Reuse the
  `FakeGotchiImage` component already in `GotchiSvgById.tsx`.
- **Forge items**: `https://d1ct2dwqrn0rul.cloudfront.net/shared-assets/images/{id}.png`
  (confirm id scheme — may be the forge item id). Fallback to a forge/anvil icon.
- **Guardian Skins / Profile**: arweave metadata (confirm field); fallback icon.
- All via `AssetImage` with a candidate list + placeholder fallback (no broken imgs).

---

## 5. Buy-with-any-token (swap → buy)

The dapp lets a buyer pay a GHST-denominated listing using USDC/other tokens, swapping
in-tx (core listing fields `purchasedWithSwap`, `swapTokenIn`, `swapAmountIn`,
`swapGhstReceived`). 

- **Verify** the diamond function the dapp calls (likely an
  `executeERC721ListingWithSwap` / router-assisted variant) from a JS chunk + eth_call
  before building. If it's a router/aggregator call, capture the router address.
- **Placement**: a token selector on the existing `BuyButton` flow ("Pay with: GHST ▾
  / USDC / …"), defaulting to GHST. Cross-ref get-tokens spec.
- Phase this AFTER the collections (it's an enhancement to the buy path, not a blocker).

---

## 6. Build phases

1. Add new addresses + categories to `contracts.ts`; add image helpers.
2. Forge-items buy tab (Forge diamond already present) — lowest risk.
3. FAKE Gotchis + Cards buy tabs (reuse `FakeGotchiImage`, subgraph metadata).
4. Guardians (skins trading; profile view).
5. Make-offer + owned/bulk-list across all (after per-collection eth_call verify).
6. Buy-with-any-token (after verifying the swap function).

---

## 7. Acceptance (incl. dapp confirmation)

- For each collection: our tab's item count, prices, and categories **match
  `dapp.aavegotchi.com/baazaar/<route>?chainId=8453`** (Playwright side-by-side).
- A real buy + a real offer succeed on-chain (or sim-pass) per collection.
- Every card shows correct art (no broken images); fallback verified.
- 0 console errors on the deployed Explorer for each new tab.

## 8. Open questions
- Guardian Profile sale support on Base?
- Forge category→item-type labels (7/8/9/11).
- Exact buy-with-any-token diamond function + router.
