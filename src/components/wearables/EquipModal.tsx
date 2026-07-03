import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/sheet";
import { Button } from "@/ui/button";
import { SLOT_NAMES } from "@/lib/constants";
import { useAppStore } from "@/state/useAppStore";
import { useWearableInventory } from "@/state/selectors";
import { allowedSlotsFor } from "@/lib/equipRules";
import { useToast } from "@/ui/use-toast";
import { useState } from "react";
import type { Wearable } from "@/types";

interface EquipModalProps {
  wearable: Wearable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EquipModal({ wearable, open, onOpenChange }: EquipModalProps) {
  const equipWearable = useAppStore((state) => state.equipWearable);
  const editorInstances = useAppStore((state) => state.editorInstances);
  const { ownedCounts } = useWearableInventory();
  const { toast } = useToast();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null
  );

  if (!wearable) return null;

  // Shared slot rules (audit M3): hand placement is honored here too, instead
  // of offering every slotPositions slot.
  const allowedSlots = allowedSlotsFor(wearable);

  // A stale selection (instance removed) falls back to the first instance.
  const targetInstance =
    editorInstances.find((i) => i.instanceId === selectedInstanceId) ??
    editorInstances[0];

  const handleEquip = (slotIndex: number) => {
    if (!targetInstance) return;
    const equipped = equipWearable(
      targetInstance.instanceId,
      wearable.id,
      slotIndex
    );
    if (!equipped) {
      toast({
        title: "Not enough copies",
        description: `You only own ${ownedCounts[wearable.id] || 0} of ${wearable.name}`,
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{wearable.name}</SheetTitle>
          <SheetDescription>
            Select a slot to equip this wearable
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {editorInstances.length === 0 ? (
            <p className="text-muted-foreground">
              Add a gotchi to the editor first.
            </p>
          ) : (
            <>
              {editorInstances.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Equip on</p>
                  <div className="flex flex-wrap gap-1.5">
                    {editorInstances.map((instance) => (
                      <Button
                        key={instance.instanceId}
                        variant={
                          instance.instanceId === targetInstance?.instanceId
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setSelectedInstanceId(instance.instanceId)
                        }
                      >
                        {instance.baseGotchi.name} (#
                        {instance.baseGotchi.gotchiId || instance.baseGotchi.id})
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {allowedSlots.length === 0 ? (
                <p className="text-muted-foreground">
                  This wearable cannot be equipped in any slot.
                </p>
              ) : (
                allowedSlots.map((slotIndex) => (
                  <Button
                    key={slotIndex}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleEquip(slotIndex)}
                  >
                    {SLOT_NAMES[slotIndex]}
                  </Button>
                ))
              )}
            </>
          )}
          <Button
            variant="ghost"
            className="w-full mt-4"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
