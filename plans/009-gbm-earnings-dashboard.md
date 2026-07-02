# Plan 009: GBM earnings dashboard — bid-to-earn payouts, trader scorecard, seller P&L

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (section "Subgraph data-gap plans").
>
> **Drift check (run first)**: `git diff --stat 60fd7c3..HEAD -- src/pages/UserActivityPage.tsx src/lib/subgraph.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (read-only; one new tab on an existing page)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `60fd7c3`, 2026-07-02

## Why this matters

GBM's signature mechanic is bid-to-earn: outbid bidders receive GHST
incentives. The GBM subgraph indexes every payout (`Incentive`), a per-wallet
scorecard (`User`: bids/outbids/wins/payoutAmount), and a per-auction fee
breakdown (`Auction.sellerProceeds/platformFees/gbmFees/royaltyFees`) — all
verified live 2026-07-02 with real data (e.g. a 46 GHST incentive hours old).
The app shows `dueIncentives` on live auctions but never what anyone actually
*earned*, and the official dapp doesn't surface it either. "You earned X GHST
from being outbid" + seller net-proceeds is a unique retention feature that
slots into the existing My Activity page.

## Current state

- GBM endpoint: `GBM_SUBGRAPH` in `src/lib/subgraph.ts:13`
  (`…/aavegotchi-gbm-baazaar-base/prod/gn`).
- Verified live GBM entities (2026-07-02):
  - `incentives(where: { earner: $a })` — fields `earner`, `amount` (wei),
    `receiveTime` (unix), `tokenId`, `contractAddress`, `auctionID`.
  - `users(where: { id: $a })` / `user(id: $a)` — `id` is **Bytes**
    (lowercase address); fields `bids`, `outbids`, `wins`, `payouts`,
    `payoutAmount` (wei), `bidAmount`, `totalAuctionsCreated`.
  - `auctions(where: { seller: $a, claimed: true })` — fields
    `sellerProceeds`, `platformFees`, `gbmFees`, `royaltyFees`,
    `totalBidsVolume` (all wei), plus the usual `id type tokenId contractAddress endsAt`.
- `src/pages/UserActivityPage.tsx` — the integration point. Key facts:
  - Route param page (`useParams`), tabs typed at line 71:
    ```ts
    type TabKey = "listings" | "offers" | "received" | "auctions" | "bids" | "purchases" | "sales";
    ```
  - Shared `gql(url, query, variables)` helper at lines 64–69 (raw fetch,
    throws on `json.errors`).
  - Existing GBM fetchers to mirror: `fetchAuctionsCreated` (line 123,
    queries `GBM_SUBGRAPH` with `where: { seller: $a }`) and `fetchBids`
    (line 140, `where: { bidder: $a }`, lowercases the address at line 142).
  - `gbmKind(contract, type)` at line 111 maps a GBM `contractAddress` to
    `{kind, category}` — reuse it if you show per-item rows.
  - lucide icons are imported at line 5 (`Gavel`, `Coins`, …) — `Coins` is a
    fitting tab icon for Earnings.
- `src/lib/explorer/itemMeta.ts` — `itemMetaSync(tokenId)?.name` for wearable
  names on incentive rows (only meaningful for wearable auctions; fall back
  to `#tokenId`).
- Formatter conventions: local `ghst(wei)` helpers (see
  `UserActivityPage.tsx:53-57`); relative time via the local `ago()` helper
  (lines 58–63).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Unit tests| `pnpm test:unit` | all pass            |
| Lint      | `pnpm lint`      | exit 0              |
| Dev server| `pnpm dev`       | Vite on :5000       |

## Scope

**In scope**:
- `src/lib/gbmEarnings.ts` (create — fetchers + aggregation, unit-testable)
- `src/lib/gbmEarnings.test.ts` (create)
- `src/components/explorer/GbmEarningsPanel.tsx` (create)
- `src/pages/UserActivityPage.tsx` (add the tab + render the panel)

**Out of scope** (do NOT touch):
- `AuctionGrid.tsx` — live-auction UX unchanged.
- Any on-chain claim path — incentives are paid automatically by GBM; there
  is nothing to claim here.
- `StatsPage.tsx` — protocol-wide GBM stats are a separate idea.

## Git workflow

- Branch: `advisor/009-gbm-earnings`
- Commit style: conventional commits, e.g. `feat(activity): GBM earnings tab — incentives, scorecard, seller P&L`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the live shapes

```bash
GBM=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ incentives(first:2, orderBy: receiveTime, orderDirection: desc){ earner amount receiveTime tokenId contractAddress auctionID } users(first:1, orderBy: payoutAmount, orderDirection: desc){ id bids outbids wins payoutAmount totalAuctionsCreated } auctions(first:1, where:{claimed:true}){ id sellerProceeds platformFees gbmFees royaltyFees } }"}' $GBM
```

**Verify**: all three arrays non-empty, fields exactly as named. Errors → STOP.

### Step 2: `src/lib/gbmEarnings.ts`

