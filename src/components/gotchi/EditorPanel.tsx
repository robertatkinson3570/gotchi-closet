import { Card } from "@/ui/card";
import { SlotGrid } from "./SlotGrid";
import { useAppStore } from "@/state/useAppStore";
import { GotchiSvg } from "./GotchiSvg";
import { X } from "lucide-react";
import { Button } from "@/ui/button";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
import { GotchiCard } from "./GotchiCard";

export function EditorPanel() {
  const editorInstances = useAppStore((state) => state.editorInstances);
  const wearablesById = useWearablesById();
  const removeEditorInstance = useAppStore(
    (state) => state.removeEditorInstance
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
                  <GotchiSvg
                    gotchiId={
                      instance.baseGotchi.gotchiId || instance.baseGotchi.id
                    }
                    hauntId={instance.baseGotchi.hauntId}
                    collateral={instance.baseGotchi.collateral}
                    numericTraits={instance.baseGotchi.numericTraits}
                    equippedWearables={instance.equippedBySlot}
                    className="h-16 w-16 flex-shrink-0"
                    mode="preview"
                    testId={`editor-gotchi-svg-${instance.instanceId}`}
                  />
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

