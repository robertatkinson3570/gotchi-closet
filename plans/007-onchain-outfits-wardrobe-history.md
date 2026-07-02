# Plan 007: Surface on-chain saved outfits (WearablesConfig) and per-gotchi wardrobe history (EquippedWearableOwner)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (section "Subgraph data-gap plans").
>
> **Drift check (run first)**: `git diff --stat 60fd7c3..HEAD -- src/lib/subgraph.ts src/components/explorer/GotchiActionsPanel.tsx src/components/explorer/WearableDetailModal.tsx src/components/explorer/EquipWearablesModal.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (read-only subgraph data + one reuse of an existing verified write path)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `60fd7c3`, 2026-07-02

## Why this matters

GotchiCloset is an outfit editor, but the outfits users save in the official
Aavegotchi dapp are invisible to it, and the outfits users build here are
trapped in localStorage. The core subgraph already indexes both halves of the
fix: `WearablesConfig` (named outfit presets users saved on-chain — live data
exists, e.g. configs named "Brs Opti") and `EquippedWearableOwner` (every
equip/unequip event per gotchi slot, with timestamps and an
`isCurrentlyEquipped` flag). Reading these gives us: (a) "your on-chain
outfits" with one-click apply, (b) a per-gotchi wardrobe timeline no other
tool has, and (c) "worn by" provenance on every wearable. This is the most
on-brand feature the subgraph offers and the app queries none of it today.

## Current state

- `src/lib/subgraph.ts` — single source of truth for Goldsky endpoints:

  ```ts
  // src/lib/subgraph.ts:6-9
  const GOLDSKY_PROJECT = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs";
  /** Core Aavegotchi entities: gotchis, erc721/erc1155 listings, purchases. */
  export const CORE_SUBGRAPH = `${GOLDSKY_PROJECT}/aavegotchi-core-base/prod/gn`;
  ```

- The core subgraph exposes (verified live 2026-07-02 via introspection):
  - `wearablesConfigs` — fields: `id` (format `0x<owner>-<gotchiTokenId>-<configIdx>`),
    `name`, `wearablesConfigId`, `gotchi`, `gotchiTokenId`, `wearables: [Int!]!`
    (16-slot array), `owner`, `ownerAddress`.
  - `equippedWearableOwners` — fields: `id`, `gotchi`, `gotchiId`, `wearableId`,
    `slotPosition`, `owner`, `ownerAddress`, `equippedAt`, `unequippedAt`,
    `isDelegated`, `depositId`, `isCurrentlyEquipped`.
- `src/components/explorer/GotchiActionsPanel.tsx` — the "manage gotchi" panel
  (pet / name / skill points / list / offers / lending). It already embeds
  `RecentSales` (imported at line 14) and defines `ManageGotchi` at line 59
  with `gotchiId`, `equippedWearables`, `locked`, `listed`. New per-gotchi
  sections belong here.
- `src/components/explorer/EquipWearablesModal.tsx` — the existing, verified
  on-chain equip write path:

  ```ts
  // EquipWearablesModal.tsx:12-13
  const EQUIP_ABI = [
    { name: "equipWearables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_wearablesToEquip", type: "uint16[16]" }], outputs: [] },
  ] as const;
  // :114  writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: EQUIP_ABI, functionName: "equipWearables", args: [BigInt(gotchiId), arr16] });
  ```

- `src/components/explorer/WearableDetailModal.tsx` — read-only wearable
  detail modal; renders info grid, `RecentSales kind="erc1155"` at line 75.
  "Worn by" belongs here.
- `src/components/explorer/RecentSales.tsx` — the exemplar for a small
  self-fetching detail-section component: raw `fetch(CORE_SUBGRAPH, …)`,
  `useQuery` from `@tanstack/react-query` with a `staleTime`, tiny table with
  Tailwind classes. **Match this pattern.**
- `src/lib/explorer/itemMeta.ts` — `itemMetaSync(id)` gives `{ name, rarity, slot }`
  for any wearable id from the bundled db; `RARITY_COLORS` for tinting.
- `src/lib/format.ts` exports `shortAddress`.
- Repo conventions: components in `src/components/explorer/`, hooks in
  `src/hooks/`, plain template-literal GraphQL strings (urql `gql` only in
  `src/graphql/queries.ts`), Tailwind + lucide-react icons, react-query keys
  centralized in `src/lib/queryKeys.ts` (`qk.…`) for shared queries but
  inline literal keys are used for one-off component queries (see
  `RecentSales.tsx:40` `queryKey: ["recent-sales", kind, tokenId]`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Unit tests| `pnpm test:unit`         | all pass            |
| Lint      | `pnpm lint`              | exit 0 (zero warnings allowed) |
| Dev server| `pnpm dev`               | Vite on :5000       |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/explorer/wardrobe.ts` (create)
- `src/lib/explorer/wardrobe.test.ts` (create — vitest, colocated like `src/graphql/subgraphFailover.test.ts`)
- `src/components/explorer/OnchainOutfits.tsx` (create)
- `src/components/explorer/WardrobeHistory.tsx` (create)
- `src/components/explorer/WornBy.tsx` (create)
- `src/components/explorer/GotchiActionsPanel.tsx` (add the two sections)
- `src/components/explorer/WearableDetailModal.tsx` (add WornBy)

