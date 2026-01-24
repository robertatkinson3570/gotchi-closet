import { Card } from "@/ui/card";
import { Button } from "@/ui/button";
import { TRAIT_KEYS } from "@/lib/constants";
import { formatTraitValue } from "@/lib/format";
import { useAppStore } from "@/state/useAppStore";
import { detectActiveSets } from "@/lib/rarity";
import type { WearableSet } from "@/types";

interface SetBannerProps {
  set: WearableSet;
}

export function SetBanner({ set }: SetBannerProps) {
  const editorInstances = useAppStore((state) => state.editorInstances);
  const equippedIds =
    editorInstances[0]?.equippedBySlot.filter((id) => id !== 0) || [];
  const wearables = useAppStore((state) => state.wearables);
  const filters = useAppStore((state) => state.filters);
  const setFilters = useAppStore((state) => state.setFilters);

  const activeSets = detectActiveSets(equippedIds);
  const complete = activeSets.some((active) => active.name === set.name);
  const missing = set.wearableIds.filter((id) => !equippedIds.includes(id));
  const missingCount = missing.length;

  const wearablesById = new Map(wearables.map((w) => [w.id, w]));
  const missingWearables = missing
    .map((id) => wearablesById.get(id))
    .filter(Boolean);

  if (filters.set !== set.id && filters.showMissingOnly && complete) {
    return null;
  }

  return (
    <Card className="p-3 mb-3 bg-primary/5 border-primary/20">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-semibold">{set.name}</h4>
          {complete ? (
            <p className="text-sm text-green-600">Complete!</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Missing {missingCount} item{missingCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setFilters({
              showMissingOnly: !filters.showMissingOnly,
              set: filters.set === set.id ? null : set.id,
            })
          }
        >
          {filters.set === set.id ? "Hide" : "Filter"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {set.traitBonuses.map((bonus, i) => {
          if (bonus === 0) return null;
          return (
            <span
              key={i}
              className={`text-xs px-1.5 py-0.5 rounded ${
                bonus > 0
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              {TRAIT_KEYS[i]}: {formatTraitValue(bonus)}
            </span>
          );
        })}
      </div>
      {missingCount > 0 && filters.set === set.id && (
        <div className="text-xs text-muted-foreground">
          Missing: {missingWearables.map((w) => w?.name).join(", ")}
        </div>
      )}
    </Card>
  );
}

