# /dress Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding in `docs/audits/2026-07-02-dress-page-audit.md` (1 critical, 7 high, 10 medium, lows) so /dress numbers exactly match the chain/subgraph/explorer.

**Architecture:** Pure-function fixes in `src/lib` + `src/state/selectors.ts`, store changes in `useAppStore.ts`, UI wiring in `EditorPanel`/`GotchiCard`/`DressPage`. Each task is independently committable. TDD with vitest (`npx vitest run <file>`).

**Tech Stack:** React 18, zustand, wagmi/viem (Base chain 8453), @tanstack/react-query, vitest.

**Context docs (read before starting a task):** `docs/audits/2026-07-02-dress-page-audit.md` (finding ids referenced per task), `docs/superpowers/specs/2026-07-02-dress-save-to-gotchi-design.md` (the Save feature that depends on several fixes).

**Verification after every task:** `npx vitest run` (all tests) and `npx tsc --noEmit`. Commit only when both pass.

---

### Task 1: C1 — stop wiping locked builds (store side)

**Files:**
- Modify: `src/state/useAppStore.ts:137-149` (`setGotchis`)
- Test: `src/state/lockedBuilds-persistence.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/state/lockedBuilds-persistence.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/state/useAppStore";
import type { Gotchi } from "@/types";

const g = (id: string): Gotchi => ({
  id, name: `G${id}`, numericTraits: [50, 50, 50, 50, 1, 1], equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
});
const override = { wearablesBySlot: [1, 0, 0, 0, 0, 0, 0, 0], respecAllocated: null, timestamp: 1 };

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ gotchis: [], manualGotchis: [], lockedById: {}, overridesById: {}, loadedAddress: null });
});

describe("locked build persistence (audit C1)", () => {
  it("setGotchis([]) does not purge or persist-wipe existing locks", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().setGotchis([g("1")]);
    useAppStore.getState().lockGotchi("1", override);
    // Simulates the DressPage mount reset:
    useAppStore.getState().setGotchis([]);
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
    // reload from storage — must still be there
    useAppStore.getState().loadLockedBuildsFromStorage();
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
  });

  it("locks on manual gotchis survive wallet refetches", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().addManualGotchi(g("999"));
    useAppStore.getState().lockGotchi("999", override);
    useAppStore.getState().setGotchis([g("1")]); // wallet refetch without 999
    expect(useAppStore.getState().lockedById["999"]).toBe(true);
  });

  it("stale locks are still cleaned once a real gotchi list arrives", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().setGotchis([g("1"), g("2")]);
    useAppStore.getState().lockGotchi("2", override);
    useAppStore.getState().setGotchis([g("1")]); // gotchi 2 left the wallet
    expect(useAppStore.getState().lockedById["2"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state/lockedBuilds-persistence.test.ts`
Expected: FAIL — first test loses the lock after `setGotchis([])`.

- [ ] **Step 3: Implement**

Replace the body of `setGotchis` in `src/state/useAppStore.ts`:

```ts
  setGotchis: (gotchis) => {
    set({ gotchis });
    const state = get();
    // Never clean/persist against an empty list — the DressPage mount reset
    // (setGotchis([])) and transient loading states must not wipe saved locks.
    if (!state.loadedAddress || gotchis.length === 0) return;
    const keepIds = new Set([
      ...gotchis.map((gg) => gg.id),
      // Manual gotchis are lockable (toggleLockSet supports them) — keep theirs.
      ...state.manualGotchis.map((gg) => gg.id),
    ]);
    const cleaned = cleanupStaleLockedBuilds(
      { version: 1, lockedById: state.lockedById, overridesById: state.overridesById },
      keepIds
    );
    set({ lockedById: cleaned.lockedById, overridesById: cleaned.overridesById });
    saveLockedBuilds(BASE_CHAIN_ID, state.loadedAddress, cleaned);
  },
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run src/state/lockedBuilds-persistence.test.ts`, expect 3 PASS.

- [ ] **Step 5: Check the ExplorerPage vector.** Read `src/pages/ExplorerPage.tsx:240-260`. Its "mine" mode calls `setGotchis(gotchis as any)` with only connected-wallet gotchis. With the fix above, locks on manual gotchis survive, but locks on *other watched wallets'* gotchis would still be purged. Change ExplorerPage to NOT call the lock-cleaning `setGotchis` — give ExplorerPage its own local state or add a store action `setGotchisWithoutLockCleanup(gotchis)` that only does `set({ gotchis })`, and use it there. Choose whichever is a smaller diff after reading the file (local state preferred if `gotchis` isn't consumed from the store elsewhere on that page).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "fix(dress): stop wiping locked builds on mount/refetch (audit C1)"`

---

### Task 2: M6 — lock storage keyed globally, not per wallet-combination

**Files:**
- Modify: `src/lib/lockedBuilds.ts:13-18` (storage key), `src/state/useAppStore.ts` (callers pass no address)
- Test: extend `src/state/lockedBuilds-persistence.test.ts`

Gotchi ids are globally unique, so locks don't need a wallet namespace at all. The composite `"connected|w1|w2"` key strands locks whenever the wallet set changes.

- [ ] **Step 1: Write failing test**

```ts
  it("locks survive a wallet-set change (storage not keyed to the combo)", () => {
    useAppStore.getState().setLoadedAddress("0xabc|0xdef");
    useAppStore.getState().setGotchis([g("1")]);
    useAppStore.getState().lockGotchi("1", override);
    // wallet added → different composite key
    useAppStore.getState().setLoadedAddress("0xabc|0xdef|0x123");
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
  });
```

- [ ] **Step 2: Run** — expect FAIL (new composite key loads empty).

- [ ] **Step 3: Implement.** In `lockedBuilds.ts`:

```ts
const STORAGE_KEY_PREFIX = "gotchicloset.lockedBuilds.v1";
const GLOBAL_NS = "global";

