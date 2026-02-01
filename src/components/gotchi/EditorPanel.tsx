import { SlotGrid } from "./SlotGrid";
import { useAppStore } from "@/state/useAppStore";
import { GotchiSvg } from "./GotchiSvg";
import { X, Wand2, Sparkles, Shirt, RotateCcw, Lock, Unlock, Baby } from "lucide-react";
import { Button } from "@/ui/button";
import { computeInstanceTraits, useWearablesById, useWearableInventory } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import type { LockedOverride } from "@/lib/lockedBuilds";
import { MommyDressModal } from "./MommyDressModal";
import type { AutoDressResult, AutoDressOptions } from "@/lib/autoDressEngine";
import type { Wearable } from "@/types";

function normalizeEquipped(equipped: number[]): number[] {
  const normalized = new Array(16).fill(0);
  for (let i = 0; i < Math.min(equipped.length, 16); i++) {
    normalized[i] = equipped[i] || 0;
  }
  return normalized;
}

export function EditorPanel() {
  const editorInstances = useAppStore((state) => state.editorInstances);
  const wearablesById = useWearablesById();
  const removeEditorInstance = useAppStore((state) => state.removeEditorInstance);
  const filters = useAppStore((state) => state.filters);
  const sets = useAppStore((state) => state.sets);
  const equipWearable = useAppStore((state) => state.equipWearable);
  const setFilters = useAppStore((state) => state.setFilters);
  const stripAllWearables = useAppStore((state) => state.stripAllWearables);
  const restoreOriginalWearables = useAppStore((state) => state.restoreOriginalWearables);
  const lockedById = useAppStore((state) => state.lockedById);
  const isLockSetEnabled = useAppStore((state) => state.isLockSetEnabled);
  const toggleLockSet = useAppStore((state) => state.toggleLockSet);
  const updateEditorInstance = useAppStore((state) => state.updateEditorInstance);
  const { availCountsWithLocked } = useWearableInventory();
  const [mommyModalInstanceId, setMommyModalInstanceId] = useState<string | null>(null);
  const [mommyResult, setMommyResult] = useState<Record<string, AutoDressResult>>({});
  const [mommyOptions, setMommyOptions] = useState<Record<string, AutoDressOptions>>({});
  const [mommyPreEquipped, setMommyPreEquipped] = useState<Record<string, number[]>>({});
  const [mommyStatusMessage, setMommyStatusMessage] = useState<{ instanceId: string; message: string } | null>(null);
  const mommyStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeSet = useMemo(() => {
    if (!filters.set) return null;
    return sets.find((s) => s.id === filters.set) || null;
  }, [filters.set, sets]);

  const applySetToInstance = useCallback(
    (instanceId: string) => {
      if (!activeSet) return;
      for (const wearableId of activeSet.wearableIds) {
        const wearable = wearablesById.get(wearableId);
        if (!wearable) continue;
        let slotIndex = wearable.slotPositions.findIndex((allowed) => allowed);
        if (slotIndex === -1) continue;
        if (wearable.handPlacement === "left" && wearable.slotPositions[4]) {
          slotIndex = 4;
        } else if (wearable.handPlacement === "right" && wearable.slotPositions[5]) {
          slotIndex = 5;
        }
        equipWearable(instanceId, wearableId, slotIndex);
      }
    },
    [activeSet, wearablesById, equipWearable]
  );

  const getTraitDirections = useCallback((traits: number[]) => {
    return traits.slice(0, 4).map((t) => (t >= 50 ? 1 : -1));
  }, []);

  const clearFilters = useAppStore((state) => state.clearFilters);

  useEffect(() => {
    if (mommyStatusMessage) {
      if (mommyStatusTimeoutRef.current) {
        clearTimeout(mommyStatusTimeoutRef.current);
      }
      mommyStatusTimeoutRef.current = setTimeout(() => {
        setMommyStatusMessage(null);
      }, 4000);
    }
    return () => {
      if (mommyStatusTimeoutRef.current) {
        clearTimeout(mommyStatusTimeoutRef.current);
      }
    };
  }, [mommyStatusMessage]);

  const filterBestForGotchi = useCallback(
    (traits: number[]) => {
      clearFilters();
      const directions = getTraitDirections(traits);
      setFilters({ traitDirections: directions });
    },
    [getTraitDirections, setFilters, clearFilters]
  );

  const clearMommyState = useCallback((instanceId: string) => {
    setMommyResult(prev => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    setMommyOptions(prev => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    setMommyPreEquipped(prev => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }, []);

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      {editorInstances.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          Click a gotchi to add it to the editor.
        </div>
      ) : (
        <div className="space-y-2 p-1">
          {editorInstances.map((instance) => {
            const isBaseEquipment =
              instance.equippedBySlot.length === instance.baseGotchi.equippedWearables.length &&
              instance.equippedBySlot.every((id, idx) => id === instance.baseGotchi.equippedWearables[idx]);
            
            const {
              finalTraits,
              traitBase,
              traitWithMods,
              wearableFlat,
              setFlatBrs,
              ageBrs,
              totalBrs,
              activeSets,
              wearableDelta,
              setTraitModsDelta,
            } = computeInstanceTraits({
              baseTraits: instance.baseGotchi.numericTraits,
              modifiedNumericTraits: isBaseEquipment ? instance.baseGotchi.modifiedNumericTraits : undefined,
              withSetsNumericTraits: isBaseEquipment ? instance.baseGotchi.withSetsNumericTraits : undefined,
              equippedBySlot: instance.equippedBySlot,
              wearablesById,
              blocksElapsed: instance.baseGotchi.blocksElapsed,
            });
            
            const activeSetNames = activeSets.map((set) => set.name);
            const mommyResultForInstance = mommyResult[instance.instanceId];
            const mommyOptionsForInstance = mommyOptions[instance.instanceId];
            const preMommyEquipped = mommyPreEquipped[instance.instanceId];
            const preMommyEquippedState = preMommyEquipped || instance.baseGotchi.equippedWearables;
            
            const currentTraitsEval = computeInstanceTraits({
              baseTraits: instance.baseGotchi.numericTraits,
              modifiedNumericTraits: isBaseEquipment ? instance.baseGotchi.modifiedNumericTraits : undefined,
              withSetsNumericTraits: isBaseEquipment ? instance.baseGotchi.withSetsNumericTraits : undefined,
              equippedBySlot: preMommyEquippedState,
              wearablesById,
              blocksElapsed: instance.baseGotchi.blocksElapsed,
            });
            const currentActiveSets = currentTraitsEval.activeSets;
            
            const mommyEquipped = mommyResultForInstance?.equippedWearables;
            const currentMatchesMommy = mommyEquipped 
              ? mommyEquipped.length === instance.equippedBySlot.length &&
                mommyEquipped.every((id, idx) => (id || 0) === (instance.equippedBySlot[idx] || 0))
              : false;

            return (
              <div
                key={instance.instanceId}
                data-testid={`editor-instance-${instance.instanceId}`}
                className="relative rounded-xl overflow-hidden"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/20 via-fuchsia-500/10 to-violet-600/20 p-[1px]">
                  <div className="h-full w-full rounded-xl bg-background" />
                </div>
                
                <div className="relative rounded-xl bg-gradient-to-br from-background via-background to-purple-950/5 group/card">
                  <div 
                    className="absolute top-0 right-0 bottom-0 w-6 flex items-center justify-center cursor-pointer opacity-0 group-hover/card:opacity-100 transition-opacity bg-gradient-to-l from-rose-500/20 to-transparent hover:from-rose-500/40 rounded-r-xl"
                    onClick={() => removeEditorInstance(instance.instanceId)}
                    title="Remove from editor"
                  >
                    <X className="h-3.5 w-3.5 text-rose-400" />
                  </div>
                  <div className="p-3 pr-8">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className="relative group">
                          <div className="absolute -inset-1 bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                          <GotchiSvg
                            gotchiId={instance.baseGotchi.gotchiId || instance.baseGotchi.id}
                            hauntId={instance.baseGotchi.hauntId}
                            collateral={instance.baseGotchi.collateral}
                            numericTraits={instance.baseGotchi.numericTraits}
                            equippedWearables={instance.equippedBySlot}
                            className="h-16 w-16 relative"
                            mode="preview"
                            testId={`editor-gotchi-svg-${instance.instanceId}`}
                          />
                        </div>
                        
                        <div className="flex flex-wrap gap-1 justify-center max-w-[68px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-purple-500/20 hover:text-purple-400 border border-transparent hover:border-purple-500/30"
                            onClick={() => filterBestForGotchi(instance.baseGotchi.numericTraits)}
                            title="Filter best wearables"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-purple-500/20 hover:text-purple-400 border border-transparent hover:border-purple-500/30"
                            onClick={() => {
                              clearMommyState(instance.instanceId);
                              stripAllWearables(instance.instanceId);
                            }}
                            title="Nakey"
                          >
                            <Shirt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-purple-500/20 hover:text-purple-400 border border-transparent hover:border-purple-500/30"
                            onClick={() => {
                              clearMommyState(instance.instanceId);
                              restoreOriginalWearables(instance.instanceId);
                            }}
                            title="Restore original"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          {isLockSetEnabled(instance.baseGotchi.id) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
                              onClick={() => {
                                const override: LockedOverride = {
                                  wearablesBySlot: [...instance.equippedBySlot],
                                  respecAllocated: null,
                                  timestamp: Date.now(),
                                };
                                toggleLockSet(instance.baseGotchi.id, override);
                              }}
                              title="Unlock items"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg hover:bg-purple-500/20 hover:text-purple-400 border border-transparent hover:border-purple-500/30"
                              onClick={() => {
                                const override: LockedOverride = {
                                  wearablesBySlot: [...instance.equippedBySlot],
                                  respecAllocated: null,
                                  timestamp: Date.now(),
                                };
                                toggleLockSet(instance.baseGotchi.id, override);
                              }}
                              title="Lock & Set"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {activeSet && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg hover:bg-purple-500/20 hover:text-purple-400 border border-transparent hover:border-purple-500/30"
                              onClick={() => applySetToInstance(instance.instanceId)}
                              title={`Apply ${activeSet.name}`}
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/20 w-full"
                            onClick={() => setMommyModalInstanceId(instance.instanceId)}
                          >
                            <span className="flex items-center gap-0.5">
                              <Baby className="h-3 w-3" />
                              Mommy
                            </span>
                            <span className="text-[8px] text-muted-foreground">Dress Me™</span>
                          </Button>
                        </div>
                        
                        {mommyStatusMessage && mommyStatusMessage.instanceId === instance.instanceId && (
                          <div className="text-[9px] text-muted-foreground text-center max-w-[68px]">
                            {mommyStatusMessage.message}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 flex flex-col md:flex-row gap-3">
                        <div className="flex-1 min-w-0">
                          <GotchiCard
                            gotchi={instance.baseGotchi}
                            traitBase={instance.baseGotchi.baseRarityScore ?? traitBase}
                            traitWithMods={traitWithMods}
                            wearableFlat={wearableFlat}
                            setFlatBrs={setFlatBrs}
                            ageBrs={ageBrs}
                            totalBrs={totalBrs}
                            activeSetNames={activeSetNames}
                            traits={finalTraits}
                            showImage={false}
                            showRespec
                            respecResetKey={instance.instanceId}
                            baseTraits={instance.baseGotchi.numericTraits}
                            wearableDelta={wearableDelta}
                            setDelta={setTraitModsDelta}
                            enableSetFilter
                            showBestSets
                          />
                        </div>
                        
                        <div className="shrink-0 md:w-auto">
                          <SlotGrid
                            instanceId={instance.instanceId}
                            equippedBySlot={instance.equippedBySlot}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {mommyResultForInstance && (
                    <div className="border-t border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-fuchsia-500/5 to-violet-500/5">
                      <div className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-sm">
                              <span className="text-[10px]">👶</span>
                            </div>
                            <span className="text-xs font-medium bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                              Build Applied
                            </span>
                            {!currentMatchesMommy && (
                              <span className="text-[10px] text-muted-foreground/70 italic hidden sm:inline">
                                (modified)
                              </span>
                            )}
                          </div>
                          
                          {mommyOptionsForInstance && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategy:</span>
                              <span className="text-[11px] font-medium text-purple-400">
                                {mommyOptionsForInstance.goal === "maximizeBRS" 
                                  ? "Max BRS" 
                                  : mommyOptionsForInstance.traitShapeType === "oneDominant" 
                                    ? "Dominant" 
                                    : mommyOptionsForInstance.traitShapeType === "twoEqual" 
                                      ? "Dual" 
                                      : "Balanced"}
                              </span>
                            </div>
                          )}
                          
                          {(() => {
                            let finalBaseTraits = instance.baseGotchi.numericTraits;
                            if (mommyResultForInstance.respecAllocated) {
                              finalBaseTraits = [...instance.baseGotchi.numericTraits];
                              for (let i = 0; i < 4; i++) {
                                finalBaseTraits[i] = Math.max(0, Math.min(99, finalBaseTraits[i] + (mommyResultForInstance.respecAllocated[i] || 0)));
                              }
                            }
                            
                            const finalTraitsEval = computeInstanceTraits({
                              baseTraits: finalBaseTraits,
                              modifiedNumericTraits: isBaseEquipment && !mommyResultForInstance.respecAllocated
                                ? instance.baseGotchi.modifiedNumericTraits
                                : undefined,
                              withSetsNumericTraits: isBaseEquipment && !mommyResultForInstance.respecAllocated
                                ? instance.baseGotchi.withSetsNumericTraits
                                : undefined,
                              equippedBySlot: mommyResultForInstance.equippedWearables,
                              wearablesById,
                              blocksElapsed: instance.baseGotchi.blocksElapsed,
                            });
                            const finalActiveSets = finalTraitsEval.activeSets;
                            const brsDelta = mommyResultForInstance.brsDelta || 0;
                            const setDelta = finalActiveSets.length - currentActiveSets.length;
                            
                            return (
                              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/20">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Result:</span>
                                <span className="text-[11px] font-medium text-fuchsia-400">
                                  +{brsDelta.toFixed(1)} BRS
                                </span>
                                {setDelta > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({setDelta} set{setDelta > 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          
                          {mommyResultForInstance.traitDeltas && mommyResultForInstance.traitDeltas.slice(0, 4).some(d => Math.abs(d) >= 0.1) && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {mommyResultForInstance.traitDeltas.slice(0, 4).map((delta, i) => {
                                if (Math.abs(delta) < 0.1) return null;
                                const traitNames = ["NRG", "AGG", "SPK", "BRN"];
                                const isPositive = delta > 0;
                                return (
                                  <span
                                    key={i}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      isPositive 
                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                                        : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                                    }`}
                                  >
                                    {isPositive ? "+" : ""}{delta.toFixed(0)} {traitNames[i]}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {mommyModalInstanceId && (() => {
        const instance = editorInstances.find(i => i.instanceId === mommyModalInstanceId);
        if (!instance) return null;

        const ownedWearables = new Map<number, Wearable>();
        for (const [id, wearable] of wearablesById.entries()) {
          if ((availCountsWithLocked[id] || 0) > 0) {
            ownedWearables.set(id, wearable);
          }
        }

        const override = lockedById[instance.baseGotchi.id] 
          ? useAppStore.getState().getOverride(instance.baseGotchi.id)
          : null;
        const lockedSlots = new Set<number>();
        if (override?.wearablesBySlot) {
          override.wearablesBySlot.forEach((wearableId, slotIndex) => {
            if (wearableId && wearableId !== 0) {
              lockedSlots.add(slotIndex);
            }
          });
        }

        return (
          <MommyDressModal
            instance={instance}
            ownedWearables={ownedWearables}
            availCounts={availCountsWithLocked}
            wearablesById={wearablesById}
            lockedSlots={lockedSlots}
            onClose={() => setMommyModalInstanceId(null)}
            onApply={(result: AutoDressResult, options: AutoDressOptions) => {
              if (import.meta.env.DEV && result.success) {
                for (const wearableId of result.equippedWearables) {
                  if (wearableId !== 0 && !ownedWearables.has(wearableId)) {
                    console.error(
                      `[Mommy Dress Me] INVARIANT VIOLATION: Wearable ${wearableId} not in owned inventory`,
                      { wearableId, ownedWearableIds: Array.from(ownedWearables.keys()) }
                    );
                    return;
                  }
                }
              }

              setMommyStatusMessage(null);
              const preMommyEquipped = normalizeEquipped(instance.equippedBySlot);
              
              setMommyResult(prev => ({
                ...prev,
                [instance.instanceId]: result,
              }));
              setMommyOptions(prev => ({
                ...prev,
                [instance.instanceId]: options,
              }));
              setMommyPreEquipped(prev => ({
                ...prev,
                [instance.instanceId]: preMommyEquipped,
              }));

              updateEditorInstance(instance.instanceId, result.equippedWearables);
            }}
            onNoImprovement={() => {
              setMommyStatusMessage({ instanceId: instance.instanceId, message: "Already optimized for this goal." });
            }}
          />
        );
      })()}
    </div>
  );
}
