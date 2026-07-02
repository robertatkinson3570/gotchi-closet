# Plan 008: Show per-asset price history and trade provenance (historicalPrices / timesTraded)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (section "Subgraph data-gap plans").
>
> **Drift check (run first)**: `git diff --stat 60fd7c3..HEAD -- src/components/explorer/RecentSales.tsx src/components/explorer/GotchiActionsPanel.tsx src/lib/subgraph.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (pure read-only addition; one new component)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `60fd7c3`, 2026-07-02

## Why this matters

Every Aavegotchi, portal, and parcel entity in the core subgraph carries its
full lifetime sale-price array (`historicalPrices: [BigInt!]`) and trade count
(`timesTraded`) — e.g. gotchi #4552 returns 12 prices (verified live
2026-07-02). The app renders `RecentSales` (last 25 Baazaar fills for a
token) but never these lifetime fields, so users can't see an asset's price
trajectory before buying or listing. One extra query per detail view gives a
price sparkline plus "traded N times" provenance — the cheapest
high-visibility feature the subgraph offers, and groundwork for the
"baazaar provenance" product direction already noted in `plans/004-roadmap.md`.

## Current state

- Core subgraph endpoint: `CORE_SUBGRAPH` in `src/lib/subgraph.ts:9`
  (`…/aavegotchi-core-base/prod/gn`).
- Verified live entity fields (2026-07-02): `aavegotchi(id) { historicalPrices timesTraded }`,
  same fields on `portal(id)` and `parcel(id)` (core subgraph's parcel, NOT
  the gotchiverse one). Prices are wei strings, oldest→newest; `timesTraded`
  is a BigInt string.
- `src/components/explorer/RecentSales.tsx` — the exemplar detail-section
  component this plan mirrors:

  ```ts
  // RecentSales.tsx:38-43
  export function RecentSales({ kind, tokenId }: { kind: "erc721" | "erc1155"; tokenId: string }) {
    const { data, isLoading } = useQuery({
      queryKey: ["recent-sales", kind, tokenId],
      queryFn: () => fetchSales(kind, tokenId),
      staleTime: 60_000,
    });
  ```

  Its `ghst(wei)` formatter (lines 9–13) and table styling are the
  conventions to copy.
- `src/components/explorer/GotchiActionsPanel.tsx` — imports `RecentSales`
  at line 14 and renders it in the panel body (search `RecentSales` for the
  exact spot). This is the primary integration point.
- `recharts` is already a dependency (`package.json`) — use it for the
  sparkline; do not add a new charting library.
- Convention: raw `fetch(CORE_SUBGRAPH, { method: "POST", … })` +
  `useQuery`, GraphQL `variables` over string interpolation.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Unit tests| `pnpm test:unit` | all pass            |
| Lint      | `pnpm lint`      | exit 0              |
| Dev server| `pnpm dev`       | Vite on :5000       |

## Scope

**In scope** (the only files you should modify/create):
- `src/components/explorer/PriceHistory.tsx` (create)
- `src/lib/explorer/priceHistory.ts` (create — fetcher + shaping, unit-testable)
- `src/lib/explorer/priceHistory.test.ts` (create)
- `src/components/explorer/GotchiActionsPanel.tsx` (render the component)

**Out of scope** (do NOT touch):
- `RecentSales.tsx` — it stays as-is; the two sections are complementary
  (RecentSales shows counterparties, PriceHistory shows the lifetime curve).
- Portal/parcel detail surfaces (`MarketGrid.tsx`, `ParcelDetailModal.tsx`) —
  the component is built to support them (`kind` prop) but wiring them in is
  a follow-up; do not modify those files.
- Any USD conversion — GHST-denominated only in this plan.

## Git workflow

- Branch: `advisor/008-price-history`
- Commit style: conventional commits, e.g. `feat(explorer): lifetime price history sparkline on gotchi detail`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the live shape

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ aavegotchis(first:1, where:{ timesTraded_gt: 2 }, orderBy: timesTraded, orderDirection: desc){ gotchiId timesTraded historicalPrices } }"}' https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
```

**Verify**: returns one gotchi with `timesTraded` ≥ 3 and a same-length-ish
`historicalPrices` array of wei strings. Errors/empty → STOP.

### Step 2: `src/lib/explorer/priceHistory.ts`

```ts
export type PriceHistory = { pricesGhst: number[]; timesTraded: number };
export type PriceHistoryKind = "gotchi" | "portal" | "parcel";

export async function fetchPriceHistory(kind: PriceHistoryKind, tokenId: string): Promise<PriceHistory | null>
```

- Entity per kind: `aavegotchi` / `portal` / `parcel`; query
  `<entity>(id: $id) { historicalPrices timesTraded }` with `variables: { id: tokenId }`.
- Map wei strings → GHST numbers (`Number(wei) / 1e18`); `timesTraded` via
  `Number()`. Return `null` when the entity is missing or
  `historicalPrices` is null/empty.
- Error handling: throw on `json.errors` (RecentSales pattern).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Unit tests

`src/lib/explorer/priceHistory.test.ts` (mock `fetch`; model after
`src/graphql/subgraphFailover.test.ts`):
1. Maps wei strings to GHST numbers in order.
2. Returns `null` for missing entity and for empty `historicalPrices`.
3. Picks the right entity name per `kind` (assert on the query string sent).

**Verify**: `pnpm test:unit -- priceHistory` → 3+ tests pass.

### Step 4: `PriceHistory.tsx`

Props: `{ kind: PriceHistoryKind; tokenId: string }`.
- `useQuery({ queryKey: ["price-history", kind, tokenId], queryFn: …, staleTime: 300_000 })`.
- Render nothing at all (`return null`) when data is `null` or has < 2
  prices — a flat "no history" box is noise on never-traded assets.
- Otherwise render, in RecentSales' visual style (`text-sm font-semibold mb-1.5`
  header): header "Price history" with a right-aligned muted
  `traded {timesTraded}×`; below it a recharts sparkline:
  `<ResponsiveContainer width="100%" height={64}>` →
  `<LineChart data={points}>` → `<Line dataKey="p" dot={false} strokeWidth={2} />`
  + `<Tooltip formatter={(v)=>`${v} GHST`} />` (points = `pricesGhst.map((p,i)=>({i,p}))`);
  no axes (keep it a sparkline). Use `stroke="currentColor"` on a
  `text-primary` wrapper so it follows the theme.
