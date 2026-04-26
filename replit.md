# GotchiCloset

## Overview
GotchiCloset is a React/TypeScript web application for Aavegotchi that enables users to dress their Gotchis with wearables. It aims to provide a comprehensive and intuitive platform for Aavegotchi enthusiasts to explore, manage, and optimize their Gotchi and wearable collections. Key capabilities include a multi-asset explorer for Gotchis and Wearables, a powerful Wardrobe Lab for trait optimization, and a unique "Catwalk" feature for showcasing dressed Gotchis.

## User Preferences
The user wants the agent to be efficient and prioritize core functionalities. The agent should focus on implementing features that enhance user interaction with their Gotchis and wearables, such as improved browsing, filtering, and optimization tools. The agent should ensure that new features are integrated seamlessly and existing functionalities are robust. When making changes, the agent should aim for clean and modular code, particularly in the `src/components/explorer/` and `src/lib/explorer/` directories for explorer-related enhancements.

## System Architecture
The application is built with a React 18 frontend using TypeScript and Vite, styled with Tailwind CSS. State management is handled by Zustand and React Query. Web3 interactions leverage Wagmi, Viem, and ethers.js. The backend is an Express.js API server.

**UI/UX Decisions:**
- **Theming:** Features a dark, ghostly, and haunted aesthetic, particularly for the "Catwalk" modal, incorporating elements like floating orbs, portal swirls, mist, and sparkles.
- **Responsive Design:** Utilizes responsive grids and mobile-optimized components (e.g., bottom sheets, sticky headers) for a consistent experience across devices.
- **Asset Exploration:** Provides high-density, responsive grids for both Gotchi and Wearable explorers, featuring infinite scroll with lazy loading. Filters are collapsible, and sorting options are comprehensive.
- **Catwalk:** Implements a 3D perspective runway with animated Gotchis, preloading assets for a smooth user experience.
- **GotchiCards:** Displays key information like token ID, haunt, BRS, level, kinship, trait bars, and eye rarity. **Trait rows now show breakdown sublabels** (e.g., "Wearables: -2 | Sets: +3") when wearables or sets are contributing modifiers, making it clear why final trait values differ from base.
- **Editor Panel:** Sleek, compact design with gradient borders matching the site's purple/violet theme. Features icon-based action buttons in a grid layout, and the "Build Applied" section spans the full width at the bottom for consistent spacing whether a build is applied or not.
- **Modals & Drawers:** Uses full-screen modals for features like Catwalk and detail drawers for Gotchi information, with collapsible sections.

**Technical Implementations:**
- **Wearables Explorer:** Includes functionality for "All", "Owned", and "Baazaar" modes, displaying images, names, rarity, slot, trait modifiers, and BRS. It supports various filters (Slot, Rarity, Sets, Trait modifiers) and sorts (Name, ID, Rarity, Slot, Total Stats, Quantity, Price). "Owned" mode shows all wallet wearables with quantity badges, supporting multi-wallet addresses.
- **Gotchi Explorer:** Offers comprehensive filtering (Token ID, name, rarity, traits, level, wearables, haunt, GHST pocket, equipped set, double mythical eyes, GHST balance) and sorting options (rarity, level, kinship, XP, token ID, traits, price). It includes a "Family Photo" view for owned Gotchis and a "Take a Picture" feature. **Server-side filtering** is implemented for the "All" tab - filters like token ID, name, rarity range, level, haunt, GHST pocket, and equipped set are passed to the GraphQL query, returning matching gotchis from the entire database rather than filtering locally loaded data. Filters that can't be done server-side (trait ranges, double myth eyes, wearable counts) are applied client-side after the server response.
- **Spirit Force Colors:** Explorer gotchis now render with correct on-chain spirit force colors matching their collateral type. The `GotchiSvg` component uses preview mode with proper type coercion for `gotchiId` (String) and `tokenId` (String in transformGotchi) to ensure all gotchis use the preview endpoint with collateral data rather than falling back to the direct SVG endpoint.
- **Wearable Modifier Patches:** The wearable fetcher in `src/graphql/fetchers.ts` includes a patch system (`WEARABLE_MODIFIER_PATCHES`) to correct known-incorrect trait modifiers from the subgraph. This ensures wearables like Rofl pets apply correct NRG/BRN-only modifiers (e.g., Uncommon Rofl = NRG -1, BRN -1). **Important:** When any equipped wearable has a patch, `computeBRSBreakdown()` in `rarity.ts` bypasses the subgraph's pre-computed `modifiedNumericTraits`/`withSetsNumericTraits` and uses locally computed traits instead, since the subgraph values were computed with incorrect wearable data.
- **Wearable Set Data Fixes:** The `data/wearableSets.json` file includes corrections for all 149 wearable sets, verified against the official wiki at https://wiki.aavegotchi.com/en/sets. The original data had systematic errors where BRS values were incorrectly placed in the NRG slot and trait modifiers were scrambled. All sets now have correct trait bonuses [NRG, AGG, SPK, BRN] and BRS values.
- **Catwalk:** Animates Gotchis walking a runway in rarity order, each performing a deterministic "model-style" move. It includes a progress counter and respects `prefers-reduced-motion`.
- **Wardrobe Lab:** A wizard-style optimization tool for Gotchis supporting multi-wallet, with respec simulation to optimize traits towards extremes (0 or 99) and considering wearable/set delta modifiers. Results display BRS before/after values and wearable images.
- **Mommy Dress Me Engine (`src/lib/autoDressEngine.ts`):** Auto-dresser with the following rules:
  - **Always starts naked:** Ignores currently equipped wearables when calculating optimizations. Never early-exits claiming "already optimized."
  - **Trait Direction Rules:** Traits below 50 improve by moving DOWN (toward 0), traits above 50 improve by moving UP (toward 99). Wearables with harmful modifiers (wrong direction) are filtered out during pruning.
  - **Extremity Scoring:** Uses distance from 50 as the optimization metric. A trait at 5 has extremity 45, trait at 95 has extremity 45 - both equally valuable.
  - **Modes:** Max BRS (maximize total BRS), One Dominant (maximize single trait extremity), Dual (maximize top 2 trait extremities equally), Balanced (minimize variance while maximizing average extremity).
  - **Naked Baseline Comparison:** Threshold checks compare final build against naked gotchi, not dressed state. This prevents false "no improvement" results.