**Out of scope** (do NOT touch, even though they look related):
- Writing outfits on-chain (`createWearablesConfig` on the diamond) — the
  facet signature is unverified; deferred to a follow-up (see Maintenance).
- `src/lib/lockedBuilds.ts` / `WardrobeLabPage.tsx` — the localStorage
  outfit-lab feature is separate; do not merge the two systems in this plan.
- `src/components/explorer/EquipWearablesModal.tsx` — read it for the ABI
  pattern, but do not modify it.
- `src/graphql/queries.ts` — component-local queries follow the RecentSales
  pattern instead.

## Git workflow

- Branch: `advisor/007-onchain-outfits`
- Commit style: conventional commits, e.g. `feat(explorer): on-chain outfits + wardrobe history from subgraph` (match `git log --oneline`: `fix(lending): …`, `test(e2e): …`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the live subgraph shapes

Run both curls (Git Bash):

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ wearablesConfigs(first:2){ id name gotchiTokenId wearables ownerAddress } }"}' https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
curl -s -X POST -H "Content-Type: application/json" -d '{"query":"{ equippedWearableOwners(first:2, orderBy: equippedAt, orderDirection: desc){ id gotchiId wearableId slotPosition equippedAt unequippedAt isCurrentlyEquipped isDelegated } }"}' https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
```

**Verify**: both return `{"data":{…}}` with non-empty arrays and exactly the
listed fields (no `errors` key). If either errors or returns empty → STOP.

### Step 2: Create `src/lib/explorer/wardrobe.ts`

Export three fetchers, each a plain async function that POSTs to
`CORE_SUBGRAPH` (import from `@/lib/subgraph`) with the RecentSales
error-handling shape (`if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error")`):

```ts
export type OnchainOutfit = { id: string; name: string; gotchiTokenId: string; wearables: number[] };
export type WardrobeEvent = { wearableId: number; slotPosition: number; equippedAt: number; unequippedAt: number | null; isCurrentlyEquipped: boolean; isDelegated: boolean };
export type Wearer = { gotchiId: string; equippedAt: number };

export async function fetchOutfitsForOwner(owner: string): Promise<OnchainOutfit[]>
// query: wearablesConfigs(first: 100, where: { ownerAddress: $owner }) { id name gotchiTokenId wearables }
// $owner must be lowercased. wearables come back as numbers already (Int!).

export async function fetchWardrobeHistory(gotchiId: string): Promise<WardrobeEvent[]>
// query: equippedWearableOwners(first: 200, where: { gotchiId: $id }, orderBy: equippedAt, orderDirection: desc)
//        { wearableId slotPosition equippedAt unequippedAt isCurrentlyEquipped isDelegated }
// Map equippedAt/unequippedAt with Number(); unequippedAt of 0/null → null.

export async function fetchCurrentWearers(wearableId: number): Promise<Wearer[]>
// query: equippedWearableOwners(first: 20, where: { wearableId: $wid, isCurrentlyEquipped: true }, orderBy: equippedAt, orderDirection: desc)
//        { gotchiId equippedAt }
```

