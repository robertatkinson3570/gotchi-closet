# 005 — Comprehensive E2E Testing (Playwright)

**Goal:** prove GotchiCloset is 100% solid — every route, every panel, every endpoint, every
transaction-encoding path, and core usability — with a repeatable Playwright suite plus a one-time
audit pass. Production target: `https://gotchicloset.com` (chain: Base / 8453).

**This is test → find → FIX → re-run → confirm green.** Reporting findings is not the deliverable;
a green suite with zero known-broken is. Every finding gets fixed and re-verified before sign-off.

---

## 1. Definition of "100% solid" (the pass gate)

The site is signed off only when ALL of these hold, on **both** desktop (1440×900) and mobile (390×844):

1. **Renders clean** — every route mounts with **zero** `console.error` / uncaught `pageerror`,
   disconnected *and* connected.
2. **Data is real** — every data panel shows real values (no perpetual skeleton, no "empty" when the
   fixture has data); spot-checks match the source subgraph/RPC response.
3. **Endpoints healthy** — every subgraph / RPC / price / backend request returns 2xx; no silent fallbacks
   masking a failed query.
4. **Writes encode correctly** — every transaction path produces calldata whose **target contract +
   selector + decoded args** match the expected value (validated via an interception shim — no real txs).
5. **Guards correct** — disabled/insufficient-balance/wrong-network/not-owner states block the action and
   say *why*; revert messages render readable.
6. **Usable** — loading, empty, and error states are present and recover; keyboard nav + focus work; no
   critical axe (a11y) violations; mobile layout is functional (no 0×0 controls, no overflow).
7. **Resilient** — slow-network and offline don't white-screen; failed fetches surface an error, not a hang.
8. **Every finding is fixed and re-confirmed** — triaged → fixed → suite re-run green. **No known-broken at sign-off.**

---

## 2. Test architecture & tooling

- **Runner:** `@playwright/test` committed under `tests/e2e/` (repeatable + CI-able). Use the MCP
  Playwright tools for exploratory triage only.
- **Projects:** `desktop-chromium` (1440×900), `mobile-chromium` (390×844). Optionally add `firefox`/`webkit`
  for the smoke layer. **Note (proven gotcha):** the desktop search box is `hidden md:flex` → it is 0×0 at
  mobile width; viewport must be set per project.
- **Base URL:** configurable (`PROD=https://gotchicloset.com`, or a Vercel preview URL per PR).
- **Global console guard (fixture):** attach `page.on('console')` + `page.on('pageerror')`; fail the test if
  any error fires (allow-list the known benign recharts "width(-1)" sizing warning only).
- **Network guard (fixture):** record all requests; assert (a) required subgraph/RPC/backend calls fire and
  (b) none return ≥400. Helper to await + capture a specific GraphQL response for data assertions.
- **Wallet harness** (`tests/e2e/support/wallet.ts`) — the proven pattern from this session:
  `page.addInitScript` injecting an EIP-6963 `window.ethereum` that:
  - proxies all reads (`eth_call`, `eth_getBalance`, `eth_chainId=0x2105`, logs) to
    `https://base-rpc.publicnode.com`,
  - returns a configured holder for `eth_accounts` / `eth_requestAccounts`,
  - **intercepts `eth_sendTransaction`**: stores `{to, data, value}` on `window.__sentTxs`, returns a fake
    hash, and **never broadcasts**. Tests read `__sentTxs` and assert decoded calldata (viem `decodeFunctionData`).
  - Variants: `connect(holder)`, `connectEmpty()` (no assets), `disconnected()`.
- **Fixtures** (`tests/e2e/support/fixtures.ts`): pinned, stable identities/IDs so assertions are deterministic:
  - a **whale holder** with gotchis + parcels + wearables + active listings + active lendings (for owned/mine/activity),
  - a known **gotchi tokenId**, **parcel id**, **wearable id**, **active listing id**, **GBM auction id**,
    **lending id**, **whitelist id**,
  - an **empty wallet** for empty-state coverage.
  Pin these in one file; re-pin if the chain state churns.

---

## 3. Coverage matrix

### A. Cross-cutting (run on every route)
- Route mounts; correct `<title>` / SEO; no console/page errors.
- Deep-link load (navigate directly), hard refresh, browser back/forward — SPA routing intact.
- Header nav + footer links resolve; "My activity" link appears only when connected.
- 404 / unknown route → ErrorBoundary, not white screen.
- Theme, layout, no horizontal overflow at mobile width.
- `/me` redirects to `/explorer?scope=owned`; `/baazaar` renders ExplorerPage.

### B. Per-route functional specs
Each route below gets: load + console-clean, data-present assertion, every interactive control, every
detail modal, and empty/loading/error states.