- Under the chart, one muted line: `first {fmt(pricesGhst[0])} → last {fmt(pricesGhst.at(-1))} GHST`
  (format with `toLocaleString`, max 2 fraction digits, like `RecentSales.tsx:9-13`).

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 5: Wire into `GotchiActionsPanel.tsx`

Directly above the existing `<RecentSales kind="erc721" …/>` render, add
`<PriceHistory kind="gotchi" tokenId={gotchi.gotchiId} />`.

**Verify**: `pnpm dev` → Explorer → open a gotchi's manage/detail panel for a
traded gotchi (e.g. search a gotchi id from Step 1) → sparkline renders; a
never-traded gotchi shows nothing extra and no console errors.

## Test plan

- Unit (Step 3): mapping, null cases, entity selection.
- Manual (Step 5): traded + never-traded gotchi.
- Gates: `pnpm typecheck && pnpm lint && pnpm test:unit` all exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit` exits 0 with ≥3 new priceHistory tests
- [ ] `grep -rn "historicalPrices" src/` matches only `src/lib/explorer/priceHistory.ts`
- [ ] Gotchi detail panel shows the sparkline for a traded gotchi
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Step 1 curl errors or `historicalPrices` is not an array of numeric strings.
- `GotchiActionsPanel.tsx` no longer renders `RecentSales` (insertion point gone).
- recharts is missing from `package.json` dependencies — do not `pnpm add`
  anything; report instead.

## Maintenance notes

- Follow-up: pass `kind="parcel"` / `kind="portal"` from `ParcelDetailModal`
  and the portal cards in `MarketGrid` — the component already supports it.
- `historicalPrices` records Baazaar fixed-price sales; GBM hammer prices may
  not be included (unverified). If a user reports a "missing" sale, check
  whether it was a GBM auction before assuming a bug.
- If the app later adds USD pricing (a Tier-3 parity item), this sparkline
  should keep GHST as the primary axis — historical GHST/USD rates aren't
  available in the subgraph.
