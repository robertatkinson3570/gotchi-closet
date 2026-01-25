import { useState, useMemo, useRef, useEffect } from "react";
import { WearableCard } from "./WearableCard";
import { WearableFilters } from "./WearableFilters";
import { SetBanner } from "./SetBanner";
import { EquipModal } from "./EquipModal";
import { useAppStore } from "@/state/useAppStore";
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
  }, [wearables, filters, sets, equippedIds]);

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

    const slotIndexById: Record<number, number> = {};
    for (const id of missing) {
      const wearable = wearables.find((w) => w.id === id);
      if (!wearable) continue;
      if (wearable.handPlacement === "left" && wearable.slotPositions[4]) {
        slotIndexById[id] = 4;
      } else if (wearable.handPlacement === "right" && wearable.slotPositions[5]) {
        slotIndexById[id] = 5;
      } else if (wearable.handPlacement === "either") {
        slotIndexById[id] = wearable.slotPositions[4] ? 4 : wearable.slotPositions[5] ? 5 : 0;
      } else {
        const slotIndex = wearable.slotPositions.findIndex((allowed) => allowed);
        slotIndexById[id] = slotIndex >= 0 ? slotIndex : 0;
      }
    }

    fetchWithTimeout("/api/wearables/thumbs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenId,
        hauntId: baseGotchi.hauntId,
        collateral: baseGotchi.collateral,
        numericTraits: baseGotchi.numericTraits,
        wearableIds: missing,
        slotIndexById,
      }),
      timeoutMs: 8000,
    })
      .then(async (res) => {
        if (!res) return null;
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new Error(errorBody?.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!json) return;
        if (json?.thumbs) {
          setWearableThumbs(json.thumbs);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load wearable images";
        setError(message);
        const placeholders: Record<number, string> = {};
        for (const id of missing) {
          failedThumbsRef.current.add(id);
          placeholders[id] = placeholderSvg(String(id), "wearable");
        }
        setWearableThumbs(placeholders);
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
    <div className="h-full flex flex-col overflow-hidden">
      <WearableFilters />
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeSet && <SetBanner set={activeSet} />}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 scrollbar-hide">
          {filteredWearables.length === 0 ? (
            <div className="text-center text-muted-foreground py-4 text-[11px]">
              No wearables found
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1 justify-items-center">
              {filteredWearables.map((wearable) => (
                <WearableCard
                  key={wearable.id}
                  wearable={wearable}
                  onClick={isMobile ? () => handleWearableClick(wearable) : undefined}
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

