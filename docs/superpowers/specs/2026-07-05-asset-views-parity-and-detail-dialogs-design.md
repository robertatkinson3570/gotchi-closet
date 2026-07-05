# Asset views parity + unified detail dialogs — design

**Date:** 2026-07-05
**Status:** Draft for review
**Area:** Explorer / Baazaar / Auction / Owned asset views (`src/components/explorer/`, `src/pages/ExplorerPage.tsx`)

## Problem

The Explorer surfaces every asset (gotchis, wearables, items, parcels, tiles, installations,
portals, FAKE gotchis/cards, forge, guardians) across four scopes — **Collection (All)**,
**Owned (mine)**, **Baazaar**, and **Auction** — but the experience is inconsistent:

1. **Em-dashes** (the long dash) appear in rendered UI strings (empty-value placeholders,
   separators, sentences), which the user wants removed.
2. **Detail dialogs aren't shareable.** Opening an asset's dialog is pure local state; there's
   no URL, so you can't link to "this wearable" or "this listing." Only `?owner=` / `?scope=`
   deep links exist today.
3. **Owned cards are bare.** `OwnedMarketGrid` cards show only `#id x qty` + image + a
   tap-to-list toggle. They don't show the asset name, whether it's already listed, the list
   price, last-sold, or open a detail dialog — everything the Baazaar `MarketGrid` cards show.
4. **No way to see/edit your list price** on an owned asset that's already listed.
5. **No auction option for owned wearables/items** — `OwnedMarketGrid` deliberately excludes
   them (`auctionKind = null`) on a stale assumption. KB confirms ERC1155 wearables/items *are*
   GBM-auctionable on Base.
6. **No prev/next navigation inside dialogs.** Every dialog shows one asset; you must close and
   re-open to view the neighbour. Wanted across all assets and all scopes.
7. **Gotchi detail modal is missing fields the dapp shows** — notably **Spirit Points**, plus
   Forge Smithing, XP-to-next-level, Age / Block Age, Equipped Set, GHST balance, named trait
   descriptors (e.g. `-11 (Zen)`), and card status badges (`listed for X GHST`, `lent out ·
   last pet`).

### Current detail-dialog landscape (five independent implementations)

| Scope / asset | Component | Notes |
|---|---|---|
| Baazaar items/parcels/... | `MarketGrid` inline modal + `ParcelDetailModal` | `detail` state = a `Listing` row |
| Owned items/parcels/... | `OwnedMarketGrid` (no modal except parcels) | bare cards, select-to-list only |
| Wearables (collection/baazaar) | `WearableDetailModal` | own component, one wearable + listing |
| Gotchis | `GotchiManageModal` (`GotchiActionsPanel`) | own component, one gotchi |
| Auctions | `AuctionDetailModal` inline in `AuctionGrid` | own component, one `Auction` |

Each owns its own modal chrome. Reqs 2, 6 (and consistency for 3, 7) need a **shared** layer.

## Requirements & decisions (confirmed with user)

- **Deep-link (2):** a URL opens the specific item's dialog (e.g.
  `/explorer?asset=wearable&id=123`), plus a copy-link button on each dialog. Works for
  owned + baazaar + auction + collection.
- **Parity scope (3):** **full parity** — owned cards show name/label, your list price if
  listed (else "not listed"), last-sold where available, click-to-open detail dialog with all
  actions (list / edit / cancel / auction / details), consistent across scopes and asset types.
- **Edit price (4):** owned + listed shows the current list price with **edit** (re-list at a
  new price) and **cancel** (delist).
- **Em-dash (1):** context-appropriate replacement (separators -> `·` or `-`; empty-value
  placeholders -> a word like `None`/`n/a`; sentence dashes -> comma/colon), chosen per case.
  Only **rendered** strings are touched — code comments and test descriptions keep their
  em-dashes (not user-visible).
- **Architecture (2/3/6):** **Option A — shared dialog shell + one nav/URL hook.** Not a single
  universal modal (too risky) and not per-modal duplication (drifts).
- **Phasing:** one spec, three independently-shippable phases.

## Architecture

Two new primitives in `src/components/explorer/detail/`:

### `useDetailNav<T>` — hook

Owns the "which item is open, and its neighbours" state, decoupled from any modal body.

```
useDetailNav<T>({
  items: T[],                       // the ordered, currently-filtered list backing the grid
  getId: (item: T) => string,       // stable id for URL + matching
  asset: string,                    // URL discriminator: "gotchi" | "wearable" | "item" | ...
  urlSync?: boolean,                // default true; false for grids that shouldn't own the URL
}) => {
  open: T | null,
  index: number,
  openItem(item): void,             // sets state + pushes ?asset=&id=
  close(): void,                    // clears state + strips params
  next(): void, prev(): void,       // clamp at ends (no wrap)
  hasNext: boolean, hasPrev: boolean,
}
```

