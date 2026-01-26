import { Card } from "@/ui/card";
import { SlotGrid } from "./SlotGrid";
import { useAppStore } from "@/state/useAppStore";
import { GotchiSvg } from "./GotchiSvg";
import { X, Wand2, Sparkles, Shirt, RotateCcw } from "lucide-react";
import { Button } from "@/ui/button";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";
import { useMemo, useCallback } from "react";

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

  const filterBestForGotchi = useCallback(
    (traits: number[]) => {
      const directions = getTraitDirections(traits);
      setFilters({ traitDirections: directions });
    },
    [getTraitDirections, setFilters]
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
                    <div className="flex flex-wrap gap-1 justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[8px]"
                        onClick={() => filterBestForGotchi(instance.baseGotchi.numericTraits)}
                        title="Filter wearables that benefit this gotchi"
                      >
                        <Sparkles className="h-3 w-3 mr-0.5" />
                        Best
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[8px]"
                        onClick={() => stripAllWearables(instance.instanceId)}
                        title="Remove all wearables"
                      >
                        <Shirt className="h-3 w-3 mr-0.5" />
                        Nakey
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[8px]"
                        onClick={() => restoreOriginalWearables(instance.instanceId)}
                        title="Restore original wearables"
                      >
                        <RotateCcw className="h-3 w-3 mr-0.5" />
                        Restore
                      </Button>
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
                      return (
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
    </div>
  );
}

