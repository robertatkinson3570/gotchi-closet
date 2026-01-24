import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/state/useAppStore";
import { computeInstanceTraits, useSortedGotchis, useWearablesById } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";
import { Button } from "@/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { fetchWithTimeout } from "@/lib/http";

export function GotchiCarousel() {
  const gotchis = useSortedGotchis();
  const addEditorInstance = useAppStore((state) => state.addEditorInstance);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const lastAddAt = useRef(0);
  const [gotchiSvgs, setGotchiSvgs] = useState<Record<string, string>>({});
  const failedIdsRef = useRef<Set<string>>(new Set());
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

  const visibleTokenIds = useMemo(() => {
    return gotchis.slice(0, 30).map((gotchi) => {
      const raw = gotchi.gotchiId || gotchi.id;
      if (typeof raw !== "string") return String(raw);
      return raw.includes("-") ? raw.split("-").slice(-1)[0] : raw;
    });
  }, [gotchis]);

  useEffect(() => {
    const missing = visibleTokenIds.filter(
      (id) => !gotchiSvgs[id] && !failedIdsRef.current.has(id)
    );
    if (missing.length === 0) return;

    let mounted = true;
    fetchWithTimeout("/api/gotchis/svgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenIds: missing }),
      timeoutMs: 8000,
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new Error(errorBody?.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!mounted) return;
        const svgs = json?.svgs || {};
        const merged: Record<string, string> = { ...gotchiSvgs };
        for (const id of missing) {
          const svg = svgs[id];
          if (typeof svg === "string" && svg.length > 0) {
            merged[id] = svg;
          } else {
            failedIdsRef.current.add(id);
            merged[id] = placeholderSvg(id, "gotchi");
          }
        }
        setGotchiSvgs(merged);
      })
      .catch(() => {
        if (!mounted) return;
        const merged: Record<string, string> = { ...gotchiSvgs };
        for (const id of missing) {
          failedIdsRef.current.add(id);
          merged[id] = placeholderSvg(id, "gotchi");
        }
        setGotchiSvgs(merged);
      });

    return () => {
      mounted = false;
    };
  }, [visibleTokenIds, gotchiSvgs]);

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
          className="gotchi-strip flex gap-4 overflow-x-auto flex-nowrap snap-x snap-mandatory p-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
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
          const rawId = gotchi.gotchiId || gotchi.id;
          const tokenId =
            typeof rawId === "string" && rawId.includes("-")
              ? rawId.split("-").slice(-1)[0]
              : String(rawId);
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
            modifiedNumericTraits: gotchi.modifiedNumericTraits,
            withSetsNumericTraits: gotchi.withSetsNumericTraits,
            equippedBySlot: gotchi.equippedWearables,
            wearablesById,
            blocksElapsed: gotchi.blocksElapsed,
          });
          const activeSetNames = activeSets.map((set) => set.name);
          return (
          <div
            key={gotchi.id}
            className="snap-start flex-shrink-0"
            data-testid="gotchi-card"
          >
            <GotchiCard
              gotchi={gotchi}
              traitBase={gotchi.baseRarityScore ?? traitBase}
              traitWithMods={traitWithMods}
              wearableFlat={wearableFlat}
              setFlatBrs={setFlatBrs}
              ageBrs={ageBrs}
              totalBrs={totalBrs}
              activeSetNames={activeSetNames}
              traits={finalTraits}
              onSelect={() => handleAdd(gotchi)}
              svg={gotchiSvgs[tokenId]}
            />
          </div>
        )})}
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

