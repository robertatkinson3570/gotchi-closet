# Plan 001: Cut the DaoPage and initial JS bundles with targeted code-splitting

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 192d483..HEAD -- vite.config.ts src/pages/DaoPage.tsx src/components/dao src/hooks/useSnapshotVote.ts` — if any in-scope file changed since this plan was written, compare the "Current state" excerpts to the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `192d483`, 2026-06-19

## Why this matters
The prod build emits a 1.24 MB `DaoPage` chunk and a 1.07 MB `index` chunk (gzip ~403 KB / ~333 KB). DaoPage is dominated by `@snapshot-labs/snapshot.js` (governance signing/GraphQL) pulled in eagerly through `useSnapshotVote`, and the same 64 KB `wearables.json` (+ two sibling JSON files) is duplicated across many lazy page chunks because there is no `manualChunks` config. Splitting these defers heavy code until it's actually used and de-duplicates shared data, improving first-load and `/dao` load time without changing behavior.

## Current state
- `vite.config.ts` — build config; sets `chunkSizeWarningLimit` but has **no** `build.rollupOptions.output.manualChunks`. Verify with `grep -n "manualChunks\|chunkSizeWarningLimit\|build" vite.config.ts`.
- `src/hooks/useSnapshotVote.ts:4` — `import ... from "@snapshot-labs/snapshot.js"` (heavy: signing + GraphQL client). Imported by `src/components/dao/SnapshotVotePanel.tsx`, which renders inside the already-lazy `src/pages/DaoPage.tsx`. The hook is imported at module top, so snapshot.js loads with the page, not on first vote.
- `data/wearables.json` (~64 KB), `data/wearableSets.json` (~36 KB), `data/setsByTraitDirection.json` (~23 KB) — imported from many modules (e.g. `src/graphql/fetchers.ts`, several files under `src/components/explorer/`, `src/pages/ForgePage.tsx`, `src/pages/SetPage.tsx`). Confirm with `grep -rln "data/wearables.json" src/`.
- Pages are already route-split via `React.lazy` in `src/app/router.tsx` (confirm with `grep -n "lazy(" src/app/router.tsx`). This plan does **intra-page** and **shared-chunk** splitting on top of that.

Repo conventions: TypeScript strict; Vite 5 + Rollup; React 18 with `Suspense` already used around lazy routes (see `src/app/router.tsx`). Match the existing `lazy()` + `<Suspense>` usage when deferring a component.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0; prints chunk table |
| Lint | `npx eslint . --ext ts,tsx` | exit 0 |
| Inspect chunk sizes | `npm run build` then read the printed `dist/assets/*.js` table | DaoPage + index smaller than baseline |

Baseline (commit 192d483): `DaoPage ≈ 1239 kB`, `index ≈ 1066 kB`, `core ≈ 580 kB`.

## Scope
**In scope:**
- `vite.config.ts` (add `manualChunks`)
- `src/components/dao/SnapshotVotePanel.tsx` and/or a new `src/components/dao/LazySnapshotVotePanel.tsx`
- `src/pages/DaoPage.tsx` (only the import of the vote panel, if you introduce a lazy wrapper)

**Out of scope (do NOT touch):**
- `src/hooks/useSnapshotVote.ts` internals — the ethers/viem signer shim is correctness-critical; only its *import timing* changes, via the component that uses it.
- The wallet stack (`src/lib/wagmi.ts`, `WagmiProvider`) — deferring it risks hydration/connect regressions; out of scope for this plan.
- Any change to vote/treasury behavior or the DAO response shapes.

## Git workflow
- Branch: `advisor/001-bundle-splitting`
- Commit per step; match existing commit style (short imperative subject, see `git log --oneline -5`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a shared-data manualChunk for the big JSON files
In `vite.config.ts`, add under `build`:
```ts
build: {
  // ...keep existing keys (chunkSizeWarningLimit etc.)...
  rollupOptions: {
    output: {
      manualChunks: {
        "data-wearables": [
          "./data/wearables.json",
          "./data/wearableSets.json",
          "./data/setsByTraitDirection.json",
        ],
      },
    },
  },
},
```
Adjust the relative paths if the existing config resolves `data/` differently (check how other imports reference it). The goal: these three JSON files land in ONE shared chunk instead of being copied into every page chunk that imports them.

**Verify**: `npm run build` → exit 0; a single `dist/assets/data-wearables-*.js` chunk appears, and per-page chunks that previously embedded wearables data shrink.

### Step 2: Defer snapshot.js until the vote panel renders
Wrap `SnapshotVotePanel` so `useSnapshotVote` (and thus snapshot.js) is only imported when the panel mounts. Create `src/components/dao/LazySnapshotVotePanel.tsx`:
```tsx
import { lazy, Suspense } from "react";
const SnapshotVotePanel = lazy(() => import("./SnapshotVotePanel"));
export default function LazySnapshotVotePanel(props: React.ComponentProps<typeof SnapshotVotePanel>) {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading voting…</div>}>
      <SnapshotVotePanel {...props} />
    </Suspense>
  );
}
```
This requires `SnapshotVotePanel` to have a `default` export. If it is a named export, either add a default export to it or use the `lazy(() => import("./SnapshotVotePanel").then(m => ({ default: m.SnapshotVotePanel })))` form. In `src/pages/DaoPage.tsx`, replace the direct import of `SnapshotVotePanel` with `LazySnapshotVotePanel`. Do not change any props passed.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → a separate `SnapshotVotePanel-*.js` chunk now exists and `DaoPage-*.js` is materially smaller than the 1239 kB baseline.

### Step 3: Confirm no behavior change
`npx eslint . --ext ts,tsx` → exit 0. Confirm the build succeeded (import graph resolves).

## Test plan
There are no existing perf/bundle tests and this is a build-config + import-timing change, so verification is via the build output, not new unit tests. Record before/after chunk sizes in the PR description. A lightweight bundle-budget check is a possible follow-up (see Maintenance notes), not part of this plan.

## Done criteria
ALL must hold:
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx eslint . --ext ts,tsx` exits 0
- [ ] `npm run build` exits 0 and shows a `data-wearables-*.js` chunk plus a separate `SnapshotVotePanel-*.js` chunk
- [ ] `DaoPage-*.js` gzip is smaller than the 192d483 baseline (~403 KB) — record the new number
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions
- `SnapshotVotePanel` cannot be lazy-loaded without changing `useSnapshotVote` internals (e.g. it is imported elsewhere eagerly) — report instead of refactoring the hook.
- The `manualChunks` config breaks the build with a load-order/circular error — revert step 1, report.
- DaoPage chunk does not shrink after step 2 — the heavy dep may not be snapshot.js; report the actual chunk composition (consider adding `rollup-plugin-visualizer` as a follow-up).

## Maintenance notes
- If a second page starts importing snapshot.js, promote it to its own `manualChunks` entry too.
- A future CI bundle-budget gate (e.g. fail build if any chunk > 1.5 MB) would lock in this win — deferred out of this plan.
- The wallet stack (wagmi/viem, ~80–100 KB gzip in the initial bundle) and `framer-motion` in `CompanionRoot` are the next-largest deferral opportunities but carry higher UX risk; intentionally left for a separate plan.
