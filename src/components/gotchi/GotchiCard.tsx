import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { SvgInline } from "./SvgInline";
import { GotchiSvg } from "./GotchiSvg";
import type { Gotchi } from "@/types";
import { useRespecSimulator } from "@/lib/respec";
import { Button } from "@/ui/button";
import { Minus, Plus } from "lucide-react";
import { BrsSummary } from "./BrsSummary";
import { BestSetsPanel } from "./BestSetsPanel";
import { sumTraitBrs } from "@/lib/rarity";

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
  enableSetFilter?: boolean;
  showBestSets?: boolean;
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
  enableSetFilter = false,
  showBestSets = false,
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
  const birthTraitsArr = respec.simBase ? respec.simBase.map((v, i) => v - (respec.allocated[i] ?? 0)) : [];
  const birthBrs = birthTraitsArr.length ? sumTraitBrs(birthTraitsArr) : 0;
  const simBrs = sumTraitBrs(respec.simBase);
  const brsDelta = simBrs - birthBrs;
  const committedBirthBrs = committedSim ? sumTraitBrs(committedSim.simBase.map((v, i) => v - (respec.committedAllocated?.[i] ?? 0))) : 0;
  const committedDelta = committedSim ? sumTraitBrs(committedSim.simBase) - committedBirthBrs : 0;
  const traitBaseValue = showRespec && respec.isRespecMode
    ? (traitBase ?? 0) - respec.totalSP + brsDelta
    : committedSim
      ? (traitBase ?? 0) - respec.totalSP + committedDelta
      : traitBase;
  const traitWithModsValue = showRespec && respec.isRespecMode
    ? (traitWithMods ?? 0) - respec.totalSP + brsDelta
    : committedSim
      ? (traitWithMods ?? 0) - respec.totalSP + committedDelta
      : traitWithMods;
  const totalBrsValue =
    showRespec && respec.isRespecMode
      ? (totalBrs ?? 0) - respec.totalSP + brsDelta
      : committedSim
        ? (totalBrs ?? 0) - respec.totalSP + committedDelta
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
              <h3 className="font-semibold text-sm truncate leading-tight">{gotchi.name}</h3>
              <p className="text-xs text-muted-foreground leading-tight">
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
          {showBestSets && <BestSetsPanel baseTraits={numericTraitSource} enableSetFilter={enableSetFilter} />}
          {activeSetNames && activeSetNames.length > 0 && (
            <div className="text-[9px] text-muted-foreground">
              Active sets: {activeSetNames.join(", ")}
            </div>
          )}
          {traits && traits.length >= 4 && (
            <div className="mt-1 text-[11px]">
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
              {["NRG", "AGG", "SPK", "BRN"].map((label, index) => {
                const wearableMod = wearableDelta?.[index] ?? 0;
                const setMod = setDelta?.[index] ?? 0;
                const hasBreakdown = wearableMod !== 0 || setMod !== 0;
                return (
                <div
                  key={label}
                  className="flex flex-col"
                  data-testid={`trait-row-${label}`}
                >
                  <div className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <div className="flex items-center gap-2">
                    <span data-testid={`trait-value-${label}`} className="flex items-center gap-1.5">
                      {hasBreakdown && !respec.isRespecMode && (
                        <span className="text-[9px] text-muted-foreground">
                          {wearableMod !== 0 && <span>W:{wearableMod >= 0 ? `+${wearableMod}` : wearableMod}</span>}
                          {wearableMod !== 0 && setMod !== 0 && <span>|</span>}
                          {setMod !== 0 && <span className="text-purple-400">S:{setMod >= 0 ? `+${setMod}` : setMod}</span>}
                        </span>
                      )}
                      <span>
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
                </div>
              )})}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

