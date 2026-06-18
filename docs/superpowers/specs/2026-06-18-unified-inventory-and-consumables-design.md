# Unified Inventory + Use Consumables — Design Spec

**Date:** 2026-06-18
**Status:** Draft → ready to build (data verified)
**Project:** gotchi-closet
**Reference:** `2026-06-18-dapp-parity-overview.md`

---

## 1. Summary

The dapp has a single inventory/wallet view of **everything** the connected address
holds: wearables, consumables, tickets/raffle items, badges, and token balances
(GHST + alchemica FUD/FOMO/ALPHA/KEK). gotchi-closet only surfaces owned assets split
across Explorer "owned" scopes, and never shows tickets/badges/alchemica or lets you
**use** a consumable. This spec closes that.

Two parts:
- **A. Unified inventory** — one place listing all held items + token balances.
- **B. Use consumables** — apply a consumable to a gotchi (XP drops, kinship/greater
  kinship potions, etc.) via `useConsumables`.

---

## 2. Placement (existing surfaces, no new page if avoidable)

- **Inventory** lives in the **Explorer → "Owned"** experience as a new **"Inventory"
  scope/overview** (extends the existing `OwnedOverview`), not a new route. It is the
  "full inventory" landing when `mode=mine`: token balances row on top, then grouped
  item grids (Wearables / Consumables / Tickets / Badges / Installations / Tiles /
  Parcels / FAKE / Guardians) each linking into the relevant owned tab.
- **Use consumables** is an action on the **gotchi manage modal**
  (`GotchiActionsPanel`) — "Use item on this gotchi" — and optionally a "Use" button on
  a consumable in the inventory that prompts for a target gotchi id.

---

## 3. Data & contracts (verified)

- **Item balances (wearables + consumables + tickets + badges)**: diamond
  `itemBalances(address)` -> `[{itemId, balance}]` (already used in `OwnedMarketGrid`
  and the owned-wearables fix). Classify each `itemId` by category via
  `data/wearables.json` + item-type metadata:
  - Wearables = category 0; Consumables = category 2; Tickets/Badges = their own item-id
    ranges (badges are non-transferable item ids; tickets are raffle items). Confirm the
    id ranges from the diamond `getItemType(id)` / `itemTypes` or the items metadata.
- **Token balances**: ERC20 `balanceOf` on ghst, fud, fomo, alpha, kek (addresses in
  overview §1). Alchemica are plain ERC20s — no subgraph needed.
- **Use consumables**: `useConsumables(uint256 _tokenId, uint256[] _itemIds,
  uint256[] _quantities)` on the aavegotchiDiamond (verified sig). Only category-2
  consumables are usable; the contract reverts otherwise (surface that).
- **Installations/tiles/parcels/FAKE/guardians** held: reuse the per-collection owned
  enumeration from the baazaar-collections spec.

### Verify-then-build
1. eth_call `useConsumables(gotchiId, [consumableId], [1])` from a holder -> business
   revert (e.g. not enough balance) = correct ABI.
2. Confirm item-id ranges for tickets vs badges vs consumables (diamond `itemTypes` or
   `getItemType`). Don't guess — read on-chain or from the items metadata file.

---

## 4. Images (verified)

- Wearables/consumables/tickets: `app.aavegotchi.com/images/items/{id}.svg` (existing
  `AssetImage` `itemImageCandidates`). Badges/tickets may have dedicated art — confirm
  the path; fallback to a generic item icon.
- Alchemica/GHST: token icons (FUD/FOMO/ALPHA/KEK have brand SVGs — add to assets).
- Always a fallback; never a broken `<img>`.

---

## 5. UX

- **Inventory overview** (Explorer owned mode): a "Wallet" card with GHST + 4 alchemica
  balances (and USD value if a price source is available), then collapsible sections per
  asset type with counts and thumbnails. Each section "View all ->" opens the matching
  owned tab (which already has bulk-list).
- **Use item**: from the gotchi manage modal, choose a consumable you own + quantity ->
  `useConsumables`. Show what it does (XP +N, kinship +N) from item metadata. Confirm +
  toast on success; refresh balances.

---

## 6. Build phases
1. Token-balances row (GHST + alchemica `balanceOf`).
2. Item classification (id -> wearable/consumable/ticket/badge) from metadata.
3. Inventory overview grids in the owned scope.
4. `useConsumables` action on the gotchi manage modal (after eth_call verify).

## 7. Acceptance (incl. dapp confirmation)
- Inventory totals (item counts, alchemica/GHST balances) **match the dapp's wallet/
  inventory view** for the same address (Playwright + a known test address).
- A consumable use succeeds on-chain (or sim-pass) and the gotchi's XP/kinship updates.
- 0 console errors; all item art renders with fallback.

## 8. Open questions
- Exact item-id ranges for tickets vs badges (read `itemTypes`).
- Does the dapp show non-transferable badges in inventory? (Yes — include, marked
  non-transferable / not listable.)