| Route | Must verify |
|---|---|
| `/` Home | hero, nav CTAs, any live stats |
| `/explorer` (+`/baazaar`) | **10 tabs** (Gotchis, Wearables, Items, Parcels, Installations, Tiles, Portals, FAKE Gotchis, FAKE Cards, Forge) × **All / Owned / Baazaar** modes stay filtered across tab switches; search (by id + name — set desktop viewport!); every sort option incl. parcel **size** + land district; detail modal per category (traits/rarity/recent sales/seller/price/time); "Details" (read-only) vs "Manage" (owned) labels; infinite scroll/pagination; `?scope=owned` deep-link |
| `/gotchi/:tokenId` | full gotchi detail, traits, wearables, sales history |
| `/wearables`, `/wearable/:slug`, `/sets`, `/sets/:slug`, `/traits`, `/traits/:trait`, `/rarity-score` | index lists populate; detail pages resolve by slug; bad slug → graceful |
| `/dress`, `/wardrobe-lab` | gotchi load, equip/auto-dress engine runs, respec math, `?debug=1` panel |
| `/lending` | 53± listings load (useLendings), filters (haunt/BRS band/duration/channelling), sorts (incl. price-per-day), CSV export, detail modal, rent CTA |
| `/lending/me` | connected: lender + borrower tabs (useMyLendings), claim/return/relist actions; disconnected: clean empty |
| `/lending/analytics` | charts render (useHistoricalLendings + useAlchemicaPrices), heatmap, leaderboards, drill-down |
| `/lending/lands` | LandManagementPage parcels, access columns, channeling |
| `/lending/me/list` (BulkList) | select gotchis, configure terms, auto-price, chunked batch submit |
| `/lending/whitelists` | whitelist list, maxBorrowLimit, create/edit |
| `/activity` | feeds (Sales/Offers/Auctions) + category filters; rows show short address (`0x…`/`—`) |
| `/u/:address`, `/u/:address/activity`, `/me/activity` | **7 tabs**: listings, offers, received, auctions, bids, purchases, sales; per-row actions (cancel/claim/accept) |
| `/stats` | aggregate stats populate |
| `/dao` | Snapshot proposals + space stats, treasury, vote panel |
| `/forge` | inventory (alloy/essence/geode/core/schematic), smelt/forge/claim-geode gating, queue |
| `/get-tokens` | swap/bridge links/widgets |
| `/soul/verify/:tokenId`, `/g/:tokenId`, `/arena/:a/vs/:b` | public (no wallet) pages resolve; certificate/battle render |

### C. Endpoint & data verification
- **Subgraphs:** aavegotchi-core-base (listings, buyOrders, portals, aavegotchis, sales), gbm-baazaar-base
  (auctions, bids), gotchiverse-base (parcels) — each query returns rows; UI count == response count on a spot
  check; the `withSetsNumericTraits` field now present on all lending queries.
- **RPC reads (multicall):** balances, `tokenIdsOfOwner`, `getAavegotchi`, `getParcelInfo`,
  `getParcelsAccessRights`, forge balances/IDs, GBM auction reads — assert no failed multicall, values flow to UI.
- **Prices:** `coins.llama.fi` → alchemica/GHST; `isLive` true when reachable, graceful fallback when not.
- **Backend:** auto-renew API health, companion/soul/roast servers respond (read paths); 5xx fails the gate.
- **Caching behavior (post react-query migration):** second mount of a page within staleTime serves cache (no
  duplicate network burst); post-tx `invalidate*` triggers a refetch.

### D. Transaction-flow calldata assertions (via interception shim)
For each: connect whale → trigger UI action → read `window.__sentTxs` → `decodeFunctionData` → assert
target diamond + selector + args; also assert the **approval** step fires first where required, and that
**guards** disable the action (empty wallet / not owner / insufficient GHST / wrong network).

- **Baazaar:** buy ERC721/1155 listing, `executeERC721/1155BuyOrder`, place buy order (make offer)
  721/1155, `addERC721Listing`/`setERC1155Listing`, cancel listing/offer, update price.
- **GBM auctions:** `setApprovalForAll` → `createAuction` (selector `0xd4e42fea`, 8-field tuple, correct
  tokenKind/category/preset), bid (min-next-bid math), buy-now, claim, cancelAuction.
- **Lending:** add single + **bulk chunked** add (verify chunk size vs gas), agree/rent (+ bulk rent),
  claim&end / return, claim tokens, auto-renew operator set + subscription pay (GHST→wei via `ghstToWei`).
- **Forge:** smelt, forge-from-schematic, claim geode (VRF), multi-claim — and the gating that disables when
  not forgeable / already queued.
