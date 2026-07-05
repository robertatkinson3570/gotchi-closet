import { useState, useMemo, useRef, useEffect } from "react";
import { WearableCard } from "./WearableCard";
import { WearableFilters } from "./WearableFilters";
import { SetBanner } from "./SetBanner";
import { EquipModal } from "./EquipModal";
import { useAppStore } from "@/state/useAppStore";
import { useWearableInventory } from "@/state/selectors";
import { useBaazaar } from "@/hooks/useBaazaar";
import type { Wearable } from "@/types";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { fetchWithTimeout } from "@/lib/http";

export function WearablesPanel() {
  const wearables = useAppStore((state) => state.wearables);
  const sets = useAppStore((state) => state.sets);
  const filters = useAppStore((state) => state.filters);
  const wearableThumbs = useAppStore((state) => state.wearableThumbs);
  const setWearableThumbs = useAppStore((state) => state.setWearableThumbs);
  const editorInstances = useAppStore((state) => state.editorInstances);
  const gotchis = useAppStore((state) => state.gotchis);
  const setError = useAppStore((state) => state.setError);
  const { ownedCounts, lockedAllocations, availCountsWithLocked } = useWearableInventory();
  const { baazaarPrices, baazaarLoading, isBaazaarMode } = useBaazaar();
  const equippedIds = editorInstances
    .flatMap((instance) => instance.equippedBySlot)
    .filter((id) => id !== 0);
  const [selectedWearable, setSelectedWearable] = useState<Wearable | null>(
    null
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const failedThumbsRef = useRef<Set<number>>(new Set());
  
  const filteredWearables = useMemo(() => {
    let filtered = [...wearables];

    // Apply wearableMode filter first
    // "owned" mode shows owned wearables that aren't fully reserved by locked gotchis
    if (filters.wearableMode === "owned") {
      filtered = filtered.filter((w) => {
        const owned = ownedCounts[w.id] || 0;
        const locked = lockedAllocations[w.id] || 0;
        return owned - locked > 0;
      });
    } else if (filters.wearableMode === "baazaar") {
      filtered = filtered.filter((w) => baazaarPrices[w.id] !== undefined);
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((w) =>
        w.name.toLowerCase().includes(searchLower)
      );
    }

    // Slot filter
    if (filters.slot !== null) {
      filtered = filtered.filter(
        (w) => w.slotPositions[filters.slot!] === true
      );
    }

    // Rarity filter
    if (filters.rarity) {
      const getRarity = (mod: number) => {
        if (mod >= 50) return "Godlike";
        if (mod >= 20) return "Mythical";
        if (mod >= 10) return "Legendary";
        if (mod >= 5) return "Rare";
        if (mod >= 2) return "Uncommon";
        return "Common";
      };
      filtered = filtered.filter((w) => getRarity(w.rarityScoreModifier) === filters.rarity);
    }

    // Trait directions filter (best for gotchi)
    if (filters.traitDirections) {
      const dirs = filters.traitDirections;
      filtered = filtered.filter((w) => {
        const mods = w.traitModifiers.slice(0, 4);
        for (let i = 0; i < 4; i++) {
          const mod = mods[i] || 0;
          const dir = dirs[i];
          if (mod === 0) continue;
          if (dir > 0 && mod < 0) return false;
          if (dir < 0 && mod > 0) return false;
        }
        return mods.some((m) => m !== 0);
      });
    }

    // Set filter
    if (filters.set) {
      const set = sets.find((s) => s.id === filters.set);
      if (set) {
        if (filters.showMissingOnly) {
          const missing = set.wearableIds.filter(
            (id) => !equippedIds.includes(id)
          );
          filtered = filtered.filter((w) => missing.includes(w.id));
        } else {
          filtered = filtered.filter((w) => set.wearableIds.includes(w.id));
        }
      }
    }

    return filtered;
  }, [wearables, filters, sets, equippedIds, ownedCounts, lockedAllocations, baazaarPrices]);

  const activeSet = useMemo(() => {
    if (!filters.set) return null;
    return sets.find((s) => s.id === filters.set);
  }, [filters.set, sets]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const baseGotchi =
      editorInstances[0]?.baseGotchi || gotchis[0];
    if (!baseGotchi) return;
    if (!baseGotchi.hauntId || !baseGotchi.collateral) return;
    const tokenId = Number(
      (baseGotchi.gotchiId || baseGotchi.id).includes("-")
        ? (baseGotchi.gotchiId || baseGotchi.id).split("-").slice(-1)[0]
        : baseGotchi.gotchiId || baseGotchi.id
    );
    if (!Number.isFinite(tokenId)) return;

    const visible = filteredWearables
      .slice(0, 20)
      .map((wearable) => wearable.id);

    const missing = Array.from(new Set([...visible, ...equippedIds])).filter(
      (id) => !wearableThumbs[id] && !failedThumbsRef.current.has(id)
    );
    if (missing.length === 0) return;

    // Per-item cacheable GETs: each wearable-on-this-gotchi is a stable CDN cache
    // entry, so re-opening/filtering the panel serves repeats from the edge instead
    // of re-hitting RPC. (The render ignores hand slot, so slot data isn't sent.)
    const traitsParam = encodeURIComponent((baseGotchi.numericTraits || []).join(","));
    Promise.all(
      missing.map(async (id): Promise<[number, string]> => {
        try {
          const url =
            `/api/wearables/${id}/thumb` +
            `?haunt=${encodeURIComponent(String(baseGotchi.hauntId))}` +
            `&collateral=${encodeURIComponent(String(baseGotchi.collateral))}` +
            `&traits=${traitsParam}`;
          const res = await fetchWithTimeout(url, { method: "GET", timeoutMs: 8000 });
          if (!res || !res.ok) throw new Error(res ? `HTTP ${res.status}` : "no response");
          const json = await res.json();
          const svg = json?.svg;
          if (typeof svg === "string" && svg) return [id, svg];
          throw new Error("empty svg");
        } catch {
          failedThumbsRef.current.add(id);
          return [id, placeholderSvg(String(id), "wearable")];
        }
      })
    ).then((entries) => {
      const map: Record<number, string> = {};
      for (const [id, svg] of entries) map[id] = svg;
      setWearableThumbs(map);
      if (entries.every(([id]) => failedThumbsRef.current.has(id))) {
        setError("Failed to load wearable images");
      }
    });
  }, [
    editorInstances,
    gotchis,
    wearables,
    filteredWearables,
    wearableThumbs,
    setWearableThumbs,
  ]);

  const handleWearableClick = (wearable: Wearable) => {
    setSelectedWearable(wearable);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col overflow-hidden">
      <WearableFilters />
      <div className="flex flex-col min-h-0">
        {activeSet && <SetBanner set={activeSet} />}
        <div className="max-h-[320px] overflow-y-auto overflow-x-hidden p-1.5">
          {baazaarLoading && isBaazaarMode ? (
            <div className="text-center text-muted-foreground py-4 text-[11px]">
              Loading Baazaar listings...
            </div>
          ) : filteredWearables.length === 0 ? (
            <div className="text-center text-muted-foreground py-4 text-[11px]">
              {filters.wearableMode === "owned"
                ? "No available wearables in inventory (or all currently used in editor)"
                : filters.wearableMode === "baazaar"
                ? "No wearables currently listed on the Baazaar."
                : "No wearables found"}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1 justify-items-center">
              {filteredWearables.map((wearable) => (
                <WearableCard
                  key={wearable.id}
                  wearable={wearable}
                  onClick={isMobile ? () => handleWearableClick(wearable) : undefined}
                  availCount={filters.wearableMode === "owned" ? availCountsWithLocked[wearable.id] : undefined}
                  priceGHST={isBaazaarMode ? baazaarPrices[wearable.id]?.minPriceGHST : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <EquipModal
        wearable={selectedWearable}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}

