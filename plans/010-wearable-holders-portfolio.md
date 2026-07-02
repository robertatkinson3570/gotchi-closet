# Plan 010: Wearable market intelligence — holder distribution per wearable + wearables in portfolio floor value

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (section "Subgraph data-gap plans").
>
> **Drift check (run first)**: `git diff --stat 60fd7c3..HEAD -- src/components/explorer/WearableDetailModal.tsx src/components/explorer/OwnedOverview.tsx src/lib/portfolio.ts src/lib/baazaar.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (read-only subgraph data; one pure-function change to portfolio math)
- **Depends on**: none (plan 007 also touches `WearableDetailModal.tsx` — if both run, coordinate the insertion order; content does not overlap)
- **Category**: direction
- **Planned at**: commit `60fd7c3`, 2026-07-02

## Why this matters

The core subgraph's `ItemTypeOwnership` entity indexes the current balance of
every wearable in every wallet (verified live 2026-07-02: top holders with
12,800+ of a single item). Nothing in the app queries it. Two features fall
out of one entity: (1) a holder-distribution section on the wearable detail
modal — "who holds this, how concentrated is it" — which no Aavegotchi tool
shows today; (2) the wallet's wearables added to the Explorer's "floor value"
card, which currently counts gotchis + GHST only and silently understates
wearable-heavy wallets. The Baazaar floor-price map needed for pricing
already exists (`fetchBaazaarPrices`).

## Current state

- Core subgraph endpoint: `CORE_SUBGRAPH` in `src/lib/subgraph.ts:9`.
- Verified live entity (2026-07-02): `itemTypeOwnerships` — fields
  `id`, `itemType { id }`, `owner`, `balance` (integer count as string),
  `lastUpdated`. Filterable by `owner` and by `itemType` + `balance_gt`.
- `src/components/explorer/WearableDetailModal.tsx` — read-only wearable
  modal; renders a 3-tile info grid (lines 45–49), lowest listing, and
  `<RecentSales kind="erc1155" tokenId={String(wearable.id)} />` at line 75.
  Holder section goes here.
- `src/components/explorer/OwnedOverview.tsx` — the Explorer "Owned" scope
  card. Key excerpts:

  ```ts
  // OwnedOverview.tsx:41-43 — cheapest active Baazaar gotchi listing = floor
  const { data: floorWei = null } = useQuery({ queryKey: qk.gotchiFloor(), … });
  // :59-63 — owned count = gotchisOwned + gotchisLentOut via user(id)
  // :69
  const totalGhst = portfolioFloorGhst({ gotchiCount, gotchiFloorWei: floorWei, ghstWei });
  // :78  "Floor value (rough)" header; :89 breakdown line:
  // {gotchiCount} gotchi{…} × {fmtGhst(weiToGhst(floorWei))} GHST floor + wallet GHST
  ```

- `src/lib/portfolio.ts` — the pure portfolio math (full file is 27 lines):

  ```ts
  export type PortfolioInputs = {
    gotchiCount: number;
    gotchiFloorWei: string | null;
    ghstWei: bigint;
  };
  export function portfolioFloorGhst(p: PortfolioInputs): number {
    const count = Number.isFinite(p.gotchiCount) && p.gotchiCount > 0 ? p.gotchiCount : 0;
    return count * weiToGhst(p.gotchiFloorWei) + weiToGhst(p.ghstWei);
  }
  ```

- `src/lib/baazaar.ts` — `fetchBaazaarPrices(): Promise<BaazaarPriceMap>`,
  a session-cached map `wearableId → { minPriceWei: bigint, … }` built from
  all open category-0 ERC1155 listings. Reuse it; do not write a new floor
  fetcher.
- `src/lib/explorer/itemMeta.ts` — `itemMetaSync(id)` for names;
  bundled `data/wearables.json` rows may include a max-quantity/supply key
  (check the JSON for the exact key before relying on it; omit supply % if
  absent).
- `src/lib/format.ts` exports `shortAddress`.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Unit tests| `pnpm test:unit` | all pass            |
| Lint      | `pnpm lint`      | exit 0              |
| Dev server| `pnpm dev`       | Vite on :5000       |

## Scope

**In scope**:
- `src/lib/explorer/wearableHolders.ts` (create)
- `src/lib/explorer/wearableHolders.test.ts` (create)
- `src/components/explorer/WearableHolders.tsx` (create)
- `src/components/explorer/WearableDetailModal.tsx` (render WearableHolders)
- `src/lib/portfolio.ts` (extend inputs with wearables value)
- `src/lib/portfolio.test.ts` (create if missing, else extend)
- `src/components/explorer/OwnedOverview.tsx` (feed wearables into the card)

**Out of scope** (do NOT touch):
- `src/lib/baazaar.ts` — consume `fetchBaazaarPrices` as-is.
- `WearableExplorerGrid.tsx` and the wearables market tab — grid UX unchanged.
- Any holder *leaderboard page* — modal section only in this plan.
- USD conversion.

## Git workflow

- Branch: `advisor/010-wearable-intel`
- Commit style: conventional commits, e.g. `feat(explorer): wearable holder distribution + wearables in floor value`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the live shape

```bash
CORE=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ byItem: itemTypeOwnerships(first:3, where:{ itemType: \"1\", balance_gt: 0 }, orderBy: balance, orderDirection: desc){ owner balance } }"}' $CORE
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ byOwner: itemTypeOwnerships(first:3, where:{ balance_gt: 0 }, orderBy: balance, orderDirection: desc){ itemType { id } owner balance } }"}' $CORE
```

**Verify**: both return non-empty arrays; `balance` is an integer string;
the `itemType` filter accepts a plain id string. Errors → STOP (note: if the
`itemType: "1"` filter errors, try `itemType_: { id: "1" }` and record which
form works — then use that form in Step 2).

### Step 2: `src/lib/explorer/wearableHolders.ts`

```ts
export type HolderRow = { owner: string; balance: number };

