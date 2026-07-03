# /dress Save-to-Gotchi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small per-gotchi "Save on-chain" button on /dress that commits the simulated outfit + committed respec to the chain — stealing wearables from the user's other gotchis (with warning), buying missing ones from the Baazaar, and running the real respec — exactly per `docs/superpowers/specs/2026-07-02-dress-save-to-gotchi-design.md`.

**Architecture:** Pure planner (`savePlan.ts`, fully unit-tested) → executor hook (`useSaveOutfit.ts`, wagmi writeContractAsync sequence, one receipt-wait per step) → small UI (`SaveOutfitButton.tsx` in the editor card's action column). Data prerequisites (walletItemCounts, respecTargetBase, availableSkillPoints hook, equipRules) come from the companion plan `2026-07-02-dress-audit-fixes.md`, which MUST be executed first.

**Tech Stack:** React 18, zustand, wagmi/viem (Base 8453), @tanstack/react-query, vitest.

**Verified on-chain/in-repo facts the plan relies on:**
- `equipWearables(uint256 _tokenId, uint16[16] _wearablesToEquip)` — proven in `src/components/explorer/EquipWearablesModal.tsx:12-14,108-121`.
- `resetSkillPoints(uint32)`, `spendSkillPoints(uint256, int16[4])`, `respecCount(uint32)`, `availableSkillPoints(uint256)` — proven in `src/components/explorer/GotchiActionsPanel.tsx:25-50`.
- Buy = ensure GHST allowance to the diamond, then `executeERC1155ListingToRecipient(listingId, contractAddress, tokenId, quantity, priceInWei, recipient)` — front-run protected (reverts if the listing changed); proven in `src/hooks/useMarketplaceBuy.ts:70-118`.
- A wearable equipped on gotchi A is held BY A; equipping it elsewhere first requires an `equipWearables` call on A without it.
- `spendSkillPoints` values are vs the post-reset (birth) base; committed respec stores `respecTargetBase` (absolute) per audit fix M2 → values = `targetBase[i] − birth[i]`.

---

### Task 1: Baazaar cheapest-listing lookup for wearables

**Files:**
- Create: `src/lib/hooks/useCheapestWearableListings.ts`
- Reference first: `Grep "erc1155Listings" src/ --type ts` — reuse the existing query shape/fields (there is Baazaar listing code in `src/lib/baazaar*.ts` and explorer components; copy its where-clause conventions exactly).

- [ ] **Step 1:** Read the existing erc1155 listing queries found by the grep. Note the subgraph access pattern (`coreSubgraphFetch` + `CORE_SUBGRAPH_URL`, see `GotchiActionsPanel.tsx:127` — ALWAYS `coreSubgraphFetch`, never raw fetch, per repo rule).

- [ ] **Step 2:** Implement:

```ts
import { useQuery } from "@tanstack/react-query";
import { coreSubgraphFetch } from "@/lib/subgraph";
import { CORE_SUBGRAPH_URL } from "@/lib/lending/contracts";

export type WearableListing = { listingId: string; wearableId: number; priceInWei: string };

/** Cheapest active Baazaar listing per wearable id. staleTime 0 — save flows must not act on stale prices. */
export function useCheapestWearableListings(wearableIds: number[], enabled: boolean) {
  const key = [...wearableIds].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["cheapest-wearable-listings", key],
    enabled: enabled && wearableIds.length > 0,
    staleTime: 0,
    gcTime: 30_000,
    queryFn: async (): Promise<Record<number, WearableListing>> => {
      // One aliased query per id keeps it a single round trip.
      const parts = wearableIds.map(
        (id, i) =>
          `l${i}: erc1155Listings(first: 1, orderBy: priceInWei, orderDirection: asc,
             where: { erc1155TypeId: "${id}", category: 0, cancelled: false, sold: false }) {
             id erc1155TypeId priceInWei quantity }`
      );
      const res = await coreSubgraphFetch(CORE_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ ${parts.join("\n")} }` }),
      });
      const json = await res.json();
      const out: Record<number, WearableListing> = {};
      wearableIds.forEach((id, i) => {
        const row = json.data?.[`l${i}`]?.[0];
        if (row && Number(row.quantity) > 0) {
          out[id] = { listingId: row.id, wearableId: id, priceInWei: row.priceInWei };
        }
      });
      return out;
    },
  });
}
```

**Verify the where-clause field names against the repo's working Baazaar queries from Step 1 before committing** (exact spelling of `erc1155TypeId`, `category`, `sold` vs other flags differs between subgraph deployments — mirror what the repo already uses successfully).

- [ ] **Step 3:** Typecheck; commit — `git commit -am "feat(save): cheapest Baazaar listing lookup per wearable"`

---

### Task 2: `savePlan` — the pure classifier

**Files:**
- Create: `src/lib/savePlan.ts`, `src/lib/savePlan.test.ts`

- [ ] **Step 1: Write the failing tests** (the heart of the feature — thorough, test-first):

```ts
import { describe, expect, it } from "vitest";
import { planSave, type SavePlanInput } from "@/lib/savePlan";

