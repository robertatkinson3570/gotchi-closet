# Plan 011: XP drop tracker — show recent XP drops and per-gotchi claim status

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (section "Subgraph data-gap plans").
>
> **Drift check (run first)**: `git diff --stat 60fd7c3..HEAD -- src/lib/subgraph.ts src/components/explorer/GotchiActionsPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (read-only; one new endpoint const + one panel section)
- **Depends on**: none (plan 007 also inserts sections into `GotchiActionsPanel.tsx`; if both run, order doesn't matter — different sections)
- **Category**: direction
- **Planned at**: commit `60fd7c3`, 2026-07-02

## Why this matters

Aavegotchi distributes XP via merkle drops (quests, votes, events). The
`aavegotchi-xp-base` subgraph indexes every drop (`XPDrop`: id, amount,
createdAt) and every claim (`ClaimedXPDrop`: which gotchi claimed which drop,
when) — verified live 2026-07-02 with drops from weeks ago and claims from
hours ago. The app queries none of it, so users have no way to see whether a
gotchi missed recent XP drops. A "recent drops × claimed?" grid per gotchi
turns missed XP (lost levels → lost rarity-season value) into a visible,
fixable state, and feeds the retention loop the Steward/auto-pet features
already serve.

**Honest limitation (bake into the UI copy)**: the subgraph does not expose
drop *eligibility* (the merkle trees live off-chain). An unclaimed drop may
mean "not eligible", not "forgot to claim". The section is therefore titled
"XP drops" with status `Claimed (+N XP)` / `Not claimed`, plus a footnote —
never "You missed this".

## Current state

- `src/lib/subgraph.ts` (16 lines) defines `CORE_SUBGRAPH`,
  `GOTCHIVERSE_SUBGRAPH`, `GBM_SUBGRAPH`, `SVG_SUBGRAPH` off a shared
  `GOLDSKY_PROJECT` base (line 6). The XP endpoint follows the same shape:
  `${GOLDSKY_PROJECT}/aavegotchi-xp-base/prod/gn`.
- Verified live XP subgraph entities (2026-07-02):
  - `xpdrops` (note the lowercase query-field spelling) — fields: `id`
    (Bytes, a 0x… merkle-drop hash), `merkleRoot`, `amount` (XP per claim,
    integer string, e.g. "10"/"20"), `createdAt` (unix), `claimed` (list of
    ClaimedXPDrop).
  - `claimedXPDrops` — fields: `id`, `drop { id amount }`, `claimer`
    (Bytes address), `gotchi` (BigInt token id), `createdAt`.
- `src/components/explorer/GotchiActionsPanel.tsx` — the per-gotchi manage
  panel; imports `RecentSales` at line 14 and renders it in the body; new
  per-gotchi sections belong beside it. `ManageGotchi` (line 59) provides
  `gotchiId: string`.
- Exemplar for a small self-fetching section:
  `src/components/explorer/RecentSales.tsx` — raw `fetch` + `useQuery`
  (`staleTime`), compact table, local `ago()` helper (lines 14–22).
- Convention: GraphQL `variables`, throw on `json.errors`.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Unit tests| `pnpm test:unit` | all pass            |
| Lint      | `pnpm lint`      | exit 0              |
| Dev server| `pnpm dev`       | Vite on :5000       |

## Scope

**In scope**:
- `src/lib/subgraph.ts` (add `XP_SUBGRAPH` const, one line + doc comment)
- `src/lib/xpDrops.ts` (create)
- `src/lib/xpDrops.test.ts` (create)
- `src/components/explorer/XpDrops.tsx` (create)
- `src/components/explorer/GotchiActionsPanel.tsx` (render the section)

**Out of scope** (do NOT touch):
- Any on-chain claim transaction — claiming needs merkle proofs the subgraph
  doesn't hold; deferred (see Maintenance).
- Eligibility detection / "you missed this" alerts — same reason.
- The Steward server (`server/steward/*`) — an auto-claim integration is a
  separate plan.

## Git workflow

- Branch: `advisor/011-xp-drops`
- Commit style: conventional commits, e.g. `feat(explorer): XP drop claim status per gotchi`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the live shapes

```bash
XP=https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-xp-base/prod/gn
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ xpdrops(first:3, orderBy: createdAt, orderDirection: desc){ id amount createdAt } }"}' $XP
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ claimedXPDrops(first:3, orderBy: createdAt, orderDirection: desc){ drop { id amount } gotchi createdAt } }"}' $XP
```

**Verify**: both non-empty; `xpdrops` ids are 0x-hashes; `gotchi` is a
numeric string. Errors/empty → STOP.

### Step 2: Add the endpoint const

In `src/lib/subgraph.ts`, after `SVG_SUBGRAPH` (line 15), add:

```ts
/** XP merkle drops + per-gotchi claims. */
export const XP_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-xp-base/prod/gn`;
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: `src/lib/xpDrops.ts`

```ts
export type XpDropStatus = { dropId: string; amount: number; createdAt: number; claimed: boolean; claimedAt: number | null };