function getStorageKey(chainId: number): string {
  return `${STORAGE_KEY_PREFIX}:${chainId}:${GLOBAL_NS}`;
}

/** One-time migration: merge any legacy per-wallet(-combo) keys into the global key. */
function migrateLegacyKeys(chainId: number): void {
  try {
    const globalKey = getStorageKey(chainId);
    if (localStorage.getItem(globalKey)) return;
    const merged: LockedBuildsData = { version: 1, lockedById: {}, overridesById: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_KEY_PREFIX}:${chainId}:`) || key === globalKey) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "");
        if (parsed?.version === 1) {
          Object.assign(merged.lockedById, parsed.lockedById || {});
          Object.assign(merged.overridesById, parsed.overridesById || {});
        }
      } catch { /* skip corrupt entries */ }
    }
    if (Object.keys(merged.lockedById).length > 0) {
      localStorage.setItem(globalKey, JSON.stringify(merged));
    }
  } catch { /* storage unavailable */ }
}
```

Change `loadLockedBuilds(chainId: number)` / `saveLockedBuilds(chainId: number, data)` signatures to drop `walletAddress` (call `migrateLegacyKeys(chainId)` at the top of `loadLockedBuilds`). Update all callers in `useAppStore.ts` (`setLoadedAddress`, `setGotchis`, `lockGotchi`, `unlockGotchi`, `loadLockedBuildsFromStorage`, `setLockSetEnabledBulk`) — they keep gating on `loadedAddress` being set (a signal someone is loaded) but no longer pass it to storage. Grep for other callers: `Grep loadLockedBuilds|saveLockedBuilds src/` and update all.

- [ ] **Step 4: Run full suite** — `npx vitest run`, expect PASS (update any existing lockedBuilds tests that pass an address).

- [ ] **Step 5: Commit** — `git commit -am "fix(dress): global lock storage key; migrate legacy per-combo keys (audit M6)"`

---

### Task 3: H1 — single best set (official rule), stop stacking set bonuses

**Files:**
- Modify: `src/lib/rarity.ts` (`computeBRSBreakdown`, new `pickBestSet`)
- Test: `src/lib/rarity.test.ts` (extend)

- [ ] **Step 1: Read `src/lib/sets.ts`** to confirm `SETS` preserves `data/wearableSets.json` order (on-chain set-id order) and note the `SetDefinition` shape.

- [ ] **Step 2: Write failing test** (find a real subset pair: Aagent set requires a subset of Super Aagent's ids — look them up in `data/wearableSets.json` and use the real ids in the fixture):

```ts
// in src/lib/rarity.test.ts
import { pickBestSet, detectActiveSets, computeBRSBreakdown } from "@/lib/rarity";

describe("best-set rule (audit H1)", () => {
  it("pickBestSet picks the longest set; ties go to the later (higher index) set", () => {
    const sets = [
      { id: "a", name: "A", requiredWearableIds: [1, 2], traitModifiers: {}, setBonusBRS: 1 },
      { id: "b", name: "B", requiredWearableIds: [1, 2, 3], traitModifiers: {}, setBonusBRS: 2 },
      { id: "c", name: "C", requiredWearableIds: [4, 5, 6], traitModifiers: {}, setBonusBRS: 3 },
    ] as any[];
    expect(pickBestSet(sets)?.id).toBe("c"); // same length as b → later wins
    expect(pickBestSet(sets.slice(0, 2))?.id).toBe("b");
    expect(pickBestSet([])).toBeNull();
  });

  it("computeBRSBreakdown counts only the best set when a superset outfit matches 2 sets", () => {
    // Use the real Aagent ⊂ Super Aagent ids from data/wearableSets.json here.
    // Assert: setFlatBrs === superSet.setBonusBRS (not the sum of both),
    // and setTraitMods equal only the super set's modifiers.
  });
});
```

- [ ] **Step 3: Run** — expect FAIL (`pickBestSet` undefined).

- [ ] **Step 4: Implement** in `rarity.ts`:

```ts
/**
 * Official rule (aavegotchi-core-subgraph): only ONE set counts — the matched
 * set with the most pieces; ties resolved by `>=` while iterating in on-chain
 * set order, so the later set id wins.
 */
export function pickBestSet(sets: SetDefinition[]): SetDefinition | null {
  let best: SetDefinition | null = null;
  for (const s of sets) {
    if (!best || s.requiredWearableIds.length >= best.requiredWearableIds.length) {
      best = s;
    }
  }
  return best;
}
```

In `computeBRSBreakdown`, replace the stacking:

```ts
  const activeSets = detectActiveSets(params.equippedWearables); // keep: display-only
  const bestSet = pickBestSet(activeSets);
  const wearableTraitMods = sumWearableCoreMods(params.equippedWearables, params.wearablesById);
  const setTraitMods = sumSetCoreMods(bestSet ? [bestSet] : []);
  ...
  const setFlatBrs = sumSetBonusBrs(bestSet ? [bestSet] : []);
```

Add `bestSet` to the returned object. Leave `activeSets` in the return for name display, but check consumers: `EditorPanel.tsx` uses `activeSets.map(s => s.name)` for "Active sets:" display and set-count deltas in the Mommy banner — change those displays to show `bestSet` as the counted set (e.g. `bestSet ? [bestSet.name] : []`), since showing both names implies both count. Grep consumers: `Grep activeSets src/ --type ts`.

- [ ] **Step 5: Check the auto-dress engine.** `src/lib/autoDressEngine.ts` optimizes set bonuses through `computeBRSBreakdown` (verified by audit) — it inherits the fix automatically. Run `npx vitest run src/lib/undress-delta.test.ts` plus any engine tests and fix fixture expectations that assumed stacking.

- [ ] **Step 6: Run full suite + typecheck; commit** — `git commit -am "fix(rarity): only the single best set counts, matching official rule (audit H1)"`

---

### Task 4: H2 — respec pool includes unspent availableSkillPoints

**Files:**
- Create: `src/lib/hooks/useAvailableSkillPoints.ts`
- Modify: `src/lib/respec.ts` (`totalSpiritPoints`, `useRespecSimulator`), `src/components/gotchi/GotchiCard.tsx:65-73`, `src/pages/WardrobeLabPage.tsx:185`
- Test: `src/lib/respec.test.ts`

- [ ] **Step 1: Update the test that codifies the bug** (`respec.test.ts:8-15` asserts used-only pool):

```ts
import { totalSpiritPoints } from "@/lib/respec";

describe("respec pool (audit H2)", () => {
  it("pool = usedSkillPoints + availableSkillPoints (post-reset refund + unspent)", () => {
    expect(totalSpiritPoints(5, 3)).toBe(8);
    expect(totalSpiritPoints(5, undefined)).toBe(5); // chain read pending → conservative
    expect(totalSpiritPoints(undefined, 3)).toBe(3);
    expect(totalSpiritPoints(-1, -1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL (signature has one arg).

- [ ] **Step 3: Implement.**

`respec.ts`:

```ts
export function totalSpiritPoints(usedSkillPoints?: number, availableSkillPoints?: number): number {
  const used = Number.isFinite(usedSkillPoints) ? Math.max(0, Math.floor(usedSkillPoints as number)) : 0;
  const avail = Number.isFinite(availableSkillPoints) ? Math.max(0, Math.floor(availableSkillPoints as number)) : 0;
  return used + avail;
}
```

`useRespecSimulator` params gain `availableSkillPoints?: number`; `totalSP = totalSpiritPoints(params.usedSkillPoints, params.availableSkillPoints)`.

New hook `src/lib/hooks/useAvailableSkillPoints.ts`:

```ts
import { useReadContract } from "wagmi";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";

const ABI = [
  { name: "availableSkillPoints", type: "function", stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

/** On-chain unspent skill points. `enabled` gates the read (only needed in respec mode). */
export function useAvailableSkillPoints(tokenId: string | undefined, enabled: boolean) {
  const { data } = useReadContract({
    address: AAVEGOTCHI_DIAMOND_BASE, abi: ABI, functionName: "availableSkillPoints",
    args: tokenId ? [BigInt(tokenId)] : undefined, chainId: BASE_CHAIN_ID,
    query: { enabled: enabled && !!tokenId && /^\d+$/.test(tokenId), staleTime: 30_000 },
  });
  return data != null ? Number(data) : undefined;
}
```

`GotchiCard.tsx`: call `useAvailableSkillPoints(tokenId, showRespec)` and pass the value into `useRespecSimulator`. **Never derive from level** — proven wrong on-chain (level-61 gotchi with 29 points).

`WardrobeLabPage.tsx:185`: read the surrounding code; replace `available = usedSkillPoints || 0` with the same hook (or accept both values through its existing data path) so the lab uses used + available too.

- [ ] **Step 4: Run suite + typecheck; commit** — `git commit -am "fix(respec): pool = used + available skill points, read on-chain (audit H2)"`

---

### Task 5: H3 — exact BRS correction in respec display

**Files:**
- Modify: `src/components/gotchi/GotchiCard.tsx:94-115`, `src/lib/respec.ts` (new helper)
- Test: `src/lib/respec.test.ts`

- [ ] **Step 1: Extract the correction into a pure helper** (put it in `src/lib/respec.ts`, export it):

```ts
import { traitToBRS } from "@/lib/rarity";

/** BRS difference contributed by the 4 editable traits between two base-trait arrays. */
export function editableBrsCorrection(fromBase: number[], toBase: number[]): number {
  let delta = 0;
  for (let i = 0; i < 4; i++) {
    delta += traitToBRS(Number(toBase[i]) || 0) - traitToBRS(Number(fromBase[i]) || 0);
  }
  return delta;
}
```

- [ ] **Step 2: Write failing test**

```ts
import { editableBrsCorrection } from "@/lib/respec";

describe("respec BRS correction (audit H3)", () => {
  it("is 0 for a point spent 49→50 (boundary)", () => {
    expect(editableBrsCorrection([49, 10, 10, 10], [50, 10, 10, 10])).toBe(0);
  });
  it("is -1 for a point spent toward 50", () => {
    expect(editableBrsCorrection([10, 10, 10, 10], [11, 10, 10, 10])).toBe(-1);
  });
  it("is +1 for a point away from 50", () => {
    expect(editableBrsCorrection([10, 10, 10, 10], [9, 10, 10, 10])).toBe(1);
  });
});
```

- [ ] **Step 3: Run** — FAIL. Implement helper. Run — PASS.

- [ ] **Step 4: Rewire GotchiCard.** Replace the `− respec.totalSP + brsDelta` pattern (lines 100-115). The displayed number must be: current display value + (BRS of the simulated base − BRS of the *current* base), current base = `numericTraitSource`:

```ts
  const liveCorrection = editableBrsCorrection(safeTraits(numericTraitSource), safeTraits(respec.simBase));
  const committedCorrection = committedSim
    ? editableBrsCorrection(safeTraits(numericTraitSource), safeTraits(committedSim.simBase))
    : 0;
  const traitBaseValue = showRespec && respec.isRespecMode
    ? (traitBase ?? 0) + liveCorrection
    : committedSim ? (traitBase ?? 0) + committedCorrection : traitBase;
  // identical pattern for traitWithModsValue and totalBrsValue
```

Delete the now-unused `birthTraitsArr` / `birthBrs` / `simBrs` / `brsDelta` / `committedBirthBrs` / `committedDelta` block (lines 94-99).

- [ ] **Step 5: Run suite + typecheck; commit** — `git commit -am "fix(respec): exact BRS correction across 49/50 boundary (audit H3)"`

---

### Task 6: M1 + LOW-eyes — birth-traits gating and 6-length baseline

**Files:**
- Modify: `src/lib/respec.ts` (`useRespecSimulator`), `src/components/gotchi/GotchiCard.tsx:70,187-191`
- Test: `src/lib/respec.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { computeSimTraits } from "@/lib/respec";

describe("birth baseline integrity (audit M1 + eye slice)", () => {
  it("simBase preserves eye traits from a 6-length baseline", () => {
    const { simBase } = computeSimTraits({
      baseTraits: [1, 2, 3, 4, 90, 80],
      respecBaseTraits: [5, 6, 7, 8, 90, 80],
      allocated: [1, 0, 0, 0],
    });
    expect(simBase[4]).toBe(90);
    expect(simBase[5]).toBe(80);
  });
});
```

- [ ] **Step 2: Implement.**
  - `respec.ts:116`: `setFetchedBirthTraits(traits)` — keep all 6 (remove `.slice(0, 4)`).
  - `useRespecSimulator`: `const birthTraits = fetchedBirthTraits;` — **remove** the `|| params.respecBaseTraits` fallback (audit proved `baseNumericTraits` is never populated; the fallback silently used *current* traits as birth). Remove the `respecBaseTraits` param from the hook's params type; the pure `computeSimTraits` keeps its own `baseTraits` fallback for other callers.
  - `hasBaseline = Array.isArray(fetchedBirthTraits) && fetchedBirthTraits.length >= 4` (already gates the +/- buttons via `disabled`).
  - Add `fetchError: string | null` state set in the `.catch` and returned; rename `usingFallback` → `baselinePending` (true while fetching / not yet fetched) and return it.
  - `GotchiCard.tsx:70`: delete the `respecBaseTraits: gotchi.baseNumericTraits || gotchi.numericTraits` line. Lines 187-191: pill title becomes `respec.fetchError ? "Couldn't load birth traits — respec disabled" : respec.baselinePending ? "Loading birth traits…" : undefined`; render "SP left" only when `hasBaseline`.
  - Delete dead `computeWearableDelta` from `respec.ts:35-54` and its test block (audit M10 dead-code item; it shadows `traits.ts` and would double-count sets).

- [ ] **Step 3: Run suite + typecheck; commit** — `git commit -am "fix(respec): no unphysical pre-fetch baseline; keep 6-trait birth array (audit M1)"`

---

### Task 7: M2 — committed respec carries the absolute target base

**Files:**
- Modify: `src/lib/lockedBuilds.ts:1-5` (type), `src/components/gotchi/GotchiCard.tsx:200-206`, `src/components/gotchi/EditorPanel.tsx:43,250,267,329-334`, `src/components/gotchi/GotchiCarousel.tsx` (locked respec display — read it first)
- Test: extend `src/state/lockedBuilds-persistence.test.ts`

The stored value today is `target − current`; the chain (and the carousel, and the future Save) each need different bases. Store the unambiguous absolute target:

- [ ] **Step 1: Extend the type**

```ts
export interface LockedOverride {
  wearablesBySlot: number[];
  /** @deprecated legacy delta vs current base — kept for old storage entries */
  respecAllocated: number[] | null;
  /** Absolute post-respec base traits [NRG,AGG,SPK,BRN] the user committed. */
  respecTargetBase?: number[] | null;
  timestamp: number;
}
```

- [ ] **Step 2:** `GotchiCard` `onCommitRespec` now emits the target: change the callback signature to `onCommitRespec?: (targetBase: number[]) => void` and call `onCommitRespec(respec.simBase.slice(0, 4))` (line 202). `EditorPanel`'s `committedRespecs` record stores that target (rename the state to `committedRespecTargets` for clarity), and the two `LockedOverride` constructions (lines 250, 267) set `respecTargetBase: committedRespecTargets[instance.instanceId] || null, respecAllocated: null`.

- [ ] **Step 3:** Read `src/components/gotchi/GotchiCarousel.tsx:230-260` (locked display). Update it to prefer `respecTargetBase` (replace the base traits directly) and fall back to applying legacy `respecAllocated` deltas for old storage entries.

- [ ] **Step 4:** Test: lock with a target, reload from storage, assert `respecTargetBase` round-trips.

- [ ] **Step 5: Run suite + typecheck; commit** — `git commit -am "fix(respec): persist absolute target base traits, not current-relative delta (audit M2)"`

---

### Task 8: H4 — wallet-held wearables join the inventory

**Files:**
- Create: `src/lib/hooks/useWalletItemBalances.ts`
- Modify: `src/state/useAppStore.ts` (new `walletItemCounts` field + setter), `src/state/selectors.ts` (`computeOwnedCounts`, `useWearableInventory`), `src/pages/DressPage.tsx` (fetch + push to store)
- Test: `src/state/selectors.test.ts` (extend or create)

- [ ] **Step 1: Failing test** for the selector layer:

```ts
import { computeOwnedCounts } from "@/state/selectors";
// new signature: computeOwnedCounts(gotchis, walletItemCounts)
it("adds wallet-held balances on top of equipped counts (audit H4)", () => {
  const gotchis = [{ id: "1", name: "", numericTraits: [], equippedWearables: [10, 0] } as any];
  expect(computeOwnedCounts(gotchis, { 10: 2, 55: 1 })).toEqual({ 10: 3, 55: 1 });
});
```

- [ ] **Step 2: Implement.**

`computeOwnedCounts(gotchis, walletItemCounts: Record<number, number> = {})` — start `counts` as a copy of `walletItemCounts`, then add equipped as before (equipped items are NOT in `itemBalances`, so add — don't max).

Store: add `walletItemCounts: Record<number, number>` + `setWalletItemCounts` (plain `set`).

Hook `useWalletItemBalances.ts` — same read as `EquipWearablesModal.tsx:80-90` but for many wallets:

```ts
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";

const ITEM_BALANCES_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;

/** Combined on-chain ERC1155 item balances across the given wallets (raw — includes consumables; filter by wearable category at the consumer). */
export function useWalletItemBalances(wallets: string[]) {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const key = wallets.map((w) => w.toLowerCase()).sort().join("|");
  return useQuery({
    queryKey: ["wallet-item-balances", key],
    enabled: wallets.length > 0 && !!publicClient,
    staleTime: 60_000,
    queryFn: async () => {
      const combined: Record<number, number> = {};
      for (const wallet of wallets) {
        const res = (await publicClient!.readContract({
          address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEM_BALANCES_ABI,
          functionName: "itemBalances", args: [wallet as `0x${string}`],
        })) as { itemId: bigint; balance: bigint }[];
        for (const b of res) {
          const id = Number(b.itemId);
          combined[id] = (combined[id] || 0) + Number(b.balance);
        }
      }
      return combined;
    },
  });
}
```

`DressPage`: `const { data: walletItems } = useWalletItemBalances([connectedOwner, ...multiWallets].filter(Boolean) as string[]);` + effect `useEffect(() => { setWalletItemCounts(walletItems ?? {}); }, [walletItems, setWalletItemCounts]);`.

`useWearableInventory`: subscribe `walletItemCounts`, filter to actual wearables before counting (raw `itemBalances` includes consumables/badges): keep only ids where `wearablesById.get(id)?.category === 0` (same rule as `EquipWearablesModal.tsx:87`) — this requires `useWearablesById()` inside the hook or passing the map in; then `computeOwnedCounts(gotchis, filteredWalletCounts)`.

- [ ] **Step 3: Run suite + typecheck; commit** — `git commit -am "feat(dress): wallet-held wearables (itemBalances) join owned inventory (audit H4)"`

---

### Task 9: H7 — dedupe gotchis; manual gotchis are preview-only

**Files:**
- Modify: `src/state/selectors.ts:61-78` (`useWearableInventory`)
- Test: `src/state/selectors.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("does not count a manual gotchi's wearables as owned (audit H7)", () => {
  // wallet gotchi #1 wears 10; manual gotchi #2 wears 20 → ownedCounts has 10, not 20
});
it("a gotchi both manual and in a wallet counts once", () => {
  // wallet [#1 wears 10], manual [#1 wears 10] → ownedCounts[10] === 1
});
```

- [ ] **Step 2: Implement** in `useWearableInventory`:

```ts
    // Manual gotchis are preview-only: their equipped items are NOT owned by the
    // viewer (audit H7). Owned = wallet gotchis' equipped + wallet-held balances.
    const ownedCounts = computeOwnedCounts(gotchis, filteredWalletCounts);
```

(Drop `manualGotchis` from owned entirely; keep editor instances of manual gotchis in `usedCounts` so dressing one still consumes available copies of items you own.) Mommy consequence is intended: you can only auto-dress with items you actually own.

- [ ] **Step 3: Run suite; fix fixtures that relied on manual-gotchi ownership. Commit** — `git commit -am "fix(dress): manual gotchis no longer pollute owned counts (audit H7)"`

---

### Task 10: M5 — no double reservation for locked gotchis open in the editor

**Files:**
- Modify: `src/state/selectors.ts` (`useWearableInventory`)
- Test: `src/state/selectors.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("locked gotchi open in the editor reserves once, not twice (audit M5)", () => {
  // owned 1 of item 10; gotchi #1 locked with item 10 in override; #1 also in editor wearing 10.
  // Expected: availCountsWithLocked[10] === 0 via the editor reservation ONLY —
  // the locked allocation for #1 must be excluded because #1 has an editor instance.
});
```

- [ ] **Step 2: Implement.** In `useWearableInventory`, compute locked allocations only for locked gotchis **without** an editor instance:

```ts
    const editorGotchiIds = new Set(editorInstances.map((i) => i.baseGotchi.id));
    const lockedByIdNotInEditor = Object.fromEntries(
      Object.entries(lockedById).filter(([id]) => !editorGotchiIds.has(id))
    );
    const lockedAllocations = computeLockedWearableAllocations(overridesById, lockedByIdNotInEditor);
```

- [ ] **Step 3: Run suite; commit** — `git commit -am "fix(dress): locked+in-editor gotchis reserve wearables once (audit M5)"`

---

### Task 11: M4 — enforce ownership counts on equip

**Files:**
- Modify: `src/state/useAppStore.ts` (`equipWearable` returns boolean, checks counts), `src/pages/DressPage.tsx:263`, `src/components/gotchi/SlotGrid.tsx` (drop handler), `src/components/wearables/EquipModal.tsx`
- Test: `src/state/equip-enforcement.test.ts` (create)

- [ ] **Step 1: Failing tests**

```ts
describe("equip count enforcement (audit M4)", () => {
  it("rejects equipping a second copy the user doesn't own (both hands, 1 owned)", () => {
    // seed store: wallet gotchi wears nothing, walletItemCounts {77:1}
    // instance A: equip 77 → slot 4: returns true
    // equip 77 → slot 5: returns false, slot 5 stays 0
  });
  it("allows both hands with 2 owned", () => { /* walletItemCounts {77:2} → both succeed */ });
  it("moving the same copy between slots of one instance is free", () => { /* equip 77 slot 0 → slot 2 works with 1 owned */ });
  it("un-owned wearables still equip freely (simulation mode)", () => { /* owned 0 of 88 → equip succeeds */ });
});
```

- [ ] **Step 2: Implement.** `equipWearable` returns `boolean`. Enforcement rule: **only enforce when the user owns at least one copy** — over-equipping beyond the owned count is blocked; equipping items you own zero of stays allowed (pure simulation; the Save feature classifies those as buy/blocked):

```ts
  equipWearable: (instanceId, wearableId, slotIndex) => {
    const state = get();
    const instance = state.editorInstances.find((i) => i.instanceId === instanceId);
    if (!instance) return false;

    // Ownership enforcement (audit M4): if the user owns N > 0 copies, at most N
    // may be placed across all editor instances. Moving a copy within this
    // instance (its old slot gets vacated by this same call) doesn't count.
    const owned = computeOwnedCounts(state.gotchis, state.walletItemCounts)[wearableId] || 0;
    if (owned > 0) {
      let usedElsewhere = 0;
      for (const inst of state.editorInstances) {
        for (let i = 0; i < inst.equippedBySlot.length; i++) {
          if (inst.equippedBySlot[i] !== wearableId) continue;
          const vacatedByThisCall =
            inst.instanceId === instanceId &&
            // same-instance occurrences are cleared by the loop below…
            !((i === 4 || i === 5) && (slotIndex === 4 || slotIndex === 5) && i !== slotIndex);
            // …EXCEPT the other hand slot, which is deliberately kept (dual-wield).
          if (!vacatedByThisCall) usedElsewhere += 1;
        }
      }
      if (usedElsewhere + 1 > owned) return false;
    }
    // …existing slot mutation unchanged…
    return true;
  },
```

(Import `computeOwnedCounts` from selectors; note `walletItemCounts` must be the category-filtered map — reuse the same filtering as `useWearableInventory` by storing the filtered map in the store from DressPage, i.e. `setWalletItemCounts(filtered)`.)

Callers: `DressPage.handleDragEnd`, `SlotGrid` drop, `EquipModal.handleEquip` → on `false`, toast `"You only own {n} of {name}"` (destructive) instead of "Equipped".

- [ ] **Step 3: Run suite + typecheck; commit** — `git commit -am "fix(dress): enforce owned-copy counts on equip (audit M4)"`

---

### Task 12: M3 + H6 — one shared slot-rules helper; fix mobile modal and apply-set

**Files:**
- Create: `src/lib/equipRules.ts` + `src/lib/equipRules.test.ts`
- Modify: `src/pages/DressPage.tsx:243-261`, `src/components/gotchi/SlotGrid.tsx:69-87`, `src/components/wearables/EquipModal.tsx`, `src/components/gotchi/EditorPanel.tsx:50-67` (`applySetToInstance`)

- [ ] **Step 1: Failing tests**

```ts
import { canEquipInSlot, allowedSlotsFor, assignSetSlots } from "@/lib/equipRules";

const w = (over: any) => ({ id: 1, name: "W", traitModifiers: [], rarityScoreModifier: 0, category: 0,
  slotPositions: [false, false, false, false, true, true, false, false], handPlacement: "either", ...over });

describe("equip rules (audit M3/H6)", () => {
  it("left-only wearable cannot go in the right hand even if slotPositions[5] is true", () => {
    expect(canEquipInSlot(w({ handPlacement: "left" }), 5)).toBe(false);
    expect(canEquipInSlot(w({ handPlacement: "left" }), 4)).toBe(true);
  });
  it("either-hand wearable can go in both", () => {
    expect(allowedSlotsFor(w({}))).toEqual([4, 5]);
  });
  it("assignSetSlots places two either-hand pieces into left AND right", () => {
    const a = w({ id: 1 }); const b = w({ id: 2 });
    expect(assignSetSlots([a, b])).toEqual([{ wearableId: 1, slot: 4 }, { wearableId: 2, slot: 5 }]);
  });
  it("assignSetSlots skips unplaceable pieces", () => {
    const a = w({ id: 1, handPlacement: "left" }); const b = w({ id: 2, handPlacement: "left" });
    expect(assignSetSlots([a, b])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement** `src/lib/equipRules.ts` — single source of truth (logic lifted from the currently-correct `DressPage.handleDragEnd`):

```ts
import type { Wearable } from "@/types";

export function canEquipInSlot(wearable: Wearable, slotIndex: number): boolean {
  if (!wearable.slotPositions?.[slotIndex]) return false;
  const hp = wearable.handPlacement || "none";
  const isLeft = slotIndex === 4, isRight = slotIndex === 5;
  if (!isLeft && !isRight) return true;
  return hp === "either" || (hp === "left" && isLeft) || (hp === "right" && isRight)
    || (hp === "none" && !!wearable.slotPositions[slotIndex]);
}

export function allowedSlotsFor(wearable: Wearable): number[] {
  return wearable.slotPositions.map((_, i) => i).filter((i) => canEquipInSlot(wearable, i));
}

/** Greedy slot assignment for a set's pieces; hand pieces fill free hand slots. */
export function assignSetSlots(pieces: Wearable[]): { wearableId: number; slot: number }[] {
  const taken = new Set<number>();
  const placed: { wearableId: number; slot: number }[] = [];
  for (const piece of pieces) {
    const slot = allowedSlotsFor(piece).find((s) => !taken.has(s));
    if (slot === undefined) continue; // unplaceable — caller reports
    taken.add(slot);
    placed.push({ wearableId: piece.id, slot });
  }
  return placed;
}
```

- [ ] **Step 3: Rewire the four callers.**
  - `DressPage.handleDragEnd`: replace inline hand logic with `canEquipInSlot(wearable, slotIndex)`.
  - `SlotGrid` drop handler: same.
  - `EquipModal`: `allowedSlots = allowedSlotsFor(wearable)`; read `editorInstances` from the store; when more than one instance, render a gotchi picker (name + id) above the slot buttons and equip the chosen instance; when the editor is empty, render "Add a gotchi to the editor first" instead of silently closing.
  - `EditorPanel.applySetToInstance`: rebuild on `assignSetSlots(activeSet.wearableIds.map((id) => wearablesById.get(id)).filter(Boolean) as Wearable[])`; if any piece is missing from `wearablesById` or unplaceable, `toast({ title: "Set partially applied", description: "<names>", variant: "destructive" })`.
  - Optionally align `autoDressEngine.precomputeUsableWearables` (`src/lib/autoDressEngine.ts:455-470`) to `allowedSlotsFor` — only if the diff stays trivial; its current stricter behavior is not a bug.

- [ ] **Step 4: Run suite + typecheck; commit** — `git commit -am "fix(dress): single equip-rules helper; mobile modal + apply-set respect hand placement (audit M3/H6)"`

---

### Task 13: H5 — Mommy respec propagates to card, Lock&Set, and Save

**Files:**
- Modify: `src/components/gotchi/EditorPanel.tsx` (`onApply` ~line 484-514, instance trait computation ~line 131-171)

- [ ] **Step 1:** In `onApply`, after `updateEditorInstance(...)`:

```ts
              if (result.respecAllocated) {
                // Mommy's allocation is relative to the CURRENT base traits.
                const target = instance.baseGotchi.numericTraits
                  .slice(0, 4)
                  .map((v, i) => (Number(v) || 0) + (result.respecAllocated![i] || 0));
                setCommittedRespecTargets((prev) => ({ ...prev, [instance.instanceId]: target }));
              }
```

- [ ] **Step 2:** Make the instance's displayed traits respect the committed target: where `computeInstanceTraits` runs for the card (~line 142), build `effectiveBaseTraits` = `committedRespecTargets[instance.instanceId]` (4 values) + original eyes when a target exists, else `baseGotchi.numericTraits`; pass as `baseTraits` to both `computeInstanceTraits` and `GotchiCard baseTraits`. Note `isBaseEquipment` must also treat a committed target as "not base" (subgraph traits no longer apply): `const isBaseEquipment = sameOutfit && !committedRespecTargets[instance.instanceId];`.

- [ ] **Step 3:** Lock&Set already persists `committedRespecTargets` (Task 7) — manual check: run Mommy with a trait-shape goal, card numbers equal banner numbers, lock, carousel shows the same.

- [ ] **Step 4: Run suite + typecheck; commit** — `git commit -am "fix(dress): Mommy respec reaches trait card and Lock&Set (audit H5)"`

---

### Task 14: Mommy invariant visibility + banner eval (M10)

**Files:**
- Modify: `src/components/gotchi/EditorPanel.tsx:381-401` (banner eval), `:484-495` (invariant)

- [ ] **Step 1:** Banner eval: in the Mommy banner's `finalTraitsEval`, pass `modifiedNumericTraits: undefined, withSetsNumericTraits: undefined` unconditionally (the outfit differs by construction; mixing old-outfit subgraph traits with the new outfit is wrong).

- [ ] **Step 2:** Invariant: replace the DEV `console.error + silent return` with a visible toast:

```ts
              if (import.meta.env.DEV && result.success) {
                const bad = result.equippedWearables.find((id) => id !== 0 && !ownedWearables.has(id));
                if (bad) {
                  toast({ title: "Auto-dress bug", description: `Wearable ${bad} is not in owned inventory — build rejected.`, variant: "destructive" });
                  return;
                }
              }
```

(Import `useToast` in `EditorPanel` if absent.)

- [ ] **Step 3: Typecheck; commit** — `git commit -am "fix(dress): visible Mommy invariant failure; banner eval uses new outfit only (audit M10)"`

---

### Task 15: M7 — error banner recovery + single toast per error transition

**Files:**
- Modify: `src/pages/DressPage.tsx:130-158`

- [ ] **Step 1: Implement**

```ts
  const lastToastedError = useRef<string | null>(null);
  useEffect(() => {
    setLoadingGotchis(isLoadingGotchis);
    if (gotchiError) {
      setError(gotchiError);
      if (lastToastedError.current !== gotchiError) {
        lastToastedError.current = gotchiError;
        toast({ title: "Error Loading Gotchis", description: gotchiError, variant: "destructive" });
      }
    } else if (!isLoadingGotchis) {
      // all queries settled without error — clear stale banner (audit M7)
      lastToastedError.current = null;
      setError(null);
    }
    if (!isLoadingGotchis) {
      setGotchis(combinedGotchis);
    }
  }, [ /* same dependency list as today */ ]);
```

- [ ] **Step 2: Typecheck; manual check (kill network → error toast once; restore → banner clears). Commit** — `git commit -am "fix(dress): clear error banner on recovery; toast once per error (audit M7)"`

---

### Task 16: M8 — explorer spend-points validation uses absolute costs

**Files:**
- Modify: `src/components/explorer/GotchiActionsPanel.tsx:143,363-365`

- [ ] **Step 1:** `const spSum = sp.reduce((s, v) => s + Math.abs(Math.trunc(Number(v) || 0)), 0);`
Button gate stays `spSum > 0 && spSum <= (availablePoints || 0)` — pure-negative spends (valid on-chain) now pass; `+2,−3` with 2 available is blocked (cost 5).

- [ ] **Step 2: Typecheck; commit** — `git commit -am "fix(explorer): spend-points cost = sum of absolute values (audit M8)"`

---

### Task 17: M9 — clean up orphaned editor state

**Files:**
- Modify: `src/components/gotchi/EditorPanel.tsx` (cleanup on remove), `src/pages/DressPage.tsx` (prune instances when gotchis disappear)

- [ ] **Step 1:** `EditorPanel`: wrap instance removal in `handleRemoveInstance(instanceId)` — calls `clearMommyState(instanceId)`, deletes `committedRespecTargets[instanceId]`, then `removeEditorInstance(instanceId)`. Use it for the X button.

- [ ] **Step 2:** `DressPage`: prune stale instances only after a settled, non-empty load (mirrors the C1 guard):

```ts
  useEffect(() => {
    if (isLoadingGotchis || combinedGotchis.length === 0) return;
    const valid = new Set([...combinedGotchis.map((gg) => gg.id), ...manualGotchis.map((gg) => gg.id)]);
    const { editorInstances, removeEditorInstance } = useAppStore.getState();
    for (const inst of editorInstances) {
      if (!valid.has(inst.baseGotchi.id)) removeEditorInstance(inst.instanceId);
    }
  }, [combinedGotchis, isLoadingGotchis, manualGotchis]);
```

- [ ] **Step 3: Typecheck; manual check (remove a wallet with an open instance → instance disappears). Commit** — `git commit -am "fix(dress): prune orphaned editor instances and per-instance state (audit M9)"`

---

### Task 18: M10 — canonical trait fallback order

**Files:**
- Modify: `src/lib/traits.ts:39-67` (`getCanonicalModifiedTraits`)
- Test: `src/lib/traits.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("prefers withSets > local > wearables-only (audit M10)", () => {
  const base = [10, 10, 10, 10, 1, 1];
  const modified = [12, 10, 10, 10, 1, 1];       // wearables only (no sets)
  const local = [13, 10, 10, 10, 1, 1];          // wearables + sets, locally computed
  const withSets = [13, 11, 10, 10, 1, 1];       // authoritative
  expect(getCanonicalModifiedTraits(base, modified, local, withSets)).toEqual(withSets);
  // KEY case: no withSets from subgraph → local (has set mods) must beat modified (doesn't)
  expect(getCanonicalModifiedTraits(base, modified, local, undefined)).toEqual(local);
  expect(getCanonicalModifiedTraits(base, modified, undefined, undefined)).toEqual(modified);
  expect(getCanonicalModifiedTraits(base, undefined, undefined, undefined)).toEqual(base);
});
```

- [ ] **Step 2:** Read the current implementation, reorder the preference to `withSetsTraits ?? localComputedTraits ?? modifiedTraits ?? baseTraits` (keep the existing 6-length-finite validation per candidate). Run the whole suite — behavior only changes for the partial-fetch case.

- [ ] **Step 3: Run suite; commit** — `git commit -am "fix(traits): canonical fallback prefers set-inclusive local traits (audit M10)"`

---

### Task 19: Lows batch 1 — data & math polish

**Files:**
- Modify: `src/lib/rarity.ts:158-171`, `src/components/gotchi/GotchiCard.tsx:124`, `src/state/selectors.ts` (`useSortedGotchis`)
- Test: `src/lib/rarity.test.ts`

- [ ] **Step 1:** `wearableRarityToBrs`: invert preference — authoritative `rarityScoreModifier` first, rarity-string mapping as fallback only. Test: `{ rarityScoreModifier: 12, rarity: "legendary" }` yields 12 (not 10).

- [ ] **Step 2:** `GotchiCard.tsx:124`: rename `data-modified-score` → `data-total-score`. **Grep first**: `Grep "data-modified-score"` across `src/`, `tests/`, `e2e/` and update every consumer (Playwright specs included).

- [ ] **Step 3:** `useSortedGotchis`: precompute each gotchi's score once (`map` → `{ gotchi, score }`), sort by score, unwrap. Read the current comparator to extract the score expression faithfully.

- [ ] **Step 4:** `src/lib/cache.ts:22-25`: the TTL check inside `cacheGet` is dead code (it returns data regardless when the version matches) — either delete the dead branch or make it honor TTL with an explicit `{ allowStale: true }` option used by current callers; keep behavior identical (stale-while-revalidate), just make the code say what it does.

- [ ] **Step 5:** Chatty "Equipped" toast (`DressPage.tsx:264-267` + `SlotGrid`): drop the success toast on every drop; keep only the destructive "Invalid Slot"/"You only own N" toasts. The slot visibly updating IS the success feedback.

- [ ] **Step 6: Run suite + typecheck; commit** — `git commit -am "chore(dress): rarity modifier precedence, test-hook rename, sort perf, cache/toast cleanup (audit lows)"`

---

### Task 20: Lows batch 2 — catwalk + undo Mommy

**Files:**
- Modify: `src/components/catwalk/CatwalkModal.tsx`, `src/components/gotchi/EditorPanel.tsx`

- [ ] **Step 1:** Read `CatwalkModal.tsx` fully. Reduced-motion: show each gotchi as a static card for a fixed 2.5s `setTimeout` (no walk animation) before advancing, instead of synchronously skipping the whole show. Empty list: render "No gotchis to strut." + close button instead of the bare black stage.

- [ ] **Step 2:** Undo Mommy: in the "Build Applied" banner row, add a small ghost `Undo` button that calls `updateEditorInstance(instance.instanceId, mommyPreEquipped[instance.instanceId] ?? instance.baseGotchi.equippedWearables)`, clears the instance's Mommy state (`clearMommyState`) and removes any Mommy-committed respec target. The pre-Mommy snapshot is already captured (~line 498).

- [ ] **Step 3: Typecheck; manual check both. Commit** — `git commit -am "feat(dress): undo Mommy build; catwalk reduced-motion + empty states (audit lows)"`

---

### Task 21: Test hardening

**Files:**
- Modify: `src/lib/respec.test.ts`, `src/lib/traits-conformance.test.ts`, `src/lib/rarity.test.ts`

- [ ] **Step 1:** Conformance: for fixtures with no patched wearables and unchanged outfits, assert local `finalTraits` equals the subgraph `withSetsNumericTraits` exactly (not just "6 finite numbers").
- [ ] **Step 2:** Add a superset-outfit fixture (full Super Aagent outfit, ids from `data/wearableSets.json`) pinned to the official single-set BRS number (compute by hand from the set data; document the arithmetic in a comment).
- [ ] **Step 3:** Respec: extend the `simBase[4..5]` eye-passthrough assertion with a non-zero allocation case.
- [ ] **Step 4: Run suite; commit** — `git commit -am "test(dress): pin conformance to official numbers; superset fixture (audit lows)"`

---

### Task 22: Full verification pass

- [ ] `npx vitest run` — all green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Production build script from `package.json` — clean.
- [ ] Dev server + /dress with a real wallet: owned counts include wallet-held items; respec numbers stable; no error-banner residue; locks survive F5 and wallet-set changes.
- [ ] Cross-check one gotchi's card numbers against the explorer manage modal AND the subgraph `withSetsRarityScore` — must match exactly (user's parity requirement).
- [ ] Commit stragglers.