const base = (over: Partial<SavePlanInput> = {}): SavePlanInput => ({
  targetGotchiId: "100",
  desiredSlots: [0, 0, 0, 0, 0, 0, 0, 0],
  currentSlots: [0, 0, 0, 0, 0, 0, 0, 0],
  walletBalances: {},
  ownedGotchis: [],
  respec: null,
  listingsByWearable: {},
  ...over,
});

describe("planSave (spec: save classifier)", () => {
  it("no changes + no respec → empty plan", () => {
    expect(planSave(base()).steps).toEqual([]);
  });

  it("wallet-held wearable → single equip step", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0], walletBalances: { 7: 1 } }));
    expect(p.steps).toEqual([
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(p.blocked).toEqual([]);
  });

  it("already equipped on target → no acquisition needed (slot move)", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0], currentSlots: [0, 7, 0, 0, 0, 0, 0, 0] }));
    expect(p.steps).toEqual([
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
  });

  it("steal: wearable on another owned gotchi → unequip there first, with warning", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [7, 3, 0, 0, 0, 0, 0, 0], locked: false }],
    }));
    expect(p.steps).toEqual([
      { kind: "unequip", gotchiId: "200", slots16: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stolen: [7] },
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(p.warnings).toEqual([{ wearableId: 7, fromGotchiId: "200" }]);
  });

  it("locked (rented) source gotchis are not stealable → blocked when no listing", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [7, 0, 0, 0, 0, 0, 0, 0], locked: true }],
    }));
    expect(p.blocked).toEqual([{ wearableId: 7, reason: "unobtainable" }]);
    expect(p.steps).toEqual([]);
  });

  it("baazaar: not owned anywhere but listed → buy step before equip", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      listingsByWearable: { 7: { listingId: "555", priceInWei: "1000000000000000000" } },
    }));
    expect(p.steps[0]).toEqual({ kind: "buy", wearableId: 7, listingId: "555", priceInWei: "1000000000000000000", quantity: 1 });
    expect(p.steps[1].kind).toBe("equip");
    expect(p.totalBuyCostWei).toBe(1000000000000000000n);
  });

  it("duplicates: same id in both hands needs 2 sources (1 wallet + 1 steal)", () => {
    const p = planSave(base({
      desiredSlots: [0, 0, 0, 0, 9, 9, 0, 0],
      walletBalances: { 9: 1 },
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [0, 0, 0, 0, 9, 0, 0, 0], locked: false }],
    }));
    expect(p.steps.filter((s) => s.kind === "unequip")).toHaveLength(1);
    expect(p.warnings).toHaveLength(1);
  });

  it("respec present → reset + spend, values = target − birth", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      walletBalances: { 7: 1 },
      respec: { targetBase: [50, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["resetSkillPoints", "spendSkillPoints", "equip"]);
    const spend = p.steps.find((s) => s.kind === "spendSkillPoints") as any;
    expect(spend.values).toEqual([2, 0, 0, 0]);
  });

  it("respec with target === birth skips the spend step", () => {
    const p = planSave(base({
      respec: { targetBase: [48, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 1 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["resetSkillPoints"]);
  });

  it("unobtainable wearable blocks the whole plan (no partial save)", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0] }));
    expect(p.blocked).toEqual([{ wearableId: 7, reason: "unobtainable" }]);
    expect(p.steps).toEqual([]);
  });

  it("step order: buys → respec → unequips → final equip", () => {
    const p = planSave(base({
      desiredSlots: [7, 8, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [8, 0, 0, 0, 0, 0, 0, 0], locked: false }],
      listingsByWearable: { 7: { listingId: "555", priceInWei: "5" } },
      respec: { targetBase: [50, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 2 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["buy", "resetSkillPoints", "spendSkillPoints", "unequip", "equip"]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/savePlan.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/savePlan.ts`:**

```ts
export type SaveStep =
  | { kind: "buy"; wearableId: number; listingId: string; priceInWei: string; quantity: number }
  | { kind: "resetSkillPoints" }
  | { kind: "spendSkillPoints"; values: number[] }
  | { kind: "unequip"; gotchiId: string; slots16: number[]; stolen: number[] }
  | { kind: "equip"; gotchiId: string; slots16: number[] };

export type SavePlanInput = {
  targetGotchiId: string;
  desiredSlots: number[];   // length 8
  currentSlots: number[];   // length 8, on-chain state of the target
  walletBalances: Record<number, number>;
  ownedGotchis: { gotchiId: string; equippedWearables: number[]; locked: boolean }[];
  respec: { targetBase: number[]; birthBase: number[]; respecCount: number } | null;
  listingsByWearable: Record<number, { listingId: string; priceInWei: string }>;
};

export type SavePlan = {
  steps: SaveStep[];
  warnings: { wearableId: number; fromGotchiId: string }[];
  blocked: { wearableId: number; reason: "unobtainable" }[];
  totalBuyCostWei: bigint;
};

const to16 = (slots8: number[]): number[] =>
  [...slots8, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16).map((n) => Number(n) || 0);

/**
 * Deterministic save classifier (spec: docs/superpowers/specs/2026-07-02-dress-save-to-gotchi-design.md).
 * Resolves every needed wearable copy in priority order:
 * on-target → wallet → steal from owned unlocked gotchi → cheapest listing → blocked.
 * Duplicate ids are counted per copy. Step order: buys → respec → unequips → equip.
 * Any blocked wearable empties the plan — no partial saves.
 */
export function planSave(input: SavePlanInput): SavePlan {
  const warnings: SavePlan["warnings"] = [];
  const blocked: SavePlan["blocked"] = [];
  const buys: SaveStep[] = [];
  let totalBuyCostWei = 0n;

  const needed = new Map<number, number>();
  for (const id of input.desiredSlots) {
    if (id) needed.set(id, (needed.get(id) || 0) + 1);
  }
  const onTarget = new Map<number, number>();
  for (const id of input.currentSlots) {
    if (id) onTarget.set(id, (onTarget.get(id) || 0) + 1);
  }

  const wallet = { ...input.walletBalances };
  const sources = input.ownedGotchis
    .filter((g) => !g.locked && g.gotchiId !== input.targetGotchiId)
    .map((g) => ({ gotchiId: g.gotchiId, slots: [...g.equippedWearables] }));
  const stolenBySource = new Map<string, number[]>();

  for (const [id, count] of needed) {
    let remaining = count - (onTarget.get(id) || 0);
    while (remaining > 0 && (wallet[id] || 0) > 0) {
      wallet[id] -= 1;
      remaining -= 1;
    }
    while (remaining > 0) {
      const src = sources.find((s) => s.slots.includes(id));
      if (!src) break;
      src.slots[src.slots.indexOf(id)] = 0;
      const stolen = stolenBySource.get(src.gotchiId) || [];
      stolen.push(id);
      stolenBySource.set(src.gotchiId, stolen);
      warnings.push({ wearableId: id, fromGotchiId: src.gotchiId });
      remaining -= 1;
    }
    // One listing per id; buying multiple copies of the same id in one save is
    // out of scope — blocked instead. Keeps the flow predictable.
    if (remaining === 1 && input.listingsByWearable[id]) {
      const l = input.listingsByWearable[id];
      buys.push({ kind: "buy", wearableId: id, listingId: l.listingId, priceInWei: l.priceInWei, quantity: 1 });
      totalBuyCostWei += BigInt(l.priceInWei);
      remaining = 0;
    }
    if (remaining > 0) blocked.push({ wearableId: id, reason: "unobtainable" });
  }

  if (blocked.length > 0) {
    return { steps: [], warnings, blocked, totalBuyCostWei: 0n };
  }

  const steps: SaveStep[] = [...buys];

  if (input.respec) {
    steps.push({ kind: "resetSkillPoints" });
    const values = input.respec.targetBase.map(
      (t, i) => (Number(t) || 0) - (Number(input.respec!.birthBase[i]) || 0)
    );
    if (values.some((v) => v !== 0)) {
      steps.push({ kind: "spendSkillPoints", values });
    }
  }

  for (const src of input.ownedGotchis) {
    const stolen = stolenBySource.get(src.gotchiId);
    if (!stolen) continue;
    const remainingSlots = sources.find((s) => s.gotchiId === src.gotchiId)!.slots;
    steps.push({ kind: "unequip", gotchiId: src.gotchiId, slots16: to16(remainingSlots), stolen });
  }

  const outfitChanged = input.desiredSlots.some((id, i) => (id || 0) !== (input.currentSlots[i] || 0));
  if (outfitChanged) {
    steps.push({ kind: "equip", gotchiId: input.targetGotchiId, slots16: to16(input.desiredSlots) });
  }

  return { steps, warnings, blocked, totalBuyCostWei };
}
```

- [ ] **Step 4: Run tests** — all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(save): pure save-plan classifier with steal/buy/respec ordering"`

---

### Task 3: `useSaveOutfit` — the executor hook

**Files:**
- Create: `src/hooks/useSaveOutfit.ts`

- [ ] **Step 1: Implement** (mirrors the proven `useMarketplaceBuy.buy` and `GotchiActionsPanel.run` patterns — sequential, one receipt per step, abort on first failure):

```ts
import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE, GHST_TOKEN_BASE, ERC20_ABI, ERC1155_MARKETPLACE_ABI, MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { qk } from "@/lib/queryKeys";
import type { SaveStep } from "@/lib/savePlan";

const EQUIP_ABI = [
  { name: "equipWearables", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_wearablesToEquip", type: "uint16[16]" }], outputs: [] },
] as const;
const RESPEC_ABI = [
  { name: "resetSkillPoints", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
] as const;

export type SaveProgress =
  | { phase: "idle" }
  | { phase: "running"; stepIndex: number; total: number; label: string }
  | { phase: "success" }
  | { phase: "error"; stepIndex: number; label: string; message: string };

function stepLabel(step: SaveStep): string {
  switch (step.kind) {
    case "buy": return `Buying wearable #${step.wearableId}`;
    case "resetSkillPoints": return "Respec: resetting skill points";
    case "spendSkillPoints": return "Respec: spending skill points";
    case "unequip": return `Removing from gotchi #${step.gotchiId}`;
    case "equip": return `Equipping gotchi #${step.gotchiId}`;
  }
}

/** Executes a SavePlan sequentially; each step waits for its receipt. Aborts on the first failure. */
export function useSaveOutfit() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [progress, setProgress] = useState<SaveProgress>({ phase: "idle" });

  const reset = useCallback(() => setProgress({ phase: "idle" }), []);

  const execute = useCallback(
    async (targetGotchiId: string, steps: SaveStep[]) => {
      if (!isConnected || !address || !publicClient) {
        setProgress({ phase: "error", stepIndex: 0, label: "Wallet", message: "Connect your wallet first" });
        return false;
      }
      if (chainId !== BASE_CHAIN_ID) {
        setProgress({ phase: "error", stepIndex: 0, label: "Network", message: "Switch to Base" });
        return false;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgress({ phase: "running", stepIndex: i, total: steps.length, label: stepLabel(step) });
        try {
          let hash: `0x${string}`;
          if (step.kind === "buy") {
            const price = BigInt(step.priceInWei);
            const allowance = (await publicClient.readContract({
              address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "allowance",
              args: [address, AAVEGOTCHI_DIAMOND_BASE],
            })) as bigint;
            if (allowance < price) {
              const ah = await writeContractAsync({
                chainId: BASE_CHAIN_ID, address: GHST_TOKEN_BASE, abi: ERC20_ABI,
                functionName: "approve", args: [AAVEGOTCHI_DIAMOND_BASE, MAX_UINT256],
              });
              await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
            }
            hash = await writeContractAsync({
              chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI,
              functionName: "executeERC1155ListingToRecipient",
              args: [BigInt(step.listingId), AAVEGOTCHI_DIAMOND_BASE, BigInt(step.wearableId), BigInt(step.quantity), BigInt(step.priceInWei), address],
            });
          } else if (step.kind === "resetSkillPoints") {
            hash = await writeContractAsync({
              chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: RESPEC_ABI,
              functionName: "resetSkillPoints", args: [Number(targetGotchiId)],
            });
          } else if (step.kind === "spendSkillPoints") {
            hash = await writeContractAsync({
              chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: RESPEC_ABI,
              functionName: "spendSkillPoints",
              args: [BigInt(targetGotchiId), step.values as [number, number, number, number]],
            });
          } else {
            // unequip and equip are both equipWearables calls
            hash = await writeContractAsync({
              chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: EQUIP_ABI,
              functionName: "equipWearables",
              args: [BigInt(step.gotchiId), step.slots16 as unknown as readonly number[] & { length: 16 }],
            });
          }
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        } catch (e) {
          setProgress({ phase: "error", stepIndex: i, label: stepLabel(step), message: parseRevert(e).slice(0, 160) });
          // Refetch so partial progress (e.g. bought but not equipped) shows truthfully.
          queryClient.invalidateQueries({ queryKey: qk.gotchis() });
          queryClient.invalidateQueries({ queryKey: ["wallet-item-balances"] });
          return false;
        }
      }
      setProgress({ phase: "success" });
      queryClient.invalidateQueries({ queryKey: qk.gotchis() });
      queryClient.invalidateQueries({ queryKey: ["wallet-item-balances"] });
      queryClient.invalidateQueries({ queryKey: ["cheapest-wearable-listings"] });
      return true;
    },
    [isConnected, address, publicClient, chainId, writeContractAsync, queryClient]
  );

  return { execute, progress, reset };
}
```

Check `qk.gotchis()` supports the no-arg broad form in `src/lib/queryKeys.ts` (used exactly this way in `useMarketplaceBuy.ts:122`); if it requires an owner, invalidate with the prefix array instead.

- [ ] **Step 2: Typecheck; commit** — `git commit -am "feat(save): sequential on-chain save executor hook"`

---

### Task 4: connected-owned gotchi tracking

**Files:**
- Modify: `src/state/useAppStore.ts` (add `connectedOwnedIds: Set<string>` + `setConnectedOwnedIds` — plain `set`), `src/pages/DressPage.tsx`

- [ ] **Step 1:** Store field + setter following the pattern of the other setters.

- [ ] **Step 2:** `DressPage`:

```ts
  const setConnectedOwnedIds = useAppStore((s) => s.setConnectedOwnedIds);
  useEffect(() => {
    setConnectedOwnedIds(new Set(connectedOwner ? connectedResult.gotchis.map((gg) => gg.id) : []));
  }, [connectedOwner, connectedResult.gotchis, setConnectedOwnedIds]);
```

- [ ] **Step 3:** Typecheck; commit — `git commit -am "feat(save): track connected wallet's gotchi ids in store"`

---

### Task 5: `SaveOutfitButton` — obvious but not obtrusive

**Files:**
- Create: `src/components/gotchi/SaveOutfitButton.tsx`
- Modify: `src/components/gotchi/EditorPanel.tsx` (render in the action column), `src/state/useAppStore.ts` (`rebaseEditorInstance` action)

**UI requirements (user's words: "obvious but not obtrusive and mess up UX", "Small and do not jack up UI"):**
- Rendered at the bottom of the editor card's left action column (under the Mommy button), full column width, compact (h-7, text-[10px], like siblings).
- Renders `null` when ineligible; as the LAST element in the column its appearance never reflows siblings.
- Accent styling so it clearly pops against the ghost icon buttons: `bg-gradient-to-r from-primary to-fuchsia-500 text-white font-bold shadow`; one-time attention pulse on first becoming eligible (`animate-pulse` applied for 2s via a state + timeout, then removed).
- Click → compact confirm popover (absolutely-positioned card anchored to the button, `z-50`, NOT a modal): ordered step list with buy prices in GHST, steal warnings ("Removes {wearable name} from #{gotchiId}"), respec fee note when `respecCount > 0` ("Respec #N — a fee applies"), total signature count. Confirm / Cancel buttons.
- During execution the popover body becomes a single progress line ("Step 2/4 — Removing from gotchi #1234…"); on success, "Saved on-chain ✓" auto-clears after 4s; on error, the failed step + `parseRevert` message + Retry button (Retry re-opens the confirm with a freshly recomputed plan — never replays a stale plan).

- [ ] **Step 1: Add `rebaseEditorInstance` to the store** — after a successful save the instance must treat the new on-chain state as its baseline so the dirty flag clears:

```ts
  rebaseEditorInstance: (instanceId: string, equippedWearables: number[], newBaseTraits?: number[]) =>
    set((state) => ({
      editorInstances: state.editorInstances.map((inst) =>
        inst.instanceId === instanceId
          ? {
              ...inst,
              baseGotchi: {
                ...inst.baseGotchi,
                equippedWearables: [...equippedWearables],
                ...(newBaseTraits ? { numericTraits: [...newBaseTraits] } : {}),
                // Post-respec the subgraph-precomputed traits are stale until reindex:
                ...(newBaseTraits ? { modifiedNumericTraits: undefined, withSetsNumericTraits: undefined } : {}),
              },
              equippedBySlot: [...equippedWearables].slice(0, 8),
            }
          : inst
      ),
    })),
```

- [ ] **Step 2: Implement the component.** Props:

```ts
export function SaveOutfitButton(props: {
  gotchiId: string;               // numeric token id
  instanceId: string;
  desiredSlots: number[];         // instance.equippedBySlot
  currentSlots: number[];         // instance.baseGotchi.equippedWearables
  respecTarget?: number[];        // committedRespecTargets[instanceId]
  locked: boolean;                // lending/lentOut
  onSaved: (finalSlots: number[], respecTargetApplied?: number[]) => void;
})
```

Internal wiring:
- Eligibility gate (pure helper `isSaveEligible`, Task 6): `connectedOwnedIds.has(...)` from the store, `useAccount().isConnected`, `useChainId() === BASE_CHAIN_ID`, `!locked`, dirty-or-respec. Ineligible → `null`.
- On popover open, gather fresh inputs:
  - wallet balances: `useWalletItemBalances([connectedAddress])` — **connected wallet only** (watch-only wallets' items are not spendable), category-filtered to wearables;
  - owned gotchis: store `gotchis` filtered by `connectedOwnedIds`, each `{ gotchiId: g.gotchiId || g.id, equippedWearables, locked: !!(g.lending || g.lentOut) }`;
  - listings: `useCheapestWearableListings(missingIds, open)` where `missingIds` = desired ids not coverable by wallet+steal (compute by running `planSave` once without listings and reading `blocked`);
  - respec inputs when `respecTarget` present: `getRespecBaseTraits(gotchiId)` (async, from `@/lib/respec`) for `birthBase`; `respecCount` via `useReadContract` (`respecCount(uint32)` ABI as in `GotchiActionsPanel.tsx:43-45`).
- `const plan = planSave({...})`; popover renders `plan.steps` (resolve wearable names via `useWearablesById()`), `plan.warnings`, `Number(plan.totalBuyCostWei) / 1e18` GHST, and disables Confirm with the reason when `plan.blocked.length > 0` ("You don't own {name} and it isn't listed on the Baazaar").
- Confirm → `useSaveOutfit().execute(gotchiId, plan.steps)`; on success `props.onSaved(desiredSlots, respecTarget)`.

- [ ] **Step 3: Wire into `EditorPanel`** (action column, after the Mommy button):

```tsx
<SaveOutfitButton
  gotchiId={instance.baseGotchi.gotchiId || instance.baseGotchi.id}
  instanceId={instance.instanceId}
  desiredSlots={instance.equippedBySlot}
  currentSlots={instance.baseGotchi.equippedWearables}
  respecTarget={committedRespecTargets[instance.instanceId]}
  locked={!!(instance.baseGotchi.lending || instance.baseGotchi.lentOut)}
  onSaved={(finalSlots, respecApplied) => {
    if (respecApplied) {
      const eyes = instance.baseGotchi.numericTraits.slice(4, 6);
      rebaseEditorInstance(instance.instanceId, finalSlots, [...respecApplied, ...eyes]);
      setCommittedRespecTargets((prev) => { const n = { ...prev }; delete n[instance.instanceId]; return n; });
    } else {
      rebaseEditorInstance(instance.instanceId, finalSlots);
    }
  }}
/>
```

- [ ] **Step 4: Typecheck; dev-server smoke:** wallet disconnected → no button; watch-only gotchi → no button; owned gotchi + changed outfit → button appears with pulse, popover lists correct steps. Commit — `git commit -am "feat(dress): Save on-chain button with confirm popover and progress"`

---

### Task 6: eligibility gating — pure + tested

**Files:**
- Modify: `src/components/gotchi/SaveOutfitButton.tsx` (export pure helper)
- Create: `src/components/gotchi/saveEligibility.test.ts`

- [ ] **Step 1:**

```ts
export function isSaveEligible(p: {
  isConnected: boolean; onBase: boolean; connectedOwned: boolean; locked: boolean;
  desiredSlots: number[]; currentSlots: number[]; hasRespecTarget: boolean;
}): boolean {
  if (!p.isConnected || !p.onBase || !p.connectedOwned || p.locked) return false;
  const dirty = p.desiredSlots.some((id, i) => (id || 0) !== (p.currentSlots[i] || 0));
  return dirty || p.hasRespecTarget;
}
```

Tests: each gate flag independently flips the result; clean outfit + no respec → false; respec-only → true; slot-order change → true.

- [ ] **Step 2: Run suite; commit** — `git commit -am "test(save): eligibility gating"`

---

### Task 7: Parity verification (the user's hard requirement)

- [ ] **Step 1:** `npx vitest run` + `npx tsc --noEmit` + production build — all clean.
- [ ] **Step 2:** Dev-server manual run against a real owned gotchi:
  1. **Wallet-held case:** change one wearable → Save → 1 signature → /dress card, explorer manage modal, and subgraph `equippedWearables` all agree.
  2. **Steal case:** equip a wearable currently on another owned gotchi → warning names the source → 2 signatures → source lost it everywhere.
  3. **Respec case:** commit a respec → Save → reset+spend → traits on /dress equal on-chain `getAavegotchi` values and the explorer's numbers; the pre-save simulated numbers equal the post-save reality (THE parity requirement — "what it shows for traits is actual what it will be after the save").
  4. **Baazaar case** (cheap wearable): drag a listed un-owned wearable → Save shows the live price → buy+equip → owned & equipped.
- [ ] **Step 3:** Update the spec status → implemented; note deviations if any.
- [ ] **Step 4: Commit** — `git commit -am "feat(dress): save-to-gotchi complete — parity verified against chain and explorer"`
