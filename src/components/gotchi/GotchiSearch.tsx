import { useState, useRef, useEffect } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Search, ChevronDown, ChevronUp, X, Loader2 } from "lucide-react";
import { useGotchiSearch } from "@/lib/hooks/useGotchiSearch";
import { GotchiCard } from "./GotchiCard";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
import type { Gotchi } from "@/types";

type GotchiSearchProps = {
  onAdd: (gotchi: Gotchi) => void;
  excludeIds: Set<string>;
};

export function GotchiSearch({ onAdd, excludeIds }: GotchiSearchProps) {
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wearablesById = useWearablesById();

  const { results, isLoading, error } = useGotchiSearch(search, isExpanded || search.length >= 2);

  const filteredResults = results.filter((g) => !excludeIds.has(g.id));

  useEffect(() => {
    if (search.length >= 2) {
      setIsExpanded(true);
    }
  }, [search]);

  const handleSelect = (gotchi: Gotchi) => {
    onAdd(gotchi);
    setSearch("");
    setIsExpanded(false);
  };

  const handleClear = () => {
    setSearch("");
    setIsExpanded(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-background/80 border-b">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search entire Aavegotchi collection by name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => search.length >= 2 && setIsExpanded(true)}
          className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
        {filteredResults.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {isExpanded && search.length >= 2 && (
        <div className="border-b bg-muted/30">
          {error && (
            <div className="px-4 py-2 text-sm text-destructive">
              Error: {error}
            </div>
          )}
          {!isLoading && filteredResults.length === 0 && search.length >= 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No gotchis found matching "{search}"
            </div>
          )}
          {filteredResults.length > 0 && (
            <div className="flex gap-3 overflow-x-auto p-2 scrollbar-thin">
              {filteredResults.map((gotchi) => {
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
                    className="flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all"
                    onClick={() => handleSelect(gotchi)}
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
                      onSelect={() => handleSelect(gotchi)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
