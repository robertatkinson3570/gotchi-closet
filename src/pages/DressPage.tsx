import { useEffect, useMemo, useState } from "react";
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
import { normalizeAddress, isValidAddress } from "@/lib/address";
import { useToast } from "@/ui/use-toast";
import { useWearablesById } from "@/state/selectors";
import type { Wearable } from "@/types";
import { useAddressState } from "@/lib/addressState";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { WalletHeader } from "@/components/wallet/WalletHeader";

const STORAGE_MANUAL_VIEW = "gc_manualViewAddress";

export default function DressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const debug = searchParams.get("debug") === "1";
  const { toast } = useToast();
  const [activeWearable, setActiveWearable] = useState<Wearable | null>(null);
  const { connectedAddress, isConnected, isOnBase } = useAddressState();
  const [manualViewAddress, setManualViewAddress] = useState<string | null>(null);

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
  } = useAppStore();
  const appError = useAppStore((state) => state.error);

  const wearablesById = useWearablesById();

  useEffect(() => {
    if (viewParam && isValidAddress(viewParam)) {
      const normalized = normalizeAddress(viewParam);
      if (normalized !== manualViewAddress) {
        setManualViewAddress(normalized);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_MANUAL_VIEW, normalized);
      }
      return;
    }

    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_MANUAL_VIEW);
    if (stored && isValidAddress(stored)) {
      const normalized = normalizeAddress(stored);
      if (normalized !== manualViewAddress) {
        setManualViewAddress(normalized);
      }
    }
  }, [viewParam, manualViewAddress]);

  useEffect(() => {
    if (manualViewAddress) {
      if (viewParam !== manualViewAddress) {
        const next: Record<string, string> = { view: manualViewAddress };
        if (debug) next.debug = "1";
        setSearchParams(next, { replace: true });
      }
      return;
    }

    if (viewParam) {
      const next: Record<string, string> = {};
      if (debug) next.debug = "1";
      setSearchParams(next, { replace: true });
    }
  }, [manualViewAddress, debug, viewParam, setSearchParams]);

  const connectedOwner =
    isConnected && isOnBase && connectedAddress
      ? normalizeAddress(connectedAddress)
      : null;
  const manualOwner = manualViewAddress;

  const connectedResult = useGotchisByOwner(connectedOwner || undefined);
  const manualResult = useGotchisByOwner(manualOwner || undefined);

  const combinedGotchis = useMemo(() => {
    const map = new Map<string, (typeof manualResult.gotchis)[number]>();
    for (const gotchi of manualResult.gotchis) {
      map.set(gotchi.id, gotchi);
    }
    for (const gotchi of connectedResult.gotchis) {
      map.set(gotchi.id, gotchi);
    }
    return Array.from(map.values());
  }, [manualResult.gotchis, connectedResult.gotchis]);

  const isLoadingGotchis =
    (manualOwner ? manualResult.isLoading : false) ||
    (connectedOwner ? connectedResult.isLoading : false);
  const gotchiError = manualResult.error || connectedResult.error;
  const viewLabel =
    manualOwner && connectedOwner
      ? "both"
      : manualOwner || connectedOwner || "";

  const clearManualView = () => {
    setManualViewAddress(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_MANUAL_VIEW);
    }
    const next: Record<string, string> = {};
    if (debug) next.debug = "1";
    setSearchParams(next, { replace: true });
  };

  const useConnectedOnly = () => {
    if (!connectedOwner) return;
    clearManualView();
  };

  const ownersKey = [manualOwner, connectedOwner].filter(Boolean).join("|");

  useEffect(() => {
    setLoadedAddress(ownersKey || null);
    setGotchis([]);
  }, [ownersKey, setGotchis, setLoadedAddress]);

  useEffect(() => {
    setLoadingGotchis(isLoadingGotchis);
    if (gotchiError) {
      setError(gotchiError);
      toast({
        title: "Error Loading Gotchis",
        description: gotchiError,
        variant: "destructive",
      });
    }
    if (!isLoadingGotchis) {
      setGotchis(combinedGotchis);
      if (combinedGotchis.length === 0 && (manualOwner || connectedOwner)) {
        toast({
          title: "No Gotchis Found",
          description: "This address doesn't own any gotchis",
        });
      }
    }
  }, [
    combinedGotchis,
    connectedOwner,
    gotchiError,
    isLoadingGotchis,
    manualOwner,
    setGotchis,
    setLoadingGotchis,
    setError,
    toast,
  ]);

  useEffect(() => {
    if (!manualOwner && !connectedOwner) {
      setError(null);
    }

    // Load wearables (cache first, then fetch)
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

    // Load sets (cache first, then fetch)
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

    // Save to recent addresses
    const recent = cacheGet<string[]>(CACHE_KEYS.ADDRESSES) || [];
    const ownersToSave = [manualOwner, connectedOwner].filter(
      (owner): owner is string => !!owner
    );
    let updated = recent;
    for (const owner of ownersToSave) {
      if (!updated.includes(owner)) {
        updated = [owner, ...updated].slice(0, 5);
      }
    }
    if (updated !== recent) {
      cacheSet(CACHE_KEYS.ADDRESSES, updated);
    }
  }, [manualOwner, connectedOwner, setWearables, setSets, setLoadingWearables, setLoadingSets, setError, toast]);

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

      const handPlacement = wearable.handPlacement || "none";
      const isLeftHand = slotIndex === 4;
      const isRightHand = slotIndex === 5;
      const isHandSlot = isLeftHand || isRightHand;
      const matchesHand = !isHandSlot
        ? true
        : handPlacement === "either" ||
          (handPlacement === "left" && isLeftHand) ||
          (handPlacement === "right" && isRightHand) ||
          (handPlacement === "none" && wearable.slotPositions[slotIndex]);
      // Validate slot
      if (!wearable.slotPositions[slotIndex] || !matchesHand) {
        toast({
          title: "Invalid Slot",
          description: `${wearable.name} cannot be equipped in that slot`,
          variant: "destructive",
        });
        setActiveWearable(null);
        return;
      }

      equipWearable(instanceId, wearableId, slotIndex);
      toast({
        title: "Equipped",
        description: `${wearable.name} equipped`,
      });
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
      <div className="min-h-screen flex flex-col overflow-x-hidden">
        <WalletHeader
          manualAddress={manualOwner}
          connectedOwner={connectedOwner}
          onClearManual={manualOwner ? clearManualView : undefined}
          onUseConnected={useConnectedOnly}
        />
        {appError && (
          <div className="w-full border-b bg-background px-4 py-2 text-sm text-red-500">
            {appError}
          </div>
        )}
        <div data-testid="gotchi-list">
          <span className="sr-only" data-testid="gotchi-list-owner">
            {viewLabel}
          </span>
          <GotchiCarousel />
        </div>
        {/* Desktop layout */}
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
        {/* Mobile layout with tabs */}
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
    </DndContext>
  );
}

