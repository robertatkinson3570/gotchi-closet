import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { Loader2 } from "lucide-react";
import { Button } from "@/ui/button";
import { useAppStore } from "@/state/useAppStore";
import { useWearablesById } from "@/state/selectors";
import { planSave, type SavePlan } from "@/lib/savePlan";
import { useSaveOutfit, type SaveProgress } from "@/hooks/useSaveOutfit";
import { useCheapestWearableListings } from "@/lib/hooks/useCheapestWearableListings";
import { useWalletItemBalances } from "@/lib/hooks/useWalletItemBalances";
import { getRespecBaseTraits } from "@/lib/respec";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";

// Same signature the explorer uses (GotchiActionsPanel) — token id is uint32.
const RESPEC_COUNT_ABI = [
  { name: "respecCount", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [{ name: "", type: "uint256" }] },
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

  const ownedGotchis = useMemo(
    () =>
      gotchis
        .filter((g) => connectedOwnedIds.has(g.id))
        .map((g) => ({
          gotchiId: g.gotchiId || g.id,
          equippedWearables: g.equippedWearables,
          locked: !!(g.lending || g.lentOut),
        })),
    [gotchis, connectedOwnedIds]
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

  const isNumericId = /^\d+$/.test(gotchiId);
  const { data: respecCountData } = useReadContract({
    address: AAVEGOTCHI_DIAMOND_BASE,
    abi: RESPEC_COUNT_ABI,
    functionName: "respecCount",
    args: isNumericId ? [Number(gotchiId)] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: open && !!respecTarget && isNumericId, staleTime: 30_000 },
  });

  const respec = useMemo(
    () =>
      respecTarget && birthBase && respecCountData != null
        ? { targetBase: respecTarget, birthBase, respecCount: Number(respecCountData) }
        : null,
    [respecTarget, birthBase, respecCountData]
  );

  // Ids not coverable by wallet + steal → they need a Baazaar listing.
  const missingIds = useMemo(() => {
    if (!open || !walletQuery.data) return [];
    const pre = planSave({
      targetGotchiId: gotchiId,
      desiredSlots: desired8,
      currentSlots: current8,
      walletBalances,
      ownedGotchis,
      respec: null,
      listingsByWearable: {},
    });
    return pre.blocked.map((b) => b.wearableId);
  }, [open, walletQuery.data, gotchiId, desired8, current8, walletBalances, ownedGotchis]);

  const listingsQuery = useCheapestWearableListings(missingIds, open && !!walletQuery.data);

  const plan: SavePlan | null = useMemo(() => {
    if (!open) return null;
    return planSave({
      targetGotchiId: gotchiId,
      desiredSlots: desired8,
      currentSlots: current8,
      walletBalances,
      ownedGotchis,
      respec,
      listingsByWearable: listingsQuery.data ?? {},
    });
  }, [open, gotchiId, desired8, current8, walletBalances, ownedGotchis, respec, listingsQuery.data]);

  const balancesReady = !!walletQuery.data;
  const listingsReady = missingIds.length === 0 || !!listingsQuery.data;
  const respecReady = !respecTarget || respec !== null;
  const planReady = balancesReady && listingsReady && respecReady && !birthError;

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
    if (ok) onSaved(to16(desired8), respecTarget);
  }, [plan, execute, gotchiId, onSaved, desired8, respecTarget]);

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
        size="sm"
        data-testid={`save-outfit-${props.instanceId}`}
        className={`h-7 w-full px-1 rounded-lg text-[10px] font-bold text-white shadow bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-90 ${pulse ? "animate-pulse" : ""}`}
        onClick={openPopover}
        title="Commit this outfit (and respec) to the chain"
      >
        Save on-chain
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
  nameOf: (id: number) => string;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { progress, plan, planReady, birthError, respec, nameOf } = props;

  if (progress.phase === "running") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400 shrink-0" />
        <span>
          Step {progress.stepIndex + 1}/{progress.total} — {progress.label}…
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
          {plan.blocked.map((b) => (
            <div key={b.wearableId}>
              You don't own {nameOf(b.wearableId)} and it isn't listed on the Baazaar.
            </div>
          ))}
        </div>
      ) : plan.steps.length === 0 ? (
        <div className="text-muted-foreground">Nothing to save — outfit matches the chain.</div>
      ) : (
        <>
          <ol className="space-y-1 list-decimal list-inside">
            {plan.steps.map((step, i) => (
              <li key={i} className={step.kind === "unequip" ? "text-amber-400" : ""}>
                {step.kind === "buy" &&
                  `Buy ${nameOf(step.wearableId)} — ${ghst(step.priceInWei)} GHST`}
                {step.kind === "resetSkillPoints" && "Reset skill points (respec)"}
                {step.kind === "spendSkillPoints" && "Spend skill points to the new traits"}
                {step.kind === "unequip" &&
                  `Removes ${step.stolen.map(nameOf).join(", ")} from #${step.gotchiId}`}
                {step.kind === "equip" && `Equip the new outfit on #${step.gotchiId}`}
              </li>
            ))}
          </ol>
          {respec && respec.respecCount > 0 && (
            <div className="text-amber-400">
              Respec #{respec.respecCount + 1} — a fee applies.
            </div>
          )}
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
