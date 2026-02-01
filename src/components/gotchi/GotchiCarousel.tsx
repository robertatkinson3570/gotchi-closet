import { useRef, useMemo } from "react";
import { useAppStore } from "@/state/useAppStore";
import { computeInstanceTraits, useSortedGotchis, useWearablesById } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";
import { Button } from "@/ui/button";
import { ChevronLeft, ChevronRight, Lock, Unlock, X } from "lucide-react";
import { GotchiSearch } from "./GotchiSearch";
import { useOwnerListings } from "@/lib/hooks/useOwnerListings";
import type { Gotchi } from "@/types";

function formatPrice(priceWei: string): string {
  const ghst = parseFloat(priceWei) / 1e18;
  if (ghst >= 1000) return `${(ghst / 1000).toFixed(1)}k GHST`;
  if (ghst >= 100) return `${ghst.toFixed(0)} GHST`;
  if (ghst >= 10) return `${ghst.toFixed(1)} GHST`;
  return `${ghst.toFixed(2)} GHST`;
}

type GotchiCarouselProps = {
  manualGotchis?: Gotchi[];
  onAddManualGotchi?: (gotchi: Gotchi) => void;
  onRemoveManualGotchi?: (gotchiId: string) => void;
  searchRightElement?: React.ReactNode;
};