export async function fetchXpDropStatus(gotchiId: string, recentCount = 10): Promise<XpDropStatus[]>
```

Implementation: one POST with a single document containing both roots:

```graphql
query($gotchi: BigInt!, $n: Int!) {
  xpdrops(first: $n, orderBy: createdAt, orderDirection: desc) { id amount createdAt }
  claimedXPDrops(first: 100, where: { gotchi: $gotchi }) { drop { id } createdAt }
}
```

Join in code: a drop is `claimed` when its `id` appears in the gotchi's
claimedXPDrops; `claimedAt` from the matching claim. Numbers via `Number()`
(but NOT the drop id — it's a hash string). Throw on `json.errors`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Unit tests

`src/lib/xpDrops.test.ts` (mock `fetch`; model after
`src/graphql/subgraphFailover.test.ts`):
1. Joins claims onto drops by id (claimed=true with claimedAt).
2. Unclaimed drops get `claimed: false, claimedAt: null`.
3. Throws on GraphQL errors.

**Verify**: `pnpm test:unit -- xpDrops` → 3+ tests pass.

### Step 5: `XpDrops.tsx` + wire into the panel

Props: `{ gotchiId: string }`.
- `useQuery({ queryKey: ["xp-drops", gotchiId], queryFn: () => fetchXpDropStatus(gotchiId), staleTime: 300_000 })`.
- Section "XP drops" (RecentSales visual style): compact table with columns
  Drop (shortened hash: `id.slice(0,6)+"…"+id.slice(-4)`, `font-mono`),
  XP (`+{amount}`), When (`ago(createdAt)` — copy the helper from
  `RecentSales.tsx:14-22`), Status (`Claimed` in emerald when claimed,
  `Not claimed` muted otherwise).
- Footnote line (muted, `text-[10px]`): "Unclaimed may mean not eligible —
  eligibility lists live off-chain."
- Empty state: "No XP drops indexed yet."
- In `GotchiActionsPanel.tsx`, render `<XpDrops gotchiId={gotchi.gotchiId} />`
  adjacent to the existing `<RecentSales …/>`.

**Verify**: `pnpm dev` → open a gotchi's manage panel → XP drops table
renders; a gotchi id seen in Step 1's `claimedXPDrops` output shows at least
one `Claimed` row.

## Test plan

- Unit (Step 4): join logic, unclaimed default, error propagation.
- Manual (Step 5): gotchi with claims + gotchi without.
- Gates: `pnpm typecheck && pnpm lint && pnpm test:unit` all exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit` exits 0 with ≥3 new xpDrops tests
- [ ] `grep -rn "aavegotchi-xp-base" src/` matches only `src/lib/subgraph.ts`
- [ ] Gotchi manage panel shows the XP drops section with the eligibility footnote
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Step 1 curls error, or the query field is not spelled `xpdrops` (try
  `xpDrops` once and record which works; if neither, the schema drifted).
- The combined query in Step 3 errors on the `gotchi` BigInt filter — do not
  fall back to client-side filtering of all claims (unbounded); report.
- `GotchiActionsPanel.tsx` insertion point (RecentSales) is gone and the
  file structure is unrecognizable vs the excerpt.

## Maintenance notes

- Follow-up (deferred): actual claiming. Requires locating Pixelcraft's
  published merkle-proof source (historically a GitHub repo/API used by the
  official dapp) and the diamond's claim facet signature — verify from the
  live dapp bundle like the signatures noted in `UserActivityPage.tsx:17-18`.
  Once proofs are available, "Not claimed" rows can become claim buttons and
  the Steward could auto-claim.
- Follow-up: an owned-scope summary ("3 of your gotchis have unclaimed recent
  drops") on the Explorer, batching `claimedXPDrops(where: { gotchi_in: […] })`.
- Reviewer: drop ids are Bytes — keep them as strings end-to-end; never
  `Number()` them.