- **Gotchi:** equip wearables, use consumables, channel alchemica, pet, set pet operator, soul seal,
  spend skill points/respec, GHST + per-diamond `setApprovalForAll`.

### E. Usability / a11y / resilience
- Loading skeletons appear then resolve; **no infinite spinner**.
- Empty states (empty wallet, no listings in a filter) show a message, not a blank.
- Error states: throttle to `offline` / inject a 500 on a subgraph route → UI shows an error + retry, no hang/white-screen.
- Disabled CTAs state the reason (connect / wrong network / insufficient balance / not owner).
- Toasts fire on action success/failure; revert messages parsed & readable.
- Keyboard: tab order, focus-visible, modals trap focus + close on Esc.
- `axe-core` scan per route → zero critical/serious violations.
- Mobile: nav drawer, sheets (sort/filter), no 0×0 controls, no overflow.

### F. Dapp-parity spot checks (optional but recommended)
For a handful of pages (Baazaar counts, a gotchi's traits, an auction's min-next-bid, a parcel's size),
compare GotchiCloset values against `dapp.aavegotchi.com` for the same id, within tolerance — catches data
mismaps the unit checks can't.

---

## 4. Execution phases (each phase: run → fix every finding → re-run green before moving on)

- **Phase 0 — Harness:** Playwright config, projects, wallet shim, fixtures, console/network guards, axe helper.
- **Phase 1 — Smoke:** every route loads, 0 console errors, disconnected (fast regression net; wire to CI first).
- **Phase 2 — Read/data:** §B + §C — tabs, filters, sorts, search, detail modals, endpoint/data assertions.
- **Phase 3 — Connected reads:** owned scopes, `/lending/me`, `/u/:address` tabs, forge inventory (whale fixture).
- **Phase 4 — Write calldata:** §D — every tx path asserted via the shim.
- **Phase 5 — Usability/resilience:** §E — a11y, keyboard, mobile, slow-net/offline, empty/error states.
- **Phase 6 — Parity spot checks:** §F.
- **Phase 7 — Final triage→fix→re-run:** every remaining failure logged with repro; fix; re-run until the §1
  gate is fully green on both viewports.

---

## 5. Finding → fix → confirm loop (the core workflow)

For every failure the suite (or exploratory MCP pass) surfaces:
1. **Capture** — failing spec, route, repro steps, console/network trace, screenshot (Playwright trace-on-failure).
2. **Triage** — bug class: data/endpoint, encoding, guard logic, UI/usability, a11y, or test-harness defect.
   (A flaky/incorrect test is a finding too — fix the test, don't paper over it.)
3. **Fix** — patch the app (or test) with the smallest correct change; build green.
4. **Re-run** the affected spec(s) → pass; then re-run the **full suite** to catch regressions.
5. **Deploy + re-verify on prod** for anything that only reproduces against live data/endpoints.
6. **Log** the fix (commit ref) against the finding. A finding is closed only when its spec is green.

Sign-off = the §1 gate green on desktop + mobile, **zero open findings**.

---

## 6. Deliverables
- `tests/e2e/` — spec files grouped by area (`smoke.spec`, `explorer.spec`, `lending.spec`,
  `activity.spec`, `forge.spec`, `tx/*.spec`, `a11y.spec`, `resilience.spec`).
- `tests/e2e/support/` — `wallet.ts` (EIP-6963 shim), `fixtures.ts` (pinned ids), `guards.ts`
  (console+network), `axe.ts`.
- `playwright.config.ts` — projects, baseURL, retries, trace-on-failure, HTML report.
- `.github/workflows/e2e.yml` — run smoke on every PR (against the Vercel preview), full suite nightly.
- A coverage checklist mirroring §3 (the literal sign-off sheet) + a findings log (open/fixed/confirmed).

---

## 7. Decisions to confirm before Phase 0
1. **Write flows = interception shim (recommended), not real txs.** Base is mainnet-only; real txs cost GHST/ETH
   and mutate chain state, so the automated suite must assert *calldata*, not broadcast. (A couple of low-value
   write paths could be manually fired once if you want true end-to-end proof — out of the automated suite.)
2. **Committed `@playwright/test` suite + CI** (recommended) vs a one-time MCP-driven audit only. Recommend
   both: build the suite, and its first full run *is* the audit.
3. **Backend depth:** health/read assertions for auto-renew/companion/soul/roast endpoints — yes for liveness,
   but no real writes against them.
4. **Fixture maintenance:** pinned mainnet ids will drift (listings sell, auctions end). Accept periodic re-pin,
   or stand up a small mock-subgraph layer for the deterministic data tests (heavier; not recommended initially).