- **URL sync:** on `openItem`, replace search params with `asset` + `id` (via
  `react-router` `useSearchParams`, `replace: true` so the back button closes rather than
  paging through history). On `close`, remove them. On mount, if the URL already carries a
  matching `asset` + `id` and that id is present in `items`, auto-open it (deep-link entry). If
  the id isn't in the loaded page yet, keep the params and open once it arrives (grids
  page/lazy-load).
- **Keyboard:** the shell (not the hook) binds the arrow keys / `Esc` while open.
- **Bounds:** arrows clamp (no wrap); `hasPrev/hasNext` disable them at the ends. Paginated
  grids (gotchis, wearables) call `loadMore()` when `next()` reaches the last loaded item and
  `hasMore` is true — nav follows the same list the grid shows.

### `DetailDialogShell` — component

The shared chrome. Renders via `createPortal` to `document.body`, `z-[80]`.

```
<DetailDialogShell
  title={ReactNode}                 // e.g. "Aagent Fedora #123"
  onClose onPrev onNext             // onPrev/onNext undefined => arrow hidden
  hasPrev hasNext
  shareUrl={string}                 // for the copy-link button
  widthClass?                       // per-asset width (gotchi 560, wearable 460, ...)
>
  {children}                        // the asset-specific BODY only
</DetailDialogShell>
```

