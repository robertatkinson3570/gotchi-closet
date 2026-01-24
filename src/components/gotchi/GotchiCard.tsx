import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { SvgInline } from "./SvgInline";
import type { Gotchi } from "@/types";
import { useRespecSimulator } from "@/lib/respec";
import { Button } from "@/ui/button";
import { Minus, Plus } from "lucide-react";
import { sumTraitBrs } from "@/lib/rarity";
import { BrsSummary } from "./BrsSummary";

interface GotchiCardProps {
  gotchi: Gotchi;
  isSelected?: boolean;
  traitBase?: number;
  traitWithMods?: number;
  wearableFlat?: number;
  setFlatBrs?: number;
  ageBrs?: number;
  totalBrs?: number;
  activeSetNames?: string[];
  traits?: number[];
  onSelect?: () => void;
  svg?: string;
  showImage?: boolean;
  showRespec?: boolean;
  respecResetKey?: string;
  baseTraits?: number[];
  modifiedTraits?: number[];
  canonicalModifiedTraits?: number[];
  withSetsNumericTraits?: number[];
  wearableDeltaOverride?: number[];
  level?: number;
}

export function GotchiCard({
  gotchi,
  isSelected = false,
  traitBase,
  traitWithMods,
  wearableFlat,
  setFlatBrs,
  ageBrs,
  totalBrs,
  activeSetNames,
  traits,
  onSelect,
  svg,
  showImage = true,
  showRespec = false,
  respecResetKey = "",
  baseTraits,
  modifiedTraits,
  canonicalModifiedTraits,
  withSetsNumericTraits,
  wearableDeltaOverride,
  level,
}: GotchiCardProps) {
  const respec = useRespecSimulator({
    resetKey: respecResetKey || gotchi.id,
    level,
    baseTraits: baseTraits || gotchi.numericTraits,
    modifiedTraits: modifiedTraits,
    canonicalModifiedTraits,
    withSetsNumericTraits,
    wearableDeltaOverride,
  });
  const baseTraitSource = baseTraits || gotchi.numericTraits;
  const displayBaseTraits = showRespec && respec.isRespecMode
    ? respec.simBase
    : baseTraitSource?.slice(0, 4) || traits?.slice(0, 4) || [];
  const displayModifiedTraits = showRespec && respec.isRespecMode
    ? respec.simModified
    : traits?.slice(0, 4) || baseTraitSource?.slice(0, 4) || [];
  const traitBaseValue = showRespec && respec.isRespecMode
    ? sumTraitBrs(respec.simBase)
    : traitBase;
  const traitWithModsValue = showRespec && respec.isRespecMode
    ? sumTraitBrs(respec.simModified)
    : traitWithMods;
  const totalBrsValue =
    showRespec && respec.isRespecMode
      ? (traitWithModsValue ?? 0) +
        (wearableFlat ?? 0) +
        (setFlatBrs ?? 0) +
        (ageBrs ?? 0)
      : totalBrs;
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        data-testid={`gotchi-card-${gotchi.id}`}
        data-base-score={typeof traitBase === "number" ? traitBase : undefined}
        data-modified-score={typeof totalBrs === "number" ? totalBrs : undefined}
        className={`cursor-pointer transition-all ${
          isSelected
            ? "ring-2 ring-primary shadow-lg"
            : "hover:shadow-md"
        }`}
        onPointerUp={() => onSelect?.()}
      >
        <div className="p-2 min-w-[180px]">
          <div className="flex items-center gap-3 mb-2">
            {showImage && (
              <>
                {svg ? (
                  <SvgInline svg={svg} className="h-12 w-12" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted" />
                )}
              </>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{gotchi.name}</h3>
              <p className="text-sm text-muted-foreground">
                ID: {gotchi.gotchiId || gotchi.id}
              </p>
            </div>
          </div>
          <BrsSummary
            traitBase={traitBaseValue ?? gotchi.baseRarityScore ?? 0}
            traitWithMods={traitWithModsValue ?? 0}
            wearableFlat={wearableFlat ?? 0}
            setFlatBrs={setFlatBrs ?? 0}
            ageBrs={ageBrs ?? 0}
            totalBrs={totalBrsValue ?? 0}
          />
          {activeSetNames && activeSetNames.length > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Active sets: {activeSetNames.join(", ")}
            </div>
          )}
          {traits && traits.length >= 4 && (
            <div className="mt-2 text-[11px]">
              {showRespec && (
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-muted-foreground">Traits</div>
                  <div className="flex items-center gap-2">
                    {respec.isRespecMode && (
                      <span
                        className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] text-muted-foreground"
                        title={
                          respec.usingFallback
                            ? "Baseline: current traits (respec baseline unavailable from subgraph)"
                            : undefined
                        }
                      >
                        SP left: {respec.spLeft}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => respec.setIsRespecMode(!respec.isRespecMode)}
                      data-testid="respec-toggle"
                    >
                      Respec
                    </Button>
                  </div>
                </div>
              )}
              {["NRG", "AGG", "SPK", "BRN"].map((label, index) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2"
                  data-testid={`trait-row-${label}`}
                >
                  <span>{label}</span>
                  <div className="flex items-center gap-2">
                    <span data-testid={`trait-value-${label}`}>
                      {displayBaseTraits[index] ?? traits[index]} (
                      {displayModifiedTraits[index] ?? traits[index]})
                    </span>
                    {showRespec && respec.isRespecMode && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-60 hover:opacity-100"
                          onClick={() => respec.decrement(index)}
                          disabled={respec.allocated[index] === 0}
                          aria-label={`Decrease ${label}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-[10px] text-muted-foreground w-6 text-center">
                          {respec.allocated[index] >= 0
                            ? `+${respec.allocated[index]}`
                            : respec.allocated[index]}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-60 hover:opacity-100"
                          onClick={() => respec.increment(index)}
                          disabled={respec.spLeft === 0}
                          aria-label={`Increase ${label}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