- **Wearable Selector:** Features a 3-way toggle for "All | Owned | Baazaar". "Baazaar" mode displays GHST prices fetched from the Goldsky Base core subgraph. "Owned" mode shows only owned wearables with inventory counts, which decrement upon equipping.
- **Multi-wallet Support:** Allows adding up to 3 additional wallet addresses, with Gotchis loaded from all active wallets.
- **"Lock & Set" Feature:** Enables reserving wearables for a specific build, excluding them from the available pool.
- **Best Sets Feature:** Displays all wearable sets ranked by projected BRS gain, using reference data from `aadventure.io`. Clicking a set filters wearables to that set. **Data cleaned** to remove duplicate entries (e.g., both "Mythical Wizard" and "Wizard (Mythical)") and phantom sets that don't exist in wearableSets.json. All 149 Best Sets entries now map 1:1 to actual sets. **Name matching** handles inconsistent naming between data sources: tries exact match first, then transforms "SetName (Rarity)" → "Rarity SetName" pattern, then falls back to stripped base name.
- **Respec Simulator:** Uses `computeSimTraits()` to calculate `simBase` and `simModified` traits, fetching birth traits via contract calls.

## Lending Marketplace

A first-class lending product wired to the Aavegotchi `LendingFacet` on Base diamond `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`, sourcing reads from the Goldsky `aavegotchi-core-base/prod/gn` subgraph. Three primary surfaces: marketplace (`/lending`), per-user dashboard (`/lending/me`), and analytics (`/lending/analytics`).