export function GotchiCarousel({ 
  manualGotchis = [], 
  onAddManualGotchi,
  onRemoveManualGotchi,
  searchRightElement,
}: GotchiCarouselProps) {
  const walletGotchis = useSortedGotchis();
  const loadedAddress = useAppStore((state) => state.loadedAddress);
  const addEditorInstance = useAppStore((state) => state.addEditorInstance);
  const overridesById = useAppStore((state) => state.overridesById);
  const isLockSetEnabled = useAppStore((state) => state.isLockSetEnabled);
  const toggleLockSet = useAppStore((state) => state.toggleLockSet);
  const setLockSetEnabledBulk = useAppStore((state) => state.setLockSetEnabledBulk);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { data: ownerListingPrices } = useOwnerListings(loadedAddress);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const lastAddAt = useRef(0);
  
  const walletGotchiIds = useMemo(() => new Set(walletGotchis.map((g) => g.id)), [walletGotchis]);
  const allGotchiIds = useMemo(() => {
    const ids = new Set(walletGotchiIds);
    manualGotchis.forEach((g) => ids.add(g.id));
    return ids;
  }, [walletGotchiIds, manualGotchis]);

  const gotchis = useMemo(() => {
    const combined = [...walletGotchis];
    for (const mg of manualGotchis) {
      if (!walletGotchiIds.has(mg.id)) {
        combined.push(mg);
      }
    }
    return combined.sort((a, b) => (b.baseRarityScore ?? 0) - (a.baseRarityScore ?? 0));
  }, [walletGotchis, manualGotchis, walletGotchiIds]);
  
  const handleAdd = (gotchi: any) => {
    const now = Date.now();
    if (now - lastAddAt.current < 250) {
      return;
    }
    lastAddAt.current = now;
    addEditorInstance(gotchi);
  };

  const wearablesById = useWearablesById();
  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const isManualGotchi = (id: string) => !walletGotchiIds.has(id) && manualGotchis.some((g) => g.id === id);

  const handleToggleLock = (gotchi: Gotchi, e: React.MouseEvent) => {
    e.stopPropagation();
    const override = {
      wearablesBySlot: [...gotchi.equippedWearables],
      respecAllocated: null,
      timestamp: Date.now(),
    };
    toggleLockSet(gotchi.id, override);
  };

  const handleLockAll = () => {
    const gotchiIds = gotchis.map(g => g.id);
    setLockSetEnabledBulk(gotchiIds, true);
  };

  const handleUnlockAll = () => {
    const gotchiIds = gotchis.map(g => g.id);
    setLockSetEnabledBulk(gotchiIds, false);
  };

  const allLocked = gotchis.length > 0 && gotchis.every(g => isLockSetEnabled(g.id));
  const anyLocked = gotchis.some(g => isLockSetEnabled(g.id));

  return (
    <div className="border-b bg-muted/50">
      {onAddManualGotchi && (
        <GotchiSearch onAdd={onAddManualGotchi} excludeIds={allGotchiIds} rightElement={searchRightElement} />
      )}
      {gotchis.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">
          No gotchis found
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 p-2">
          {/* Lock All / Unlock All - compact inline */}
          <div className="flex items-center gap-0.5 mr-1">
            <button
              className={`p-1 rounded transition-colors ${allLocked ? 'text-muted-foreground/40' : 'text-amber-500 hover:bg-amber-500/10'}`}
              onClick={handleLockAll}
              disabled={allLocked}
              title="Lock All"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
            <button
              className={`p-1 rounded transition-colors ${!anyLocked ? 'text-muted-foreground/40' : 'text-muted-foreground hover:bg-muted/50'}`}
              onClick={handleUnlockAll}
              disabled={!anyLocked}
              title="Unlock All"
            >
              <Unlock className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(-300)}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            ref={scrollRef}
            data-testid="gotchi-carousel"
            className="gotchi-strip flex gap-3 overflow-x-auto flex-nowrap snap-x snap-mandatory p-2 scrollbar-thin"
            style={{ msOverflowStyle: "auto" }}
            onWheel={(event) => {
              if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
                event.currentTarget.scrollLeft += event.deltaY;
                event.preventDefault();
              }
            }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              isDragging.current = true;
              startX.current = event.clientX;
              scrollStart.current = event.currentTarget.scrollLeft;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!isDragging.current) return;
              const delta = event.clientX - startX.current;
              event.currentTarget.scrollLeft = scrollStart.current - delta;
            }}
            onPointerUp={(event) => {
              isDragging.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerLeave={() => {
              isDragging.current = false;
            }}
          >
            {gotchis.map((gotchi) => {
              const isLocked = isLockSetEnabled(gotchi.id);
              const isManual = isManualGotchi(gotchi.id);
              const override = isLocked ? overridesById[gotchi.id] : null;
              const displayEquipped = override?.wearablesBySlot || gotchi.equippedWearables;
              const {
                finalTraits,
                traitBase,
                traitWithMods,
                wearableFlat,
                setFlatBrs,
                ageBrs,
                totalBrs,
                activeSets,
              } = computeInstanceTraits({
                baseTraits: gotchi.numericTraits,
                modifiedNumericTraits: isLocked ? undefined : gotchi.modifiedNumericTraits,
                withSetsNumericTraits: isLocked ? undefined : gotchi.withSetsNumericTraits,
                equippedBySlot: displayEquipped,
                wearablesById,
                blocksElapsed: gotchi.blocksElapsed,
              });
              const activeSetNames = activeSets.map((set) => set.name);
              const displayGotchi = isLocked
                ? { ...gotchi, equippedWearables: displayEquipped }
                : gotchi;
              const gotchiTokenId = gotchi.gotchiId || gotchi.id;
              const listingPriceWei = ownerListingPrices?.[gotchiTokenId] || gotchi.market?.price;
              const price = listingPriceWei ? formatPrice(listingPriceWei) : undefined;
              return (
                <div
                  key={gotchi.id}
                  className={`snap-start flex-shrink-0 relative ${isManual ? "ring-2 ring-purple-500 rounded-lg" : ""}`}
                  data-testid="gotchi-card"
                >
                  {/* Lock/Unlock toggle icon */}
                  <button
                    className={`absolute top-1 right-1 z-10 rounded-full p-0.5 transition-colors ${
                      isLocked
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted"
                    }`}
                    title={isLocked ? "Lock Set (exclude equipped wearables)" : "Unlock Set (allow equipped wearables)"}
                    onClick={(e) => handleToggleLock(gotchi, e)}
                  >
                    {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  {isManual && onRemoveManualGotchi && (
                    <button
                      className="absolute top-1 left-1 z-10 bg-destructive text-white rounded-full p-0.5 hover:bg-destructive/80"
                      title="Remove manually added gotchi"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveManualGotchi(gotchi.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <GotchiCard
                    gotchi={displayGotchi}
                    traitBase={gotchi.baseRarityScore ?? traitBase}
                    traitWithMods={traitWithMods}
                    wearableFlat={wearableFlat}
                    setFlatBrs={setFlatBrs}
                    ageBrs={ageBrs}
                    totalBrs={totalBrs}
                    activeSetNames={activeSetNames}
                    traits={finalTraits}
                    price={price}
                    onSelect={() => handleAdd(gotchi)}
                  />
                </div>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(300)}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        </>
      )}
    </div>
  );
}