export async function fetchTopHolders(wearableId: number): Promise<HolderRow[]>
// itemTypeOwnerships(first: 10, where: { itemType: $id, balance_gt: 0 }, orderBy: balance, orderDirection: desc) { owner balance }

export async function fetchOwnedWearableBalances(owner: string): Promise<Map<number, number>>
// itemTypeOwnerships(first: 1000, where: { owner: $owner, balance_gt: 0 }) { itemType { id } balance }
// → Map(wearableId → balance). Lowercase $owner before sending.
```

POST to `CORE_SUBGRAPH`, GraphQL variables, throw on `json.errors`
(RecentSales pattern). `balance` → `Number()`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Unit tests

`src/lib/explorer/wearableHolders.test.ts` (mock `fetch`; model after
`src/graphql/subgraphFailover.test.ts`):
1. `fetchTopHolders` maps owner/balance and preserves descending order.
2. `fetchOwnedWearableBalances` lowercases the address and returns a Map
   keyed by numeric wearable id.
3. Both throw on GraphQL errors.

**Verify**: `pnpm test:unit -- wearableHolders` → 3+ tests pass.

### Step 4: `WearableHolders.tsx` + wire into the modal

Props: `{ wearableId: number; totalSupply?: number }`.
- `useQuery({ queryKey: ["wearable-holders", wearableId], queryFn: () => fetchTopHolders(wearableId), staleTime: 300_000 })`.
- Section "Top holders" (RecentSales table style: `max-h-48 overflow-y-auto
  rounded-lg border border-border/40`, `text-[11px]`): rank, owner
  (`shortAddress`, `font-mono`, linked to `/u/<owner>` like
  `RecentSales.tsx:66`), balance (right-aligned). When `totalSupply` is a
  positive number, append a muted percent per row
  (`balance / totalSupply`, 1 decimal).
- In `WearableDetailModal.tsx`, render
  `<WearableHolders wearableId={wearable.id} totalSupply={…} />` directly
  above `<RecentSales …/>` (line 75). For `totalSupply`, use the wearable's
  max-quantity field if present on the `ExplorerWearable` type
  (check `src/lib/explorer/wearableTypes.ts`); otherwise omit the prop.

**Verify**: `pnpm dev` → wearables tab → open a wearable → top-holders table
renders with addresses linking to profile pages.

### Step 5: Extend the portfolio math (pure function first)

In `src/lib/portfolio.ts`, extend the inputs **backward-compatibly**:

```ts
export type PortfolioInputs = {
  gotchiCount: number;
  gotchiFloorWei: string | null;
  ghstWei: bigint;
  /** Sum of (owned balance × cheapest listing) across wearables, in GHST. Optional. */
  wearablesFloorGhst?: number;
};
// portfolioFloorGhst adds (p.wearablesFloorGhst ?? 0), guarded to ≥0 finite.
```

Add/extend `src/lib/portfolio.test.ts`: existing behavior unchanged when the
field is absent; added when present; NaN/negative coerced to 0.

**Verify**: `pnpm test:unit -- portfolio` → passes.

### Step 6: Feed wearables into `OwnedOverview.tsx`

- New `useQuery` (`queryKey: ["owned-wearables-value", address]`,
  `enabled: !!address`, `staleTime: 300_000`): fetch
  `fetchOwnedWearableBalances(address)` and `fetchBaazaarPrices()` (import
  from `@/lib/baazaar`) in parallel via `Promise.all`, then
  `sum(balance × weiToGhst(priceMap[id]?.minPriceWei ?? 0))` — items with no
  open listing contribute 0 (conservative, matches the card's "rough floor"
  framing at `portfolio.ts:1-5`).
- Pass the sum as `wearablesFloorGhst` into the existing
  `portfolioFloorGhst({...})` call (line 69).
- Extend the breakdown line (line 89) with `+ wearables {fmtGhst(value)} GHST`
  only when the value is > 0.

**Verify**: `pnpm dev` → Explorer "Owned" scope with a wallet holding listed
wearables → floor value increases and the breakdown line shows the wearables
term; a wearable-less wallet shows the card exactly as before.

## Test plan

- Unit: Steps 3 and 5 (fetchers; portfolio math back-compat).
- Manual: Steps 4 and 6 checks.
- Gates: `pnpm typecheck && pnpm lint && pnpm test:unit` all exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit` exits 0 with new wearableHolders + portfolio tests
- [ ] `grep -rn "itemTypeOwnerships" src/` matches only `src/lib/explorer/wearableHolders.ts`
- [ ] Wearable modal shows "Top holders"; Owned card includes wearables value
- [ ] `portfolioFloorGhst` behavior unchanged when `wearablesFloorGhst` is omitted (test proves it)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Step 1: both `itemType` filter forms error — the schema has drifted.
- `fetchOwnedWearableBalances` returns exactly 1000 rows for a test wallet —
  pagination is needed and this plan didn't budget it; report rather than
  silently truncate.
- `OwnedOverview.tsx` no longer calls `portfolioFloorGhst` (~line 69).
- The wearable-modal insertion point (`RecentSales` at ~line 75) is gone —
  if plan 007 landed first it may have moved; find `RecentSales` and insert
  above it, but STOP if the file's structure is otherwise unrecognizable.

## Maintenance notes

- Follow-up candidates: full holder-count (paginated) + a concentration stat
  ("top 5 hold N%"), and a wearable-holder leaderboard page reusing
  `fetchTopHolders` with a larger `first`.
- The wearables value uses *listing floor*, which overstates thin markets
  (one 10,000 GHST listing ≠ the floor). If users complain, switch to the
  cheaper of (floor, last sale) using `RecentSales`' erc1155 query.
- Reviewer: `fetchBaazaarPrices` module-caches for the session; confirm the
  Owned card doesn't waterfall (both fetches in one `Promise.all`).
