import { useRef } from "react";
import { useAppStore } from "@/state/useAppStore";
import { computeInstanceTraits, useSortedGotchis, useWearablesById } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";
import { Button } from "@/ui/button";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

export function GotchiCarousel() {
  const gotchis = useSortedGotchis();
  const addEditorInstance = useAppStore((state) => state.addEditorInstance);
  const lockedById = useAppStore((state) => state.lockedById);
  const overridesById = useAppStore((state) => state.overridesById);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const lastAddAt = useRef(0);
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


  if (gotchis.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No gotchis found
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/50">
      <div className="flex items-center gap-2 p-2">
        <Button
          variant="ghost"
          size="icon"
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
            const isLocked = !!lockedById[gotchi.id];
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
            return (
              <div
                key={gotchi.id}
                className="snap-start flex-shrink-0 relative"
                data-testid="gotchi-card"
              >
                {isLocked && (
                  <div className="absolute top-1 right-1 z-10 bg-amber-500 text-white rounded-full p-0.5" title="Locked build - wearables reserved">
                    <Lock className="h-3 w-3" />
                  </div>
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
                  onSelect={() => handleAdd(gotchi)}
                />
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scrollBy(300)}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

