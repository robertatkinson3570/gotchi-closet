import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { SvgInline } from "./SvgInline";
import { GotchiSvg } from "./GotchiSvg";
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
  wearableDelta?: number[];
  setDelta?: number[];
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
  wearableDelta,
  setDelta,
}: GotchiCardProps) {
  const numericTraitSource = baseTraits || gotchi.numericTraits;
  const baseTraitSource = baseTraits || gotchi.numericTraits;
  const tokenId = gotchi.gotchiId || gotchi.id.split("-").pop() || gotchi.id;
  const respec = useRespecSimulator({
    resetKey: respecResetKey || gotchi.id,
    tokenId,
    usedSkillPoints: gotchi.usedSkillPoints,
    baseTraits: numericTraitSource,
    respecBaseTraits: gotchi.baseNumericTraits || gotchi.numericTraits,
    wearableDelta,
    setDelta,
  });
  const safeNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const safeTraits = (arr: unknown[] | undefined | null): number[] => {
    if (!Array.isArray(arr)) return [0, 0, 0, 0];
    return arr.slice(0, 4).map(safeNum);
  };
  const currentTraits = safeTraits(numericTraitSource) || safeTraits(traits);
  const committedSim = respec.committedSim;
  const displayBaseTraits = showRespec && respec.isRespecMode
    ? safeTraits(respec.simBase)
    : committedSim
      ? safeTraits(committedSim.simBase)
      : safeTraits(baseTraitSource) || currentTraits;
  const displayModifiedTraits = showRespec && respec.isRespecMode
    ? undefined
    : committedSim
      ? safeTraits(committedSim.simModified)
      : safeTraits(traits) || safeTraits(baseTraitSource) || currentTraits;
  const spAllocated = respec.totalSP - respec.spLeft;
  const traitBaseValue = showRespec && respec.isRespecMode
    ? (traitBase ?? 0) - respec.totalSP + spAllocated
    : committedSim
      ? sumTraitBrs(committedSim.simBase)
      : traitBase;
  const traitWithModsValue = showRespec && respec.isRespecMode
    ? (traitWithMods ?? 0) - respec.totalSP + spAllocated
    : committedSim
      ? sumTraitBrs(committedSim.simModified)
      : traitWithMods;
  const totalBrsValue =
    showRespec && respec.isRespecMode
      ? (totalBrs ?? 0) - respec.totalSP + spAllocated
      : committedSim
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
                  // Selector falls back to the editor's SVG pipeline.
                  <GotchiSvg
                    gotchiId={gotchi.gotchiId || gotchi.id}
                    hauntId={gotchi.hauntId}
                    collateral={gotchi.collateral}
                    numericTraits={gotchi.numericTraits}
                    equippedWearables={gotchi.equippedWearables}
                    className="h-12 w-12"
                    mode="preview"
                  />
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
                            ? "Baseline: current traits (respec baseline unavailable)"
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
                      onClick={() => respec.toggleRespecMode()}
                      data-testid="respec-toggle"
                    >
                      {respec.isRespecMode ? "Confirm" : "Respec"}
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
                      {safeNum(displayBaseTraits[index] ?? currentTraits[index])}
                      {(() => {
                        const modValue = showRespec && respec.isRespecMode
                          ? respec.simModified[index]
                          : displayModifiedTraits?.[index];
                        if (!Number.isFinite(modValue)) return null;
                        const baseValue = displayBaseTraits[index] ?? currentTraits[index];
                        if (modValue === baseValue) return null;
                        return (
                          <>
                            {" "}
                            (
                          <span data-testid={`trait-${label}`}>
                            {safeNum(modValue)}
                          </span>
                            )
                          </>
                        );
                      })()}
                    </span>
                    {showRespec && respec.isRespecMode && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-60 hover:opacity-100"
                          onClick={() => respec.decrement(index)}
                          disabled={!respec.hasBaseline || !respec.canDecrement(index)}
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
                          disabled={!respec.hasBaseline || !respec.canIncrement(index)}
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

