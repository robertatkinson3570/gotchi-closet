import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { MobileTabs } from "@/components/layout/MobileTabs";
import { GotchiCarousel } from "@/components/gotchi/GotchiCarousel";
import { EditorPanel } from "@/components/gotchi/EditorPanel";
import { WearablesPanel } from "@/components/wearables/WearablesPanel";
import { WearableCardView } from "@/components/wearables/WearableCard";
import { DebugPanel } from "@/components/debug/DebugPanel";
import { useAppStore } from "@/state/useAppStore";
import { fetchAllWearables, fetchAllWearableSets } from "@/graphql/fetchers";
import { cacheGet, cacheSet, cacheIsStale, CACHE_KEYS } from "@/lib/cache";
import { normalizeAddress } from "@/lib/address";
import { useToast } from "@/ui/use-toast";
import { useWearablesById, useWearableInventory } from "@/state/selectors";
import { canEquipInSlot } from "@/lib/equipRules";
import type { Wearable, Gotchi } from "@/types";
import { useAddressState } from "@/lib/addressState";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useWalletItemBalances } from "@/lib/hooks/useWalletItemBalances";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { loadMultiWallets, removeWallet } from "@/lib/multiWallet";
import { CatwalkModal } from "@/components/catwalk/CatwalkModal";
import { useSortedGotchis } from "@/state/selectors";
import { Button } from "@/ui/button";
import { Footprints } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";

