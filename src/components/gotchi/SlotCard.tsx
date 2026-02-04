import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { Button } from "@/ui/button";
import { X } from "lucide-react";
import { SLOT_NAMES } from "@/lib/constants";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { formatTraitValue } from "@/lib/format";
import { useEffect, useState, useMemo } from "react";
import type { Wearable } from "@/types";
import { useAppStore } from "@/state/useAppStore";

const TRAIT_LABELS = ["NRG", "AGG", "SPK", "BRN"];

interface SlotCardProps {
  slotIndex: number;
  wearable: Wearable | null;
  isDragOver: boolean;
  instanceId: string;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onSlotClick?: (slotIndex: number) => void;
}

export function SlotCard({
  slotIndex,
  wearable,
  isDragOver,
  instanceId,
  onDrop,
  onDragOver,
  onSlotClick,
}: SlotCardProps) {
  const unequipSlot = useAppStore((state) => state.unequipSlot);
  const imageUrls = wearable ? getWearableIconUrlCandidates(wearable.id) : [];
  const [urlIndex, setUrlIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const fallbackSvg = placeholderSvg(
    wearable ? String(wearable.id) : `slot:${slotIndex}`,
    "no image"
  );
  const emptySlotSvg =
    '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="12" fill="hsl(203 50% 95%)"/></svg>';

  const tooltip = useMemo(() => {
    if (!wearable) return SLOT_NAMES[slotIndex];
    const traitSummary = wearable.traitModifiers
      .slice(0, 4)
      .map((mod, i) => {
        if (mod === 0) return null;
        return `${TRAIT_LABELS[i]} ${formatTraitValue(mod)}`;
      })
      .filter(Boolean)
      .join(", ");
    return `${wearable.name}${traitSummary ? ` • ${traitSummary}` : ""}`;
  }, [wearable, slotIndex]);

  useEffect(() => {
    setUrlIndex(0);
    setLoaded(false);
    setErrored(false);
  }, [wearable?.id]);

  return (
    <motion.div
      animate={{
        scale: isDragOver ? 1.05 : 1,
        borderColor: isDragOver ? "hsl(var(--primary))" : undefined,
      }}
      transition={{ duration: 0.2 }}
    >
      <Card
        data-testid={`slot-${instanceId}-${slotIndex}`}
        data-wearable-id={wearable ? String(wearable.id) : ""}
        title={tooltip}
        className={`group relative w-[72px] flex-shrink-0 p-1 overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/50 ${
          isDragOver ? "ring-2 ring-primary" : ""
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => onSlotClick?.(slotIndex)}
      >
        <div className="text-[9px] text-muted-foreground mb-0.5 truncate">
          {SLOT_NAMES[slotIndex]}
        </div>
        <div className="h-[52px] w-full rounded-md bg-muted flex items-center justify-center overflow-hidden">
          {!wearable ? (
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: emptySlotSvg }}
            />
          ) : !imageUrls[urlIndex] || errored ? (
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: fallbackSvg }}
            />
          ) : (
            <img
              src={imageUrls[urlIndex]}
              alt={wearable?.name || "wearable"}
              className={`max-h-[48px] max-w-[48px] object-contain transition-opacity duration-200 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => {
                if (urlIndex < imageUrls.length - 1) {
                  setLoaded(false);
                  setUrlIndex((idx) => idx + 1);
                  return;
                }
                setErrored(true);
              }}
            />
          )}
          {!loaded && !!imageUrls[urlIndex] && !errored && (
            <div className="absolute inset-1 rounded-md bg-muted/60 animate-pulse" />
          )}
        </div>
        {wearable && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100 transition"
            onClick={(e) => {
              e.stopPropagation();
              unequipSlot(instanceId, slotIndex);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {wearable && (
          <div className="mt-0.5 flex flex-wrap gap-0.5 justify-center">
            {wearable.traitModifiers.slice(0, 4).map((mod, i) => {
              if (mod === 0) return null;
              const labels = ["N", "A", "S", "B"];
              return (
                <span
                  key={`${wearable.id}-${i}`}
                  className="text-[8px] leading-none px-0.5 py-[1px] rounded bg-[hsl(var(--chip-bg))] text-[hsl(var(--chip-text))] border"
                >
                  {labels[i]}{formatTraitValue(mod)}
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