Use GraphQL `variables`, not string interpolation, for all three (pattern:
`useTraitFrequency.ts:38-45`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Unit-test the fetchers

Create `src/lib/explorer/wardrobe.test.ts` (vitest). Mock global `fetch`
(pattern: see `src/graphql/subgraphFailover.test.ts` for how this repo stubs
fetch). Cases:
1. `fetchOutfitsForOwner` lowercases the address it sends and maps fields.
2. `fetchWardrobeHistory` maps `unequippedAt: "0"` → `null` and preserves order.
3. Each fetcher throws on `{ errors: [{message}] }` responses.

**Verify**: `pnpm test:unit -- wardrobe` → 3+ tests pass.

### Step 4: `OnchainOutfits.tsx` — saved outfits with one-click apply

Component props: `{ gotchiId: string; ownerAddress: string; locked?: boolean }`.
- `useQuery({ queryKey: ["onchain-outfits", ownerAddress], queryFn: () => fetchOutfitsForOwner(ownerAddress), staleTime: 60_000 })`.
- Render section header "On-chain outfits" in the RecentSales style
  (`text-sm font-semibold mb-1.5`). Empty state: `"No outfits saved on-chain. (Saved outfits from the official dapp appear here.)"`
- Each outfit row: `name`, the non-zero wearable names via
  `itemMetaSync(id)?.name ?? '#'+id` (comma-joined, truncated with
  `truncate`), and an **Apply** button.
- Apply = `useWriteContract` call identical in shape to
  `EquipWearablesModal.tsx:114`: address `AAVEGOTCHI_DIAMOND_BASE`, the same
  one-entry `EQUIP_ABI` (declare it locally, copied verbatim), args
  `[BigInt(gotchiId), outfit.wearables.slice(0,16)]` — pad with `0` to
  exactly 16 entries and cast each with `Number()`. Wrap errors with
  `parseRevert` from `@/lib/lending/parseRevert` and surface via
  `useToast()` (pattern: GotchiActionsPanel).
- Disable Apply with a tooltip when `locked` (rented/borrowed gotchis revert).

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 5: `WardrobeHistory.tsx` — the equip timeline

Props: `{ gotchiId: string }`. `useQuery` on `fetchWardrobeHistory`,
`staleTime: 60_000`. Render a scrollable table (copy the RecentSales
table markup: `max-h-48 overflow-y-auto rounded-lg border border-border/40`,
`text-[11px]`) with columns: Wearable (name via `itemMetaSync`, tinted with
`RARITY_COLORS[meta.rarity]`), Slot (`slotPosition`), When (relative time —
copy the `ago()` helper from `RecentSales.tsx:14-22` locally), Status
(`isCurrentlyEquipped ? "Equipped" : "Removed"`, plus a small "delegated"
badge when `isDelegated`). Empty state: "No wardrobe history recorded."

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 6: Wire both into `GotchiActionsPanel.tsx`

Inside the panel body, adjacent to where `<RecentSales kind="erc721" …/>` is
rendered (search for `RecentSales` in the file), add:

```tsx
<OnchainOutfits gotchiId={gotchi.gotchiId} ownerAddress={ownerAddress} locked={gotchi.locked} />
<WardrobeHistory gotchiId={gotchi.gotchiId} />
```

`ownerAddress`: the panel is used from owned-gotchi context; locate the
owner/connected address already available in the component (it uses
`useAccount()` from wagmi). Use the connected `address` — outfits are
owner-scoped, and the panel's action buttons already assume the viewer is
the owner.

**Verify**: `pnpm dev`, open Explorer → a gotchi you manage → Manage panel
shows both sections without console errors (empty states are acceptable).

### Step 7: `WornBy.tsx` + wire into `WearableDetailModal.tsx`

`WornBy` props: `{ wearableId: number }` → `fetchCurrentWearers`, render
"Currently worn by" list: `Gotchi #<gotchiId>` (plain `font-mono` text),
plus `ago(equippedAt)`. Cap display at 10 with a "+N more" line when 20 came
back. Insert `<WornBy wearableId={wearable.id} />` in
`WearableDetailModal.tsx` directly above `<RecentSales …/>` (line 75).

**Verify**: `pnpm dev` → Explorer → wearables tab → open a common wearable's
detail → "Currently worn by" renders entries.

## Test plan

- Unit: `src/lib/explorer/wardrobe.test.ts` (Step 3) — mapping, lowercasing,
  error propagation. Model after `src/graphql/subgraphFailover.test.ts`.
- Manual (dev server): Steps 6–7 checks above.
- Full gates: `pnpm typecheck && pnpm lint && pnpm test:unit` all exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit` exits 0 and includes ≥3 new wardrobe tests
- [ ] `grep -rn "wearablesConfigs" src/` matches only `src/lib/explorer/wardrobe.ts`
- [ ] GotchiActionsPanel renders "On-chain outfits" and wardrobe history sections
- [ ] WearableDetailModal renders "Currently worn by"
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's curls return errors or empty data — the entity names/fields have
  drifted from this plan.
- `GotchiActionsPanel.tsx` no longer imports/renders `RecentSales` (insertion
  point gone).
- The `equipWearables` call in Step 4 reverts in manual testing with anything
  other than an ownership/locked error — do not iterate on ABI variants.
- You find yourself wanting to modify `EquipWearablesModal.tsx` or
  `lockedBuilds.ts` — that's out of scope.

## Maintenance notes

- Follow-up (deliberately deferred): **save** outfits on-chain from the
  closet editor. Requires verifying the `WearablesConfigFacet` write
  signature from the live dapp bundle first (the repo has done this before —
  see the "Exact signatures verified from the live dapp bundle" comment in
  `UserActivityPage.tsx:17-18`). There may also be a config-creation fee.
- If gotchi detail pages get their own route later, `WardrobeHistory` and
  `OnchainOutfits` are already standalone components — move, don't rewrite.
- Reviewer: check the 16-slot padding in Apply (subgraph arrays are 16-long
  already, but defensive padding must not truncate a 17th element silently —
  slice first, then pad).