```ts
export type IncentiveRow = { amountGhst: number; receiveTime: number; tokenId: string; contractAddress: string; auctionId: string };
export type GbmScorecard = { bids: number; outbids: number; wins: number; payoutGhst: number; auctionsCreated: number } | null;
export type SellerSale = { auctionId: string; tokenId: string; contractAddress: string; type: string; endsAt: number; proceedsGhst: number; platformFeesGhst: number; gbmFeesGhst: number; royaltyFeesGhst: number };

export async function fetchIncentives(addr: string): Promise<IncentiveRow[]>
// incentives(first: 500, where: { earner: $a }, orderBy: receiveTime, orderDirection: desc)
export async function fetchScorecard(addr: string): Promise<GbmScorecard>
// user(id: $a) — returns null when the wallet has no GBM history
export async function fetchSellerSales(addr: string): Promise<SellerSale[]>
// auctions(first: 200, where: { seller: $a, claimed: true }, orderBy: endsAt, orderDirection: desc)
```

- POST to `GBM_SUBGRAPH` (import from `@/lib/subgraph`); lowercase `addr`
  before sending (GBM `User.id`/`earner` are Bytes — mirrors
  `UserActivityPage.tsx:142`); GraphQL variables, not interpolation; throw on
  `json.errors`.
- Convert all wei strings with `Number(wei) / 1e18`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Unit tests

`src/lib/gbmEarnings.test.ts` (mock `fetch`):
1. `fetchIncentives` lowercases the address variable and converts wei→GHST.
2. `fetchScorecard` returns `null` when `user` is null.
3. `fetchSellerSales` maps all four fee fields.

**Verify**: `pnpm test:unit -- gbmEarnings` → 3+ tests pass.

### Step 4: `GbmEarningsPanel.tsx`

Props: `{ address: string }`. Three `useQuery`s (keys
`["gbm-incentives", addr]` etc., `staleTime: 60_000`). Layout, top to bottom:

1. **Scorecard strip** — 4 stat tiles in a `grid grid-cols-2 sm:grid-cols-4 gap-2`
   (visual pattern: the 3-tile grid in `WearableDetailModal.tsx:45-49`,
   `rounded bg-muted/30 py-1.5 text-center`): `Earned from outbids`
   (`payoutGhst` GHST, emerald), `Bids` (with `outbids` as muted subtext
   "N outbid"), `Auctions won` (`wins`), `Auctions created`.
   When scorecard is `null`: single muted line "No GBM activity for this wallet."
2. **Incentive history** — scrollable table (RecentSales table style:
   `max-h-48 overflow-y-auto rounded-lg border border-border/40`, `text-[11px]`):
   columns Item (`itemMetaSync(tokenId)?.name ?? '#'+tokenId`), Amount
   (GHST, emerald, right-aligned), When (`ago(receiveTime)`). Show a summed
   header line: `Total: {sum} GHST across {n} payouts`.
3. **Seller P&L** — table of `SellerSale` rows: Item, Net proceeds (GHST),
   Fees (platform+gbm+royalty summed, muted, with a `title=` tooltip
   breaking down the three), When. Only render the section when non-empty.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 5: Add the tab to `UserActivityPage.tsx`

1. Extend the union: `type TabKey = … | "earnings"` (line 71).
2. Locate where tabs are declared/rendered (search the file for the array or
   map that pairs `TabKey` values with labels/icons — it references the
   icons imported at line 5). Add `earnings` with label "Earnings" and the
   `Coins` icon.
3. Where tab content renders: when the active tab is `earnings`, render
   `<GbmEarningsPanel address={addr} />` (the page already has the profile
   address from `useParams` — reuse the same variable the other fetchers
   receive) instead of the generic `Item[]` list. Do NOT force the earnings
   data through the page's `Item` type.

**Verify**: `pnpm dev` → open `/u/<address-with-gbm-history>` (use an
`earner` address from Step 1's output) → Earnings tab shows scorecard,
incentives, and (if the address sold) seller P&L; other tabs unaffected.

## Test plan

- Unit (Step 3): address lowercasing, null scorecard, fee mapping.
- Manual (Step 5): a wallet with incentives, and a fresh wallet (all-empty
  states render cleanly).
- Gates: `pnpm typecheck && pnpm lint && pnpm test:unit` all exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit` exits 0 with ≥3 new gbmEarnings tests
- [ ] `grep -rn "incentives(" src/` matches only `src/lib/gbmEarnings.ts`
- [ ] My Activity page has a working Earnings tab; existing tabs unchanged
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Step 1 curl errors or any of the three entity shapes mismatch.
- `UserActivityPage.tsx` no longer has the `TabKey` union at ~line 71 or its
  tab-rendering structure is unrecognizable vs the excerpts here.
- You need to change the page's shared `Item` type to make earnings fit —
  that's the wrong direction; the panel renders its own types.

## Maintenance notes

- Follow-up candidates: a "GBM leaderboard" page reusing `fetchScorecard`'s
  query with `orderBy: payoutAmount` (top earners), and surfacing
  `dueIncentives`→realized-incentive deltas on live auctions in `AuctionGrid`.
- If GBM adds new fee fields, the tooltip breakdown in the Seller P&L table
  is the only place to extend.
- Reviewer: check the wei→Number conversion — payout totals can exceed 2^53
  wei; converting via `Number(wei)/1e18` is the repo-wide convention and fine
  for display, but do not sum in wei with `Number`.