**Marketplace (`/lending`):**
- Lists every active listing (cancelled=false, completed=false, borrower=null) with paginated fetch up to 4000 items.
- Filters: search (gotchi #, name, owner address), BRS bands, duration buckets, "duration is at least N hours/days" with unit toggle, upfront price min/max, lender/borrower split, **whitelist mode** (any/open/whitelisted/rentable-by-me) PLUS exact whitelist ID, channelling tri-state (All/Allowed/Disabled), kinship min, haunt chips. Mirrors the dapp.aavegotchi.com filter set with extras for power users.
- Sort: newest, price, BRS, duration, level, kinship — both asc/desc.
- Hotkeys: `/` focuses search, `Esc` closes detail modal, `f` toggles filter sidebar. Native `keydown` listener (not `react-hotkeys-hook`) for deterministic Playwright behavior.
- URL state: `?owner=0x…` pre-applies a search; `?l=<id>` deeplinks the detail modal so listings are shareable.
- CSV export of the visible (filtered+sorted) result set.
- Saved searches persist via localStorage with a save/apply chip bar.
- Mobile (≤lg): filters move to a bottom-sheet drawer with body-scroll lock and a sticky "Show N listings" footer button.

**Detail modal (`LendingDetailModal`):** Click any card or hit `?l=<id>`. Renders price, period, splits, lender, channelling state, gotchi traits + SVG, plus action buttons (rent / cancel / claim-and-end / borrower return) gated by status and connected wallet. Includes the self-rent guard described below.

**Per-user dashboard (`/lending/me`):** Tabs for Unlisted / Active / Rented / Borrowing / Ended / Auto-renew. P&L summary across as-lender vs as-borrower flows. The `Unlisted` tab is the primary listing entry point; clicking a gotchi opens `ListLendingModal`.

**Bulk listing (`/lending/me/list`):** 3-step wizard. Step 1 selects across all connected + multi-wallets via parallel `useQueries`. Step 2 sets period (Days/Hours toggle, see below), splits, channelling, whitelist; with per-gotchi price overrides and an Auto-price-all action that runs `autoPriceBatch` against historical comps. Step 3 collapses N gotchis into **one** `batchAddGotchiListing` transaction. Multi-wallet selections are split: gotchis owned by non-connected wallets are skipped with a "switch wallet and rerun" banner rather than failing one-by-one.

**Listing modal (`ListLendingModal`):**
- Period: Days/Hours toggle. Days presets 1/3/7/14/30 (max 30, protocol cap). Hours presets 1/4/8/12/24 (max 720). Switching units converts the value (×24 / ÷24). Min period is 1 hour.
- Lender/Borrower split (`splitOwner` / `splitBorrower`) only — `splitOther` is always 0 and the third-party-address UI was removed entirely. The fee model moved off-chain to the auto-renew subscription. Splits sum to 100; borrower computed as `100 - splitOwner`.
- Auto-price button calls into `src/lib/lending/autoPrice.ts` which beam-searches across (period × goal) using a 4-tier comp matching strategy: same band+bucket → same band any duration → channelling-mode comps any-BRS → kinship-scaled alch-yield floor. Mode-aware splits: battler-mode 80/20, channelling-mode 50/50.
- Auto-renew section reveals the subscription tier picker (see below) when toggled on.
- Modal can be closed at any time (Esc, backdrop, X), even during a pending tx — the on-chain transaction continues regardless of modal state. Tooltip on the X clarifies this.
- Tx-hash banner with BaseScan link appears the moment `tx.data` is set, so users can verify success themselves if `useWaitForTransactionReceipt` polling hangs.

**Analytics (`/lending/analytics`):** Hero stats (lendings agreed, total upfront volume, median price, channelling premium %), 7×7 BRS-band × duration-bucket median heatmap with paid-count overlay, BRS-band stats table, price/duration/BRS histograms, top-lender/borrower/whitelist leaderboards, recent feed, and a SuggestedPriceWidget with multi-tier match labels. Window selector (7d/30d/60d/90d). All cells/rows/badges are click-to-drill: opens `DrillDownPanel` with the matching subset, including SVG previews. Note: this page only shows lendings where `timeAgreed > 0` (real rentals) — open-but-unrented listings appear on `/lending` and `/lending/me`, not here.

**Auto-renew subscription model (1 GHST per 30 days):**
- Off-chain billing replaces the broken on-chain `splitOther` fee model. The protocol's `splitOther` only captures channelled alchemica, so battler-only renters generated zero fee revenue.
- Tier table (kept in lockstep between `src/components/lending/ListLendingModal.tsx` SUBSCRIPTION_TIERS and `server/lending/subscriptionPricing.ts`): 1mo/1 GHST, 3mo/2.5 GHST (~17% off), 6mo/4.5 GHST (~25% off), 12mo/8 GHST (~33% off).
- Lender flow: list with auto-renew on → tx confirms → modal stays open showing a "Pay X GHST · N days" button → user signs ERC-20 transfer to operator hot wallet → backend verifies the tx via viem's `getTransactionReceipt` (decodes Transfer event, matches from/to/value exactly) → subscription credited with idempotent `payment_tx_log`. Replays return 409.
- Strict expiry: cron checks `expires_at > now()` before each `maybeRelist`; never auto-renews past paid term. No autopay.
- Renewing early extends from `max(now, current expires_at)` so paid time isn't lost.
- AutoRenewTab shows per-row status ("12d left" / "Expired" / "Unpaid", color-coded) plus inline 1/3/6/12 mo extend buttons. Bar appears when expiring soon (≤5 days), expired, or never paid.

**Auto-renew backend (`server/lending/`, deployed to VPS at `srv1360330`):**
- Express + better-sqlite3 + node-cron, single docker-compose project (`-p gotchicloset`). Container `gotchicloset-autorenew` listens on `127.0.0.1:8791`, fronted by nginx on `api.gotchicloset.com` with Let's Encrypt cert.
- DB tables: `templates` (per-token relist params), `relist_log` (history with success/error/ts), `subscriptions` (token_id PK, owner, months_paid_total, expires_at, last_payment_*), `payment_tx_log` (tx_hash PK for replay-protection).
- `relist.ts` distinguishes 4 states via subgraph: `none` / `open` / `rented_active` / `rented_expired`. For `rented_expired` the operator wallet calls `claimAndEndGotchiLending` (authorized via the user's prior `setLendingOperator`) to free the gotchi from escrow, then re-lists in the same tick.
- Cron runs every 2 min. Quiet logs when 0 active subscriptions.
- Admin endpoints for VPS-internal inspection: `GET /admin/active` (active subs with daysLeft + ISO expiry), `GET /admin/subscriptions` (all incl. expired). Health endpoint includes both `enabledCount` and `activeSubscriptions`.
- Deploy via self-hosted GitHub Actions runner labeled `gotchicloset-vps`. Workflow auto-triggers on `server/**` pushes; one-shot `setup-nginx-tls.yml` for cert install. Hot wallet `0x737587601e05004a7B8BD7c539B4BED97690ecF3` (separate from the user's main wallet); private key in `/root/gotchicloset/.env` as `AUTORENEW_HOT_WALLET_KEY`.

**Cache invalidation pattern:** Every successful lending tx (list / batch / cancel / claim-and-end / rent / approve) fires three layers of invalidation: `invalidateLendingsCache()` (in-memory marketplace cache), `invalidateMyLendings()` (pubsub for `/lending/me`), and `scheduleGotchiInvalidation()` (TanStack Query key `["gotchis"]`). Each fires immediately, then again at 6s and 20s to cover Goldsky's typical 5-15s indexer lag — users see the new state without ever hitting hard refresh.

**Critical encoding gotchas (verified empirically against on-chain `getGotchiLendingFromToken`):**
- **`permissions` field for channellingAllowed:** `0x101` (bit 0 + bit 8) when channelling is allowed; `0x0` when disabled. Bit 0 alone is the channelling permission; bit 8 matches the official dapp's convention. Earlier code had this inverted (`channelling ? 0 : 1`) which silently produced listings with channelling off when users checked the box.
- **`chainId` pinned to BASE_CHAIN_ID on every `writeContract` call** (12 in `useLendingTx.ts`, 2 in `useRentLending.ts`). Wagmi 2 reads this and prompts the wallet to switch to Base before signing. Without pinning, a stale `useChainId()` could let a tx route to the wallet's currently-selected chain (Polygon, Ethereum, etc.) where the diamond doesn't exist or behaves differently — manifesting as "tx succeeds but no listing appears."
- **`splitOther` always 0** post-subscription-model migration. UI for third-party address and 3rd-party split percentage was removed from both `ListLendingModal` and `BulkListPage`.

**Self-rent guard:** `RentAction` returns an explicit "this is your own listing — use Cancel" notice when the connected wallet matches `lender` or `originalOwner`. The diamond would revert anyway; this surfaces the message before a wallet-level error.

**E2E test coverage (`tests/e2e/lending-e2e.spec.ts`):** 31 Playwright tests across home/nav, marketplace (load, filter chips, sort, search, hotkeys, card→modal, ?owner=, ?l= deeplink, clear-all), all 7 new filters, mobile drawer + horizontal-overflow at 375px, CSV export, saved-search round-trip, analytics (heatmap, hero stats, leaderboards, window selector, suggested-price, drill-down), and no-wallet prompt paths. Runs against dev or prod via `BASE_URL`. Wallet-gated flows (rent/list/cancel) are not in the spec yet — they require a Synpress + funded test-wallet setup that's not wired up.

## External Dependencies
- **Goldsky Subgraph:** Used for fetching Aavegotchi data, including user item balances, wearables, Baazaar listings, and all lending data (active listings, historical lendings, whitelists). Endpoint: `aavegotchi-core-base/prod/gn`.
- **Aavegotchi Diamond Contract (Base):** `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`. Interacted with via contract calls (e.g., `getGotchiBaseNumericTraits`, `addGotchiListing`, `batchAddGotchiListing`, `cancelGotchiLendingByToken`, `claimAndEndGotchiLending`, `agreeGotchiLending`, `setLendingOperator`). LendingFacet hosted at `0xA18510f2ABA401A26E94c61de356B6caA9df2761` per DiamondLoupe.
- **GHST token (Base):** `0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB`. Used for upfront rental payments (borrower → lender) and auto-renew subscription fees (lender → operator hot wallet).
- **Auto-renew API (`api.gotchicloset.com`):** Self-hosted Express service backing `/lending/me` auto-renew tab and the cron-driven relist loop. Configured in client via `VITE_AUTORENEW_API_URL`.
- **WalletConnect:** For connecting user wallets (optional, configured via `VITE_WALLETCONNECT_PROJECT_ID`).
- **Base RPC URL:** For blockchain interactions (`VITE_BASE_RPC_URL`).
- **aadventure.io:** Provides reference data for wearable sets (`data/setsByTraitDirection.json`).
- **wiki.aavegotchi.com:** Used as a fallback source for specific Base chain wearable images.