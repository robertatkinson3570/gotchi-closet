import { useDroppable } from "@dnd-kit/core";
import { SlotCard } from "./SlotCard";
import { useAppStore } from "@/state/useAppStore";
import { useWearablesById } from "@/state/selectors";
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
  const { toast } = useToast();

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    if (!data.startsWith("wearable:")) return;
    const wearableId = Number(data.split(":")[1]);
    const wearableData = wearablesById.get(wearableId);
    if (!wearableData) return;

    const handPlacement = wearableData.handPlacement || "none";
    const isLeftHand = slotIndex === 4;
    const isRightHand = slotIndex === 5;
    const isHandSlot = isLeftHand || isRightHand;
    const matchesHand = !isHandSlot
      ? true
      : handPlacement === "either" ||
        (handPlacement === "left" && isLeftHand) ||
        (handPlacement === "right" && isRightHand) ||
        (handPlacement === "none" && wearableData.slotPositions[slotIndex]);

    if (!wearableData.slotPositions[slotIndex] || !matchesHand) {
      toast({
        title: "Invalid Slot",
        description: `${wearableData.name} cannot be equipped in that slot`,
        variant: "destructive",
      });
      return;
    }

    equipWearable(instanceId, wearableId, slotIndex);
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

