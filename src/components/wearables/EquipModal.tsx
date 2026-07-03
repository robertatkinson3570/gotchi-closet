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
import { useToast } from "@/ui/use-toast";
import type { Wearable } from "@/types";

interface EquipModalProps {
  wearable: Wearable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EquipModal({ wearable, open, onOpenChange }: EquipModalProps) {
  const equipWearable = useAppStore((state) => state.equipWearable);
  const activeInstanceId = useAppStore(
    (state) => state.editorInstances[0]?.instanceId
  );
  const { ownedCounts } = useWearableInventory();
  const { toast } = useToast();

  if (!wearable) return null;

  const allowedSlots = wearable.slotPositions
    .map((allowed, i) => (allowed ? i : null))
    .filter((i) => i !== null) as number[];

  const handleEquip = (slotIndex: number) => {
    if (!activeInstanceId) return;
    const equipped = equipWearable(activeInstanceId, wearable.id, slotIndex);
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

