import { useDroppable } from "@dnd-kit/core";
import { SlotCard } from "./SlotCard";
import { useAppStore } from "@/state/useAppStore";
import { useWearablesById, useWearableInventory } from "@/state/selectors";
import { canEquipInSlot } from "@/lib/equipRules";
import { useToast } from "@/ui/use-toast";
import type { Wearable } from "@/types";
import type { DragEventHandler } from "react";

interface SlotGridProps {
  instanceId: string;
  equippedBySlot: number[];
}

export function SlotGrid({ instanceId, equippedBySlot }: SlotGridProps) {
  const wearablesById = useWearablesById();
  const setFilters = useAppStore((state) => state.setFilters);

  const handleSlotClick = (slotIndex: number) => {
    setFilters({ slot: slotIndex });
  };

  return (
    <div className="grid grid-cols-4 gap-2 items-start min-w-0">
      {Array.from({ length: 8 }, (_, i) => {
        const wearableId = equippedBySlot[i];
        const wearable = wearableId
          ? wearablesById.get(wearableId) ?? null
          : null;
        return (
          <SlotDropTarget
            key={i}
            slotIndex={i}
            wearable={wearable}
            instanceId={instanceId}
            onSlotClick={handleSlotClick}
          />
        );
      })}
    </div>
  );
}

function SlotDropTarget({
  slotIndex,
  wearable,
  instanceId,
  onSlotClick,
}: {
  slotIndex: number;
  wearable: Wearable | null;
  instanceId: string;
  onSlotClick?: (slotIndex: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${instanceId}:${slotIndex}`,
  });
  const equipWearable = useAppStore((state) => state.equipWearable);
  const wearablesById = useWearablesById();
  const { ownedCounts } = useWearableInventory();
  const { toast } = useToast();

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    if (!data.startsWith("wearable:")) return;
    const wearableId = Number(data.split(":")[1]);
    const wearableData = wearablesById.get(wearableId);
    if (!wearableData) return;

    if (!canEquipInSlot(wearableData, slotIndex)) {
      toast({
        title: "Invalid Slot",
        description: `${wearableData.name} cannot be equipped in that slot`,
        variant: "destructive",
      });
      return;
    }

    const equipped = equipWearable(instanceId, wearableId, slotIndex);
    if (!equipped) {
      toast({
        title: "Not enough copies",
        description: `You only own ${ownedCounts[wearableId] || 0} of ${wearableData.name}`,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Equipped",
      description: `${wearableData.name} equipped`,
    });
  };

  const handleDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
  };

  return (
    <div
      ref={setNodeRef}
      data-testid={
        slotIndex === 4
          ? "slot-leftHand"
          : slotIndex === 5
          ? "slot-rightHand"
          : undefined
      }
    >
      <SlotCard
        slotIndex={slotIndex}
        wearable={wearable}
        isDragOver={isOver}
        instanceId={instanceId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onSlotClick={onSlotClick}
      />
    </div>
  );
}