export default function DressPage() {
  const [searchParams] = useSearchParams();
  const debug = searchParams.get("debug") === "1";
  const { toast } = useToast();
  const [activeWearable, setActiveWearable] = useState<Wearable | null>(null);
  const { connectedAddress, isConnected, isOnBase } = useAddressState();
  const [multiWallets, setMultiWallets] = useState<string[]>(() => loadMultiWallets());
  const [showCatwalk, setShowCatwalk] = useState(false);
  const storeGotchis = useSortedGotchis();
  const manualGotchis = useAppStore((state) => state.manualGotchis);
  const addManualGotchi = useAppStore((state) => state.addManualGotchi);
  const removeManualGotchi = useAppStore((state) => state.removeManualGotchi);

  const allSelectorGotchis = useMemo(() => {
    const storeIds = new Set(storeGotchis.map((g) => g.id));
    const combined = [...storeGotchis];
    for (const mg of manualGotchis) {
      if (!storeIds.has(mg.id)) {
        combined.push(mg);
      }
    }
    return combined.sort((a, b) => (b.baseRarityScore ?? 0) - (a.baseRarityScore ?? 0));
  }, [storeGotchis, manualGotchis]);

  const {
    setLoadedAddress,
    setGotchis,
    setWearables,
    setSets,
    setLoadingGotchis,
    setLoadingWearables,
    setLoadingSets,
    setError,
    equipWearable,
    setWalletItemCounts,
    setConnectedOwnedIds,
  } = useAppStore();
  const appError = useAppStore((state) => state.error);
  const wearables = useAppStore((state) => state.wearables);

  const wearablesById = useWearablesById();
  const { ownedCounts } = useWearableInventory();

  useEffect(() => {
    setMultiWallets(loadMultiWallets());
  }, []);

  const handleRemoveWallet = (addr: string) => {
    const updated = removeWallet(addr);
    setMultiWallets(updated);
  };

  const handleAddManualGotchi = useCallback((gotchi: Gotchi) => {
    addManualGotchi(gotchi);
    toast({
      title: "Gotchi Added",
      description: `${gotchi.name} added to selector`,
    });
  }, [toast, addManualGotchi]);

  const handleRemoveManualGotchi = useCallback((gotchiId: string) => {
    removeManualGotchi(gotchiId);
  }, [removeManualGotchi]);

  const connectedOwner =
    isConnected && isOnBase && connectedAddress
      ? normalizeAddress(connectedAddress)
      : null;

  const connectedResult = useGotchisByOwner(connectedOwner || undefined);
  const wallet1Result = useGotchisByOwner(multiWallets[0] || undefined);
  const wallet2Result = useGotchisByOwner(multiWallets[1] || undefined);
  const wallet3Result = useGotchisByOwner(multiWallets[2] || undefined);

  const combinedGotchis = useMemo(() => {
    const map = new Map<string, Gotchi>();
    const allResults = [connectedResult, wallet1Result, wallet2Result, wallet3Result];
    for (const result of allResults) {
      for (const gotchi of result.gotchis) {
        map.set(gotchi.id, gotchi);
      }
    }
    return Array.from(map.values());
  }, [connectedResult.gotchis, wallet1Result.gotchis, wallet2Result.gotchis, wallet3Result.gotchis]);

  const isLoadingGotchis =
    (connectedOwner ? connectedResult.isLoading : false) ||
    (multiWallets[0] ? wallet1Result.isLoading : false) ||
    (multiWallets[1] ? wallet2Result.isLoading : false) ||
    (multiWallets[2] ? wallet3Result.isLoading : false);

  const gotchiError = connectedResult.error || wallet1Result.error || wallet2Result.error || wallet3Result.error;

  const ownersKey = [connectedOwner, ...multiWallets].filter(Boolean).join("|");

  useEffect(() => {
    setLoadedAddress(ownersKey || null);
    setGotchis([]);
  }, [ownersKey, setGotchis, setLoadedAddress]);

  // Track which gotchis the CONNECTED wallet owns (empty when disconnected) —
  // watch-only wallets' gotchis can't be signed for, so Save is gated on this.
  useEffect(() => {
    setConnectedOwnedIds(new Set(connectedOwner ? connectedResult.gotchis.map((gg) => gg.id) : []));
  }, [connectedOwner, connectedResult.gotchis, setConnectedOwnedIds]);

  // Wallet-held (unequipped) wearables join the owned inventory (audit H4).
  const walletList = useMemo(
    () => [connectedOwner, ...multiWallets].filter((w): w is string => !!w),
    [connectedOwner, multiWallets]
  );
  const { data: walletItems } = useWalletItemBalances(walletList);
  // Raw itemBalances includes consumables/badges — keep only real wearables
  // (category 0) before the map enters the store.
  const filteredWalletItems = useMemo(() => {
    const out: Record<number, number> = {};
    if (!walletItems) return out;
    const wearableIds = new Set<number>();
    for (const w of wearables) {
      if (w.category === 0) wearableIds.add(w.id);
    }
    for (const [idStr, count] of Object.entries(walletItems)) {
      const id = Number(idStr);
      if (wearableIds.has(id)) out[id] = count;
    }
    return out;
  }, [walletItems, wearables]);

  useEffect(() => {
    setWalletItemCounts(filteredWalletItems);
  }, [filteredWalletItems, setWalletItemCounts]);

  const lastToastedError = useRef<string | null>(null);
  useEffect(() => {
    setLoadingGotchis(isLoadingGotchis);
    if (gotchiError) {
      setError(gotchiError);
      if (lastToastedError.current !== gotchiError) {
        lastToastedError.current = gotchiError;
        toast({
          title: "Error Loading Gotchis",
          description: gotchiError,
          variant: "destructive",
        });
      }
    } else if (!isLoadingGotchis) {
      // all queries settled without error — clear stale banner (audit M7)
      lastToastedError.current = null;
      setError(null);
    }
    // I-2: on partial wallet failure (one query errored) combinedGotchis only
    // holds the surviving wallets — committing it would wipe locks and let the
    // prune effect drop editor instances for gotchis that still exist. Keep
    // the store's previous list until every query settles cleanly.
    if (!isLoadingGotchis && !gotchiError) {
      setGotchis(combinedGotchis);
    }
  }, [
    combinedGotchis,
    connectedOwner,
    gotchiError,
    isLoadingGotchis,
    multiWallets,
    setGotchis,
    setLoadingGotchis,
    setError,
    toast,
  ]);

  // Prune editor instances whose base gotchi has disappeared (wallet removed,
  // gotchi transferred/rented away) — but only after a settled, non-empty,
  // error-free load; otherwise a transient empty/loading/partial-failure
  // state would wipe instances that still exist (mirrors the C1 guard).
  // (audit M9, I-2)
  useEffect(() => {
    if (isLoadingGotchis || combinedGotchis.length === 0 || gotchiError) return;
    const valid = new Set([...combinedGotchis.map((gg) => gg.id), ...manualGotchis.map((gg) => gg.id)]);
    const { editorInstances, removeEditorInstance } = useAppStore.getState();
    for (const inst of editorInstances) {
      if (!valid.has(inst.baseGotchi.id)) removeEditorInstance(inst.instanceId);
    }
  }, [combinedGotchis, isLoadingGotchis, manualGotchis, gotchiError]);

  useEffect(() => {
    if (!connectedOwner && multiWallets.length === 0) {
      setError(null);
    }

    type WearablesState = ReturnType<typeof useAppStore.getState>["wearables"];
    const cachedWearables = cacheGet<WearablesState>(CACHE_KEYS.WEARABLES);
    if (cachedWearables) {
      setWearables(cachedWearables);
    }

    if (!cachedWearables || cacheIsStale(CACHE_KEYS.WEARABLES)) {
      setLoadingWearables(true);
      fetchAllWearables()
        .then((wearables) => {
          setWearables(wearables);
          cacheSet(CACHE_KEYS.WEARABLES, wearables);
        })
        .catch((err) => {
          setError(err.message);
          toast({
            title: "Error Loading Wearables",
            description: err.message,
            variant: "destructive",
          });
        })
        .finally(() => setLoadingWearables(false));
    }

    type SetsState = ReturnType<typeof useAppStore.getState>["sets"];
    const cachedSets = cacheGet<SetsState>(CACHE_KEYS.SETS);
    if (cachedSets) {
      setSets(cachedSets);
    }

    if (!cachedSets || cacheIsStale(CACHE_KEYS.SETS)) {
      setLoadingSets(true);
      fetchAllWearableSets()
        .then((sets) => {
          setSets(sets);
          cacheSet(CACHE_KEYS.SETS, sets);
        })
        .catch((err) => {
          setError(err.message);
          toast({
            title: "Error Loading Sets",
            description: err.message,
            variant: "destructive",
          });
        })
        .finally(() => setLoadingSets(false));
    }

    const allWallets = [connectedOwner, ...multiWallets].filter((w): w is string => !!w);
    const recent = cacheGet<string[]>(CACHE_KEYS.ADDRESSES) || [];
    let updated = recent;
    for (const owner of allWallets) {
      if (!updated.includes(owner)) {
        updated = [owner, ...updated].slice(0, 5);
      }
    }
    if (updated !== recent) {
      cacheSet(CACHE_KEYS.ADDRESSES, updated);
    }
  }, [connectedOwner, multiWallets, setWearables, setSets, setLoadingWearables, setLoadingSets, setError, toast]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveWearable(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("wearable:") && overId.startsWith("slot:")) {
      const wearableId = Number(activeId.split(":")[1]);
      const [, instanceId, slotIndexRaw] = overId.split(":");
      const slotIndex = Number(slotIndexRaw);

      const wearable = wearablesById.get(wearableId);
      if (!wearable) {
        setActiveWearable(null);
        return;
      }

      if (!canEquipInSlot(wearable, slotIndex)) {
        toast({
          title: "Invalid Slot",
          description: `${wearable.name} cannot be equipped in that slot`,
          variant: "destructive",
        });
        setActiveWearable(null);
        return;
      }

      const equipped = equipWearable(instanceId, wearableId, slotIndex);
      if (!equipped) {
        toast({
          title: "Not enough copies",
          description: `You only own ${ownedCounts[wearableId] || 0} of ${wearable.name}`,
          variant: "destructive",
        });
        setActiveWearable(null);
        return;
      }
      // No success toast — the slot visibly updating is the feedback (audit low).
    }

    setActiveWearable(null);
  };

  const handleDragStart = (event: any) => {
    const activeId = String(event.active.id);
    if (activeId.startsWith("wearable:")) {
      const wearableId = Number(activeId.split(":")[1]);
      const wearable = wearablesById.get(wearableId);
      setActiveWearable(wearable || null);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  return (
    <DndContext
      collisionDetection={pointerWithin}
      sensors={sensors}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
    >
      <Seo
        title="Aavegotchi Dressing Room – Try On Wearables & Sets | GotchiCloset"
        description="Preview any wearable or full set on your Aavegotchi before you buy. See trait and BRS changes live as you dress, straight from your wallet inventory."
        canonical={siteUrl("/dress")}
      />
      <div className="min-h-screen flex flex-col overflow-x-hidden">
        <WalletHeader
          multiWallets={multiWallets}
          connectedOwner={connectedOwner}
          onRemoveWallet={handleRemoveWallet}
        />
        {appError && (
          <div className="w-full border-b bg-background px-4 py-2 text-sm text-red-500">
            {appError}
          </div>
        )}
        <div data-testid="gotchi-list">
          <span className="sr-only" data-testid="gotchi-list-owner">
            {ownersKey}
          </span>
          <GotchiCarousel
            manualGotchis={manualGotchis}
            onAddManualGotchi={handleAddManualGotchi}
            onRemoveManualGotchi={handleRemoveManualGotchi}
            searchRightElement={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCatwalk(true)}
                disabled={allSelectorGotchis.length === 0}
                className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight shrink-0"
              >
                <span className="flex items-center gap-0.5">
                  <Footprints className="h-3 w-3" />
                  Catwalk
                </span>
              </Button>
            }
          />
        </div>
        <div className="hidden lg:block flex-1 max-w-screen-2xl mx-auto w-full px-4 py-3 overflow-hidden">
          <div className="grid grid-cols-[1fr_340px] gap-4 h-full">
            <div className="min-w-0 flex flex-col gap-2 overflow-hidden">
              <div className="w-full min-w-0 overflow-auto">
                <EditorPanel />
              </div>
              {debug && <DebugPanel />}
            </div>
            <div className="flex flex-col w-[340px] shrink-0 max-h-[calc(100vh-200px)] border rounded-md bg-background overflow-hidden">
              <WearablesPanel />
              {debug && <DebugPanel />}
            </div>
          </div>
        </div>
        <div className="lg:hidden flex-1 flex flex-col overflow-hidden">
          <MobileTabs
            edit={
              <div className="min-h-[300px]">
                <EditorPanel />
                {debug && <DebugPanel />}
              </div>
            }
            wearables={
              <div className="min-h-[300px]">
                <WearablesPanel />
                {debug && <DebugPanel />}
              </div>
            }
          />
        </div>
      </div>
      <DragOverlay>
        {activeWearable && (
          <div className="pointer-events-none">
            <WearableCardView wearable={activeWearable} />
          </div>
        )}
      </DragOverlay>
      {showCatwalk && (
        <CatwalkModal
          gotchis={allSelectorGotchis}
          onClose={() => setShowCatwalk(false)}
        />
      )}
    </DndContext>
  );
}
