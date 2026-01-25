import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import { computeBestSets, type RankedSet } from "@/lib/bestSets";
import { useWearablesById } from "@/state/selectors";

interface BestSetsPanelProps {
  baseTraits: number[];
}

export function BestSetsPanel({ baseTraits }: BestSetsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const wearablesById = useWearablesById();

  const rankedSets = useMemo(() => {
    if (!isExpanded) return [];
    return computeBestSets(baseTraits);
  }, [baseTraits, isExpanded]);

  const traitsReady = Array.isArray(baseTraits) && baseTraits.length >= 4;

  const getWearableNames = (wearableIds: number[]): string[] => {
    return wearableIds.map((id) => {
      const wearable = wearablesById.get(id);
      return wearable?.name || `#${id}`;
    });
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
            <div className="space-y-2">
              {rankedSets.map((ranked, idx) => (
                <SetRow
                  key={`${ranked.set.id}-${idx}`}
                  ranked={ranked}
                  wearableNames={getWearableNames(ranked.set.requiredWearableIds)}
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
  wearableNames,
}: {
  ranked: RankedSet;
  wearableNames: string[];
}) {
  const mods = ranked.set.traitModifiers;
  const traitChanges: string[] = [];
  if (mods.nrg) traitChanges.push(mods.nrg > 0 ? "+NRG" : "-NRG");
  if (mods.agg) traitChanges.push(mods.agg > 0 ? "+AGG" : "-AGG");
  if (mods.spk) traitChanges.push(mods.spk > 0 ? "+SPK" : "-SPK");
  if (mods.brn) traitChanges.push(mods.brn > 0 ? "+BRN" : "-BRN");

  return (
    <div className="p-2 bg-background rounded border border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
            <span className="font-medium text-[11px] truncate">
              {ranked.set.name}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {traitChanges.length > 0
              ? `(${traitChanges.join(", ")})`
              : "(no trait mods)"}
          </div>
        </div>
      </div>
      <div className="mt-1 text-[9px] text-muted-foreground leading-relaxed">
        {wearableNames.join(" · ")}
      </div>
    </div>
  );
}
