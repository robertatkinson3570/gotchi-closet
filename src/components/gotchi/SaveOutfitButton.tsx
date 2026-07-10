import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId, usePublicClient, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/ui/button";
import { useAppStore } from "@/state/useAppStore";
import { useWearablesById } from "@/state/selectors";
import { planSave, type SavePlan } from "@/lib/savePlan";
import { useSaveOutfit, type SaveProgress } from "@/hooks/useSaveOutfit";
import { useCheapestWearableListings } from "@/lib/hooks/useCheapestWearableListings";
import { useWalletItemBalances } from "@/lib/hooks/useWalletItemBalances";
import { getRespecBaseTraits } from "@/lib/respec";
import { useAvailableSkillPoints } from "@/lib/hooks/useAvailableSkillPoints";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { gotchi3dHashes } from "@/lib/gotchi3d";
import { env } from "@/lib/env";

// Same signature the explorer uses (GotchiActionsPanel) — token id is uint32.
const RESPEC_COUNT_ABI = [
  { name: "respecCount", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

// I-4: standard AavegotchiFacet view (documented facet signature); the repo's
// write side already sends the matching equipWearables(uint256, uint16[16]).
const EQUIPPED_WEARABLES_ABI = [
  { name: "equippedWearables", type: "function", stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [{ name: "wearableIds_", type: "uint16[16]" }] },
] as const;

const POPOVER_WIDTH = 272;

/**
 * Pure eligibility gate for the Save button (unit-tested in
 * saveEligibility.test.ts). Save requires: connected wallet on Base that owns
 * the gotchi, not lent out, and something to commit (outfit dirty or respec).
 */
export function isSaveEligible(p: {
  isConnected: boolean; onBase: boolean; connectedOwned: boolean; locked: boolean;
  desiredSlots: number[]; currentSlots: number[]; hasRespecTarget: boolean;
}): boolean {
  if (!p.isConnected || !p.onBase || !p.connectedOwned || p.locked) return false;
  const dirty = p.desiredSlots.some((id, i) => (id || 0) !== (p.currentSlots[i] || 0));
  return dirty || p.hasRespecTarget;
}

const ghst = (wei: string | bigint) =>
  (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

const to16 = (slots8: number[]): number[] =>
  [...slots8, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16).map((n) => Number(n) || 0);

export function SaveOutfitButton(props: {
  gotchiId: string;               // numeric token id (baseGotchi.gotchiId || baseGotchi.id)
  storeId: string;                // baseGotchi.id — the key connectedOwnedIds/gotchis use
  instanceId: string;
  desiredSlots: number[];         // instance.equippedBySlot (length 8)
  currentSlots: number[];         // instance.baseGotchi.equippedWearables (may be length 16)
  respecTarget?: number[];        // committedRespecTargets[instanceId] (absolute 4-trait base)
  locked: boolean;                // lending/lentOut
  onSaved: (finalSlots: number[], respecTargetApplied?: number[]) => void;
}) {
  const { gotchiId, storeId, desiredSlots, currentSlots, respecTarget, locked, onSaved } = props;

  // ── Hooks (all unconditional — the ineligible early-return comes after) ──
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const connectedOwned = useAppStore((s) => s.connectedOwnedIds.has(storeId));
  const gotchis = useAppStore((s) => s.gotchis);
  const connectedOwnedIds = useAppStore((s) => s.connectedOwnedIds);
  const wearablesById = useWearablesById();
  const { execute, progress, reset } = useSaveOutfit();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [pulse, setPulse] = useState(false);
  const pulsedRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const desired8 = useMemo(
    () => Array.from({ length: 8 }, (_, i) => Number(desiredSlots[i]) || 0),
    [desiredSlots]
  );
  const current8 = useMemo(
    () => Array.from({ length: 8 }, (_, i) => Number(currentSlots[i]) || 0),
    [currentSlots]
  );

  const eligible = isSaveEligible({
    isConnected,
    onBase: chainId === BASE_CHAIN_ID,
    connectedOwned,
    locked,
    desiredSlots: desired8,
    currentSlots: current8,
    hasRespecTarget: !!respecTarget,
  });

  // One-time 2s attention pulse when the button first becomes eligible.
  useEffect(() => {
    if (eligible && !pulsedRef.current) {
      pulsedRef.current = true;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(t);
    }
  }, [eligible]);

  // ── Fresh data, gathered only while the popover is open ──
  // Connected wallet ONLY — watch-only wallets' items are not spendable.
  const walletQuery = useWalletItemBalances(open && address ? [address] : []);
  const walletBalances = useMemo(() => {
    const out: Record<number, number> = {};
    if (!walletQuery.data) return out;
    for (const [idStr, count] of Object.entries(walletQuery.data)) {
      const id = Number(idStr);
      if (wearablesById.get(id)?.category === 0) out[id] = count;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletQuery.data, wearablesById.size]);

  const lockedById = useAppStore((s) => s.lockedById);
  const storeOwnedGotchis = useMemo(
    () =>
      gotchis
        .filter((g) => connectedOwnedIds.has(g.id))
        .map((g) => ({
          gotchiId: g.gotchiId || g.id,
          equippedWearables: g.equippedWearables,
          // I-7: an active Lock&Set build holds its wearables by user intent —
          // never steal from it (treated like a lending lock).
          locked: !!(g.lending || g.lentOut) || !!lockedById[g.id],
        })),
    [gotchis, connectedOwnedIds, lockedById]
  );

  // I-4: the subgraph's equipped state lags the chain (indexing delay, equips
  // made outside this app). Re-read equippedWearables for the target and every
  // potential steal source at popover open so unequip/equip steps are built
  // from reality; the store's subgraph copy stays as instant fallback.
  const isNumericId = /^\d+$/.test(gotchiId);
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const freshIds = useMemo(() => {
    const ids = new Set<string>();
    if (isNumericId) ids.add(gotchiId);
    for (const g of storeOwnedGotchis) {
      if (/^\d+$/.test(g.gotchiId)) ids.add(g.gotchiId);
    }
    return [...ids].sort();
  }, [isNumericId, gotchiId, storeOwnedGotchis]);
  const freshEquippedQuery = useQuery({
    queryKey: ["fresh-equipped-wearables", freshIds.join("|")],
    enabled: open && freshIds.length > 0 && !!publicClient,
    staleTime: 15_000,
    queryFn: async () => {
      const results = await publicClient!.multicall({
        contracts: freshIds.map((id) => ({
          address: AAVEGOTCHI_DIAMOND_BASE,
          abi: EQUIPPED_WEARABLES_ABI,
          functionName: "equippedWearables" as const,
          args: [BigInt(id)] as const,
        })),
        allowFailure: true,
      });
      const out: Record<string, number[]> = {};
      freshIds.forEach((id, i) => {
        const r = results[i];
        if (r.status === "success") {
          out[id] = (r.result as readonly (number | bigint)[]).map((n) => Number(n) || 0);
        }
      });
      return out;
    },
  });

  const effectiveCurrent8 = useMemo(() => {
    const fresh = freshEquippedQuery.data?.[gotchiId];
    return fresh ? fresh.slice(0, 8) : current8;
  }, [freshEquippedQuery.data, gotchiId, current8]);

  const ownedGotchis = useMemo(
    () =>
      storeOwnedGotchis.map((g) => ({
        ...g,
        equippedWearables: freshEquippedQuery.data?.[g.gotchiId] ?? g.equippedWearables,
      })),
    [storeOwnedGotchis, freshEquippedQuery.data]
  );

  // Respec inputs — fetched only when a respec is committed.
  const [birthBase, setBirthBase] = useState<number[] | null>(null);
  const [birthError, setBirthError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !respecTarget) return;
    let cancelled = false;
    getRespecBaseTraits(gotchiId)
      .then((traits) => {
        if (!cancelled) setBirthBase(traits.slice(0, 4));
      })
      .catch((e) => {
        if (!cancelled) setBirthError(e instanceof Error ? e.message : "Failed to fetch birth traits");
      });
    return () => {
      cancelled = true;
    };
  }, [open, respecTarget, gotchiId]);

  const { data: respecCountData, error: respecCountError } = useReadContract({
    address: AAVEGOTCHI_DIAMOND_BASE,
    abi: RESPEC_COUNT_ABI,
    functionName: "respecCount",
    args: isNumericId ? [Number(gotchiId)] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: open && !!respecTarget && isNumericId, staleTime: 30_000 },
  });
  // A failed respecCount read must not spin forever — proceed with an
  // "unknown fee" note instead (the count only affects the fee warning).
  const respecCountUnknown = respecCountData == null && !!respecCountError;

  // C-1: the respec pool = refunded (usedSkillPoints, from the subgraph gotchi)
  // + unspent on-chain points. planSave blocks over-pool allocations so a
  // doomed reset→spend sequence never reaches the wallet.
  const usedSkillPoints = useMemo(() => {
    const g = gotchis.find((gg) => gg.id === storeId);
    return Number(g?.usedSkillPoints) || 0;
  }, [gotchis, storeId]);
  const availableSkillPoints = useAvailableSkillPoints(gotchiId, open && !!respecTarget);

  const respec = useMemo(
    () =>
      respecTarget && birthBase && (respecCountData != null || respecCountUnknown) && availableSkillPoints != null
        ? {
            targetBase: respecTarget,
            birthBase,
            respecCount: respecCountData != null ? Number(respecCountData) : 0,
            usedSkillPoints,
            availableSkillPoints,
          }
        : null,
    [respecTarget, birthBase, respecCountData, respecCountUnknown, usedSkillPoints, availableSkillPoints]
  );

  // Ids not coverable by wallet + steal → they need a Baazaar listing.
  const missingIds = useMemo(() => {
    if (!open || !walletQuery.data) return [];
    const pre = planSave({
      targetGotchiId: gotchiId,
      desiredSlots: desired8,
      currentSlots: effectiveCurrent8,
      walletBalances,
      ownedGotchis,
      respec: null,
      listingsByWearable: {},
    });
    return pre.blocked.flatMap((b) => (b.reason === "unobtainable" ? [b.wearableId] : []));
  }, [open, walletQuery.data, gotchiId, desired8, effectiveCurrent8, walletBalances, ownedGotchis]);

  const listingsQuery = useCheapestWearableListings(missingIds, open && !!walletQuery.data);

  const plan: SavePlan | null = useMemo(() => {
    if (!open) return null;
    return planSave({
      targetGotchiId: gotchiId,
      desiredSlots: desired8,
      currentSlots: effectiveCurrent8,
      walletBalances,
      ownedGotchis,
      respec,
      listingsByWearable: listingsQuery.data ?? {},
    });
  }, [open, gotchiId, desired8, effectiveCurrent8, walletBalances, ownedGotchis, respec, listingsQuery.data]);

  const balancesReady = !!walletQuery.data;
  const listingsReady = missingIds.length === 0 || !!listingsQuery.data;
  const respecReady = !respecTarget || respec !== null;
  // I-6: with an empty wearables catalog every wallet item is filtered out and
  // the plan invents buy steps for items the user already holds.
  const catalogReady = wearablesById.size > 0;
  // I-4: wait for the on-chain equipped reads to settle (on failure the store
  // fallback is used and planning proceeds).
  const freshReady = !freshEquippedQuery.isFetching;
  const planReady =
    balancesReady && listingsReady && respecReady && catalogReady && freshReady && !birthError;

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const openPopover = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(rect.right + 8, window.innerWidth - POPOVER_WIDTH - 8);
      const top = Math.min(Math.max(rect.top, 8), Math.max(8, window.innerHeight - 320));
      setAnchor({ top, left });
    }
    reset();
    setOpen(true);
  }, [reset]);

  // Close on outside click — but never mid-execution.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      if (progress.phase === "running") return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, progress.phase, close]);

  // Success line auto-clears after 4s.
  useEffect(() => {
    if (progress.phase !== "success") return;
    const t = setTimeout(close, 4000);
    return () => clearTimeout(t);
  }, [progress.phase, close]);

  const onConfirm = useCallback(async () => {
    if (!plan || plan.steps.length === 0) return;
    const ok = await execute(gotchiId, plan.steps);
    if (!ok) return;
    onSaved(to16(desired8), respecTarget);
    // Warm the 3D cache for the new outfit IMMEDIATELY: the new render hash
    // is derivable right here, so touch /model and the VPS builds and stores
    // the dressed model before anyone even views it.
    try {
      const g = gotchis.find((gg) => gg.id === storeId);
      const hashes = g?.collateral
        ? gotchi3dHashes({
            collateral: g.collateral,
            hauntId: Number(g.hauntId),
            numericTraits: (g.numericTraits ?? []).map(Number),
            equippedWearables: to16(desired8),
          })
        : [];
      if (hashes[0]) {
        void fetch(`${env.companionApiUrl}/api/gotchi3d/model/${hashes[0]}?v=10&gcprobe=1`, {
          cache: "no-store",
          headers: { Range: "bytes=0-0" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch { /* best-effort warm */ }
  }, [plan, execute, gotchiId, onSaved, desired8, respecTarget, gotchis, storeId]);

  // Retry re-plans fresh: progress back to idle (confirm view) + re-quote
  // listings; the executor hook already invalidated gotchis/balances on error.
  const onRetry = useCallback(() => {
    reset();
    listingsQuery.refetch();
  }, [reset, listingsQuery]);

  // ── Render (early return AFTER all hooks). Keep mounted while open so the
  // success/error line can show even after a rebase clears eligibility. ──
  if (!eligible && !open) return null;

  return (
    <>
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        data-testid={`save-outfit-${props.instanceId}`}
        className={`h-auto py-1 px-1.5 text-[9px] flex-col leading-tight w-full border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 ${pulse ? "animate-pulse" : ""}`}
        onClick={openPopover}
        title="Commit this outfit (and respec) to the chain"
      >
        <span className="flex items-center gap-0.5">
          <Save className="h-3 w-3" />
          Save
        </span>
        <span className="text-[8px] text-muted-foreground">On-Chain</span>
      </Button>
      {open && anchor &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 rounded-xl border border-purple-500/30 bg-background shadow-xl p-3"
            style={{ top: anchor.top, left: anchor.left, width: POPOVER_WIDTH }}
            data-testid={`save-popover-${props.instanceId}`}
          >
            <SavePopoverBody
              progress={progress}
              plan={plan}
              planReady={planReady}
              birthError={birthError}
              respec={respec}
              respecCountUnknown={respecCountUnknown}
              nameOf={(id) => wearablesById.get(id)?.name || `#${id}`}
              onConfirm={onConfirm}
              onCancel={close}
              onRetry={onRetry}
            />
          </div>,
          document.body
        )}
    </>
  );
}

/** Popover body: confirm step list → progress line → success/error line. */
function SavePopoverBody(props: {
  progress: SaveProgress;
  plan: SavePlan | null;
  planReady: boolean;
  birthError: string | null;
  respec: { targetBase: number[]; birthBase: number[]; respecCount: number } | null;
  respecCountUnknown: boolean;
  nameOf: (id: number) => string;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { progress, plan, planReady, birthError, respec, respecCountUnknown, nameOf } = props;

  if (progress.phase === "running") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400 shrink-0" />
        <span>
          Step {progress.stepIndex + 1}/{progress.total}: {progress.label}…
        </span>
      </div>
    );
  }

  if (progress.phase === "success") {
    return <div className="text-xs text-emerald-400 font-medium">Saved on-chain ✓</div>;
  }

  if (progress.phase === "error") {
    return (
      <div className="space-y-2 text-xs">
        <div className="text-rose-400 font-medium">Failed: {progress.label}</div>
        <div className="text-muted-foreground break-words">{progress.message}</div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={props.onCancel}>
            Close
          </Button>
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={props.onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Confirm view
  if (!planReady || !plan) {
    return (
      <div className="space-y-2 text-xs">
        {birthError ? (
          <div className="text-rose-400">Couldn't load birth traits: {birthError}</div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Checking wallet, gotchis &amp; prices…
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const blocked = plan.blocked.length > 0;
  const hasBuys = plan.steps.some((s) => s.kind === "buy");

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold text-sm">Save on-chain</div>
      {blocked ? (
        <div className="text-rose-400">
          {plan.blocked.map((b, i) =>
            b.reason === "respec-pool" ? (
              <div key={`respec-pool-${i}`}>
                Respec needs {b.needed} point{b.needed === 1 ? "" : "s"} but only {b.available}{" "}
                {b.available === 1 ? "is" : "are"} available.
              </div>
            ) : (
              <div key={b.wearableId}>
                You don't own {nameOf(b.wearableId)} and it isn't listed on the Baazaar.
              </div>
            )
          )}
        </div>
      ) : plan.steps.length === 0 ? (
        <div className="text-muted-foreground">Nothing to save. Outfit matches the chain.</div>
      ) : (
        <>
          <ol className="space-y-1 list-decimal list-inside">
            {plan.steps.map((step, i) => (
              <li key={i} className={step.kind === "unequip" ? "text-amber-400" : ""}>
                {step.kind === "buy" &&
                  `Buy ${nameOf(step.wearableId)} (${ghst(step.priceInWei)} GHST)`}
                {step.kind === "resetSkillPoints" && "Reset skill points (respec)"}
                {step.kind === "spendSkillPoints" && "Spend skill points to the new traits"}
                {step.kind === "unequip" &&
                  `Removes ${step.stolen.map(nameOf).join(", ")} from #${step.gotchiId}`}
                {step.kind === "equip" && `Equip the new outfit on #${step.gotchiId}`}
              </li>
            ))}
          </ol>
          {respec && respecCountUnknown ? (
            <div className="text-amber-400">
              Couldn't read the respec count. A respec fee may apply.
            </div>
          ) : respec && respec.respecCount > 0 ? (
            <div className="text-amber-400">
              Respec #{respec.respecCount + 1}. A fee applies.
            </div>
          ) : null}
          {plan.totalBuyCostWei > 0n && (
            <div className="text-muted-foreground">Total: {ghst(plan.totalBuyCostWei)} GHST</div>
          )}
          <div className="text-muted-foreground">
            {plan.steps.length} signature{plan.steps.length === 1 ? "" : "s"}
            {hasBuys ? " (+ GHST approval if allowance is low)" : ""}
          </div>
        </>
      )}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={blocked || plan.steps.length === 0}
          onClick={props.onConfirm}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}
