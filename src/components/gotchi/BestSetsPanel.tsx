import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import { computeBestSets, type RankedSet } from "@/lib/bestSets";
import { useAppStore } from "@/state/useAppStore";

interface BestSetsPanelProps {
  baseTraits: number[];
  enableSetFilter?: boolean;
}

export function BestSetsPanel({ baseTraits, enableSetFilter = false }: BestSetsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const storeSets = useAppStore((state) => state.sets);
  const setFilters = useAppStore((state) => state.setFilters);

  const rankedSets = useMemo(() => {
    if (!isExpanded) return [];
    return computeBestSets(baseTraits);
  }, [baseTraits, isExpanded]);

  const traitsReady = Array.isArray(baseTraits) && baseTraits.length >= 4;

  const handleSetClick = (setName: string) => {
    if (!enableSetFilter) return;
    const normalized = setName.toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
    const match = storeSets.find(
      (s) => s.name.toLowerCase().trim() === normalized
    );
    if (match) {
      setFilters({ set: match.id });
    }
  };

  if (!traitsReady) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-50">
          <Sparkles className="h-3 w-3" />
          <span>Best Sets unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="h-3 w-3" />
        <span>Best Sets</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 p-2 bg-muted/50 rounded-md max-h-[400px] overflow-y-auto">
          <p className="text-[10px] text-muted-foreground mb-2">
            {rankedSets.length} sets ranked by projected BRS gain. Sets with negative modifiers benefit gotchis with traits under 50.
          </p>

          {rankedSets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              No sets available.
            </p>
          ) : (
            <div className="space-y-1">
              {rankedSets.map((ranked, idx) => (
                <SetRow
                  key={`${ranked.set.name}-${idx}`}
                  ranked={ranked}
                  onClick={enableSetFilter ? () => handleSetClick(ranked.set.name) : undefined}
                />
              ))}
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-border flex flex-wrap gap-3 text-[10px]">
            <a
              href="https://wiki.aavegotchi.com/en/sets"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              View all sets (Wiki)
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://www.aadventure.io/wearable-sets/gotchi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              See sets on Aadventure
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function SetRow({
  ranked,
  onClick,
}: {
  ranked: RankedSet;
  onClick?: () => void;
}) {
  const mods = ranked.set.mods;
  const traitChanges: string[] = [];
  if (mods.nrg) traitChanges.push(mods.nrg > 0 ? "+NRG" : "-NRG");
  if (mods.agg) traitChanges.push(mods.agg > 0 ? "+AGG" : "-AGG");
  if (mods.spk) traitChanges.push(mods.spk > 0 ? "+SPK" : "-SPK");
  if (mods.brn) traitChanges.push(mods.brn > 0 ? "+BRN" : "-BRN");

  return (
    <div
      onClick={onClick}
      className={`w-full p-2 bg-background rounded border border-border text-left ${
        onClick ? "cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-colors" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            ranked.delta > 0
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : ranked.delta < 0
              ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {ranked.delta > 0 ? `+${ranked.delta}` : ranked.delta}
        </span>
        <span className="font-medium text-[11px]">
          {ranked.set.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {traitChanges.length > 0 ? `(${traitChanges.join(", ")})` : ""}
        </span>
      </div>
    </div>
  );
}