- Sticky header: title (left) · copy-link button · prev / next · close.
- Copy-link writes `location.origin + shareUrl` to clipboard, shows a transient "Copied" state
  (same pattern as `GotchiInfoOverlay`'s owner-copy).
- Arrow keys fire `onPrev`/`onNext`; `Esc` fires `onClose`; ignored when focus is in an
  `input`/`textarea`/`select` (so typing a bid/price isn't hijacked).
- Backdrop click closes; body click stops propagation (existing behaviour).

Each of the five dialogs becomes: keep the **body** JSX, drop the bespoke outer
`fixed inset-0 ...` wrapper + header, wrap the body in `DetailDialogShell`, and feed it the
`useDetailNav` handlers from the parent grid. `ParcelDetailModal` already has its own chrome and
is shared by two grids — it gets the same treatment (shell + nav) so parcels page too.

## Phase 1 — Em-dash cleanup (req 1)

Independent, low-risk, ships first.

- **Find:** enumerate em-dash occurrences, then keep only those that reach the DOM — JSX text
  nodes, `placeholder=`, `title=`, `aria-label=`, `alt=`, toast `title`/`description` strings,
  `<option>` labels, and other rendered literals. **Exclude** code comments and `*.test.*` files.
- **Replace (context-appropriate):**
  - Empty-value placeholder (e.g. `Dist — · Size`, trait `—`, address `—`) -> `None` or `-`
    depending on space; pick the cleaner read per site.
  - Inline separators (long dash) -> ` · ` (matches the app's existing middot separators) or ` - `.
  - Sentence-level dashes -> comma / colon / parenthetical.
- **Verify:** grep the touched render paths for residual em-dashes; visual smoke check of a few
  screens (owned parcel card, wearable trait grid, auction seller row).

Known offenders already spotted: `MarketGrid` `Dist {...} — · {...}` and trait `—`;
`WearableDetailModal` `slotLabel`/trait `—`; `AuctionDetailModal` empty-address `—`;
`GotchiInfoOverlay` `formatTraitMods` `—`. A full sweep will find the rest.

## Phase 2 — Dialog shell + prev/next + deep-linking (reqs 2, 6)

1. Build `useDetailNav` + `DetailDialogShell` with unit tests for the hook (index math, bounds,
   URL param round-trip, deep-link auto-open, loadMore-at-end).
2. Migrate the five dialogs onto the shell, one change each, in this order (lowest risk first):
   **Auction -> Baazaar MarketGrid -> Wearable -> Owned -> Gotchi.** Each migration:
   - Parent grid instantiates `useDetailNav` over its already-filtered `rows`/`wearables`/`gotchis`.
   - Card `onClick` -> `openItem(row)` instead of `setDetail(row)`.
   - Dialog body wrapped in `DetailDialogShell` with `onPrev/onNext/hasPrev/hasNext/shareUrl`.
3. **URL scheme:** `?asset=<kind>&id=<tokenId>` on `/explorer` (and `/baazaar`). `asset` values
   reuse the existing `AssetType` / `itemKind` vocabulary. Auctions use
   `asset=auction&id=<auctionId>`. Deep-linking into an owned-only view requires the connected
   wallet; if the id isn't in the current scope's list, open best-effort (fetch-by-id where the
   dialog already supports it, e.g. auctions/gotchis) or fall back to landing on the tab.

Keyboard + copy-link come for free once a dialog is on the shell.

## Phase 3 — Owned-view parity (reqs 3, 4, 5, 7)

### 3a. Owned listings enrichment (`OwnedMarketGrid`)

- After loading owned tokens, batch-fetch **the connected wallet's own active listings** for
  those ids from the core subgraph (erc721Listings / erc1155Listings where `seller = address`,
  `cancelled:false`, not sold, matching category). Build `listedMap: id -> { listingId, priceWei }`.
- Card gains: asset **name/label** (reuse `itemMetaSync` / type-meta the way `MarketGrid` does),
  a **listed price** line (`{price} GHST` in emerald, or muted `Not listed`), and becomes
  **click-to-open** a detail dialog (same shell). Keep the existing multi-select bulk-list
  affordance (checkbox/tap), but the image/name area opens details.
- Detail dialog body for an owned asset shows: image, name/meta, **your listing** section:
  - **Listed:** price + **Edit** (re-list: cancel old + add new at the new price, or a single
    updateListing if the marketplace facet exposes one — verify on-chain) + **Cancel** (delist).
  - **Not listed:** price input + **List** (existing flow) + **Create Auction**.
  - **Auction** button for the asset (see 3c) + `RecentSales`.

### 3b. Reuse the shared dialog

The owned dialog is the **same** `DetailDialogShell`; only the body's action set differs
(owner actions: list/edit/cancel/auction vs buyer actions: buy/offer). A small
`ownerActions` vs `buyerActions` branch inside the shared body, keyed by "is this mine."

### 3c. Auction for owned wearables/items (req 5)

- Extend `OwnedMarketGrid.auctionKind` to include `wearable` and `item` as `erc1155`.
- **Verify on-chain before shipping:** the correct GBM `category` and that the Aavegotchi
  diamond (wearables/consumables) is whitelisted for erc1155 auctions on Base.
  `CreateAuctionButton` already uses category 4 for other erc1155; wearables may need a specific
  category. Confirm via a live Base `createAuction` (small/test) or reading GBM config; do
  **not** ship a button that reverts. If it turns out unsupported on Base today, surface a
  disabled state with a reason rather than a failing button.

### 3d. Gotchi detail field parity (req 7)

Bring the gotchi detail modal to dapp parity. Add, where data is available:

- **Spirit Points** — *source unknown in current codebase.* Verify: subgraph field on
  `aavegotchi` (e.g. `spiritForce`/`spiritPoints`) or a diamond getter. If unavailable, show
  `None` (as the dapp does) rather than omit.
- **Forge Smithing** (skill + points) — verify source (forge subgraph / diamond). Same fallback.
- **XP to next level**, **Age** + **Block Age**, **Equipped Set**, **GHST balance** (pocket),
  **named trait descriptors** (`value (Descriptor)` using the existing trait-descriptor tables).
- Card-level status badges: `listed for X GHST` (from the gotchi's listing) and
  `lent out · last pet Xh ago` (rental sets already loaded in `ExplorerPage`).

Fields whose data source can't be confirmed are shown with the dapp's own fallback (`None`) and
flagged in the plan as verification tasks — they don't block the rest of 3d.

## Data flow

- Grids remain the source of truth for the ordered list; `useDetailNav` is a thin controller
  over that list + the URL. No new global state.
- Owned listings + gotchi-detail extra fields are additional react-query reads keyed by
  token-id sets, cached like the existing enrichment queries (`staleTime` 30-60s).

## Error handling

- Deep-link to an id not in the list -> open best-effort or land on the tab; never crash.
- The `market-filter-slot` `createPortal` NotFoundError foot-gun (documented in `ExplorerPage`)
  is respected — the shell portals to `document.body`, not into a conditionally-rendered node.
- On-chain writes (list/edit/cancel/auction) reuse existing `parseRevert` + toast patterns.

## Testing

- **Unit (hook):** index math, clamped bounds, `hasPrev/hasNext`, URL param round-trip,
  deep-link auto-open, loadMore-at-end.
- **Unit (owned listings):** `listedMap` construction from mixed erc721/erc1155 subgraph rows.
- **Manual smoke:** open a dialog in each scope, arrow through neighbours, copy-link and reopen
  in a fresh tab, list->edit->cancel an owned item, auction an owned wearable (post on-chain
  verification), confirm no residual UI em-dashes.

## Out of scope

- No single universal `AssetDetailModal` (Option C) — bodies stay asset-specific.
- No new global state manager.
- No changes to buy/offer/bid contract logic beyond what parity requires.
- Unrelated refactors of the market/auction fetchers.

## Open verification items (resolved during implementation, not blockers)

1. GBM wearable/item auction **category** + diamond whitelist on Base.
2. **Spirit Points** data source (subgraph field vs diamond getter).
3. **Forge Smithing** data source.
4. Whether an ERC1155 marketplace `updateListing`/`updateERC1155Listing` exists on Base (enables
   single-tx price edit) or edit = cancel + re-list.
