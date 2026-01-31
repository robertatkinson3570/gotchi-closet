import { Card } from "@/ui/card";
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

// Helper function to normalize equipped array to 16 slots
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
  const removeEditorInstance = useAppStore(
    (state) => state.removeEditorInstance
  );
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
  const [mommyPreEquipped, setMommyPreEquipped] = useState<Record<string, number[]>>({}); // Pre-Mommy equipped state for baseline
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

  // Auto-clear mommy status message after 4 seconds
  useEffect(() => {
    if (mommyStatusMessage) {
      // Clear any existing timeout
      if (mommyStatusTimeoutRef.current) {
        clearTimeout(mommyStatusTimeoutRef.current);
      }
      // Set new timeout
      mommyStatusTimeoutRef.current = setTimeout(() => {
        setMommyStatusMessage(null);
      }, 4000);
    }
    // Cleanup on unmount or when message changes
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

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      {editorInstances.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          Click a gotchi to add it to the editor.
        </div>
      ) : (
        <div className="space-y-2">
          {editorInstances.map((instance) => (
            <Card
              key={instance.instanceId}
              data-testid={`editor-instance-${instance.instanceId}`}
              className="p-3 flex flex-col gap-2"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start min-w-0">
                <div className="flex items-start gap-2 min-w-0 md:w-[280px] shrink-0">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <GotchiSvg
                      gotchiId={
                        instance.baseGotchi.gotchiId || instance.baseGotchi.id
                      }
                      hauntId={instance.baseGotchi.hauntId}
                      collateral={instance.baseGotchi.collateral}
                      numericTraits={instance.baseGotchi.numericTraits}
                      equippedWearables={instance.equippedBySlot}
                      className="h-16 w-16"
                      mode="preview"
                      testId={`editor-gotchi-svg-${instance.instanceId}`}
                    />
                    {activeSet && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight"
                        onClick={() => applySetToInstance(instance.instanceId)}
                      >
                        <span className="flex items-center gap-0.5">
                          <Wand2 className="h-3 w-3" />
                          Apply
                        </span>
                        <span className="text-[8px] text-muted-foreground">{activeSet.name}</span>
                      </Button>
                    )}
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight"
                        onClick={() => filterBestForGotchi(instance.baseGotchi.numericTraits)}
                      >
                        <span className="flex items-center gap-0.5">
                          <Sparkles className="h-3 w-3" />
                          Best
                        </span>
                        <span className="text-[8px] text-muted-foreground">Wearables</span>
                      </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight"
                          onClick={() => {
                            // Clear Mommy result when user explicitly strips all
                            setMommyResult(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            setMommyOptions(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            setMommyPreEquipped(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            stripAllWearables(instance.instanceId);
                          }}
                        >
                          <span className="flex items-center gap-0.5">
                            <Shirt className="h-3 w-3" />
                            Nakey
                          </span>
                          <span className="text-[8px] text-muted-foreground">Strip All</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight"
                          onClick={() => {
                            // Clear Mommy result when user explicitly restores
                            setMommyResult(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            setMommyOptions(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            setMommyPreEquipped(prev => {
                              const next = { ...prev };
                              delete next[instance.instanceId];
                              return next;
                            });
                            restoreOriginalWearables(instance.instanceId);
                          }}
                        >
                          <span className="flex items-center gap-0.5">
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </span>
                          <span className="text-[8px] text-muted-foreground">Original</span>
                        </Button>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight border-pink-500/50 bg-pink-500/10"
                          onClick={() => setMommyModalInstanceId(instance.instanceId)}
                        >
                          <span className="flex items-center gap-0.5">
                            <Baby className="h-3 w-3" />
                            Mommy
                          </span>
                          <span className="text-[8px] text-muted-foreground">Dress Me™</span>
                        </Button>
                        {mommyStatusMessage && mommyStatusMessage.instanceId === instance.instanceId && (
                          <div className="text-[8px] text-muted-foreground text-center">
                            {mommyStatusMessage.message}
                          </div>
                        )}
                      </div>
                      {isLockSetEnabled(instance.baseGotchi.id) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight border-amber-500/50 bg-amber-500/10"
                          onClick={() => {
                            const override: LockedOverride = {
                              wearablesBySlot: [...instance.equippedBySlot],
                              respecAllocated: null,
                              timestamp: Date.now(),
                            };
                            toggleLockSet(instance.baseGotchi.id, override);
                          }}
                        >
                          <span className="flex items-center gap-0.5">
                            <Unlock className="h-3 w-3" />
                            Unlock
                          </span>
                          <span className="text-[8px] text-muted-foreground">Release Items</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto py-1 px-1.5 text-[9px] flex-col leading-tight"
                          onClick={() => {
                            const override: LockedOverride = {
                              wearablesBySlot: [...instance.equippedBySlot],
                              respecAllocated: null,
                              timestamp: Date.now(),
                            };
                            toggleLockSet(instance.baseGotchi.id, override);
                          }}
                        >
                          <span className="flex items-center gap-0.5">
                            <Lock className="h-3 w-3" />
                            Lock & Set
                          </span>
                          <span className="text-[8px] text-muted-foreground">Reserve Items</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    {(() => {
                      const isBaseEquipment =
                        instance.equippedBySlot.length ===
                          instance.baseGotchi.equippedWearables.length &&
                        instance.equippedBySlot.every(
                          (id, idx) =>
                            id === instance.baseGotchi.equippedWearables[idx]
                        );
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
                        modifiedNumericTraits: isBaseEquipment
                          ? instance.baseGotchi.modifiedNumericTraits
                          : undefined,
                        withSetsNumericTraits: isBaseEquipment
                          ? instance.baseGotchi.withSetsNumericTraits
                          : undefined,
                        equippedBySlot: instance.equippedBySlot,
                        wearablesById,
                        blocksElapsed: instance.baseGotchi.blocksElapsed,
                      });
                      const activeSetNames = activeSets.map((set) => set.name);
                      const mommyResultForInstance = mommyResult[instance.instanceId];
                      const mommyOptionsForInstance = mommyOptions[instance.instanceId];
                      const preMommyEquipped = mommyPreEquipped[instance.instanceId];
                      
                      // Compute pre-Mommy traits using the actual equipped state before Mommy ran
                      // If pre-Mommy state is not available (legacy), fall back to base gotchi equipped
                      const preMommyEquippedState = preMommyEquipped || instance.baseGotchi.equippedWearables;
                      const currentTraitsEval = computeInstanceTraits({
                        baseTraits: instance.baseGotchi.numericTraits,
                        modifiedNumericTraits: isBaseEquipment
                          ? instance.baseGotchi.modifiedNumericTraits
                          : undefined,
                        withSetsNumericTraits: isBaseEquipment
                          ? instance.baseGotchi.withSetsNumericTraits
                          : undefined,
                        equippedBySlot: preMommyEquippedState,
                        wearablesById,
                        blocksElapsed: instance.baseGotchi.blocksElapsed,
                      });
                      const currentActiveSets = currentTraitsEval.activeSets;
                      
                      // Check if current editor state matches Mommy build
                      const mommyEquipped = mommyResultForInstance?.equippedWearables;
                      const currentMatchesMommy = mommyEquipped 
                        ? mommyEquipped.length === instance.equippedBySlot.length &&
                          mommyEquipped.every((id, idx) => (id || 0) === (instance.equippedBySlot[idx] || 0))
                        : false;
                      
                      return (
                        <>
                          {mommyResultForInstance && (
                            <div className="mb-3 rounded-xl overflow-hidden">
                              {/* Gradient border wrapper */}
                              <div className="p-[1px] bg-gradient-to-br from-purple-500/40 via-fuchsia-500/30 to-violet-600/40 rounded-xl">
                                <div className="bg-gradient-to-br from-background via-background to-purple-950/20 rounded-xl p-3">
                                  {/* Header with icon */}
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-md shadow-purple-500/20">
                                        <span className="text-xs">👶</span>
                                      </div>
                                      <span className="text-sm font-semibold bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                                        Build Applied
                                      </span>
                                    </div>
                                    {!currentMatchesMommy && (
                                      <span className="text-[10px] text-muted-foreground italic">
                                        You've made changes since Mommy applied this build
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Strategy & Results Grid */}
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    {/* Strategy Card */}
                                    {mommyOptionsForInstance && (
                                      <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Strategy</div>
                                        <div className="text-xs font-medium text-purple-400">
                                          {mommyOptionsForInstance.goal === "maximizeBRS" ? "Max BRS" : "Trait Sculptor"}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {mommyOptionsForInstance.goal === "maximizeBRS" 
                                            ? "Rarity optimized"
                                            : mommyOptionsForInstance.traitShapeType === "oneDominant" ? "Dominant" 
                                            : mommyOptionsForInstance.traitShapeType === "twoEqual" ? "Dual traits" 
                                            : "Balanced"}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Results Card */}
                                    <div className="p-2.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20">
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
                                          <>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Result</div>
                                            <div className="text-xs font-medium text-fuchsia-400">
                                              +{brsDelta.toFixed(1)} BRS
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                              {setDelta > 0 ? `${setDelta} set${setDelta > 1 ? 's' : ''} active` : "Optimized"}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                              
                                  {/* Trait Changes */}
                                  {mommyResultForInstance.traitDeltas && mommyResultForInstance.traitDeltas.slice(0, 4).some(d => Math.abs(d) >= 0.1) && (
                                    <div className="pt-2 border-t border-purple-500/15">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Trait Changes</div>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {mommyResultForInstance.traitDeltas.slice(0, 4).map((delta, i) => {
                                          if (Math.abs(delta) < 0.1) return null;
                                          const traitNames = ["NRG", "AGG", "SPK", "BRN"];
                                          const isPositive = delta > 0;
                                          return (
                                            <span
                                              key={i}
                                              className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                                                isPositive 
                                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" 
                                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                                              }`}
                                            >
                                              {isPositive ? "+" : ""}{delta.toFixed(0)} {traitNames[i]}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
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
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <SlotGrid
                    instanceId={instance.instanceId}
                    equippedBySlot={instance.equippedBySlot}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="self-start shrink-0"
                  onClick={() => removeEditorInstance(instance.instanceId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {mommyModalInstanceId && (() => {
        const instance = editorInstances.find(i => i.instanceId === mommyModalInstanceId);
        if (!instance) return null;

        // Get owned wearables (available in inventory)
        // CRITICAL: Use the same inventory source as Wearable Selector (availCountsWithLocked)
        // This ensures Mommy only considers wearables visible in the selector when wearableMode === "owned"
        // availCountsWithLocked already accounts for:
        // - ownedCounts (from all gotchis in selector scope)
        // - usedCounts (from editor instances)
        // - lockedAllocations (from locked gotchis' equipped wearables)
        const ownedWearables = new Map<number, Wearable>();
        for (const [id, wearable] of wearablesById.entries()) {
          if ((availCountsWithLocked[id] || 0) > 0) {
            ownedWearables.set(id, wearable);
          }
        }

        // Get locked slots
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
              // Dev-only invariant check: verify all equipped wearables exist in ownedWearables
              // (Count validation is handled by engine's validateState function)
              if (import.meta.env.DEV && result.success) {
                for (const wearableId of result.equippedWearables) {
                  if (wearableId !== 0 && !ownedWearables.has(wearableId)) {
                    console.error(
                      `[Mommy Dress Me] INVARIANT VIOLATION: Wearable ${wearableId} not in owned inventory (not available in Wearable Selector)`,
                      { wearableId, ownedWearableIds: Array.from(ownedWearables.keys()) }
                    );
                    return; // Don't apply result
                  }
                }
              }

              // Clear any status message on successful apply
              setMommyStatusMessage(null);
              
              // Capture pre-Mommy equipped state for baseline calculations
              const preMommyEquipped = normalizeEquipped(instance.equippedBySlot);
              
              // Store result, options, and pre-Mommy equipped state for display
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

              // Apply result
              updateEditorInstance(instance.instanceId, result.equippedWearables);
              
              // TODO: Apply respec if result.respecAllocated is provided
              // This would require integration with the respec system
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

