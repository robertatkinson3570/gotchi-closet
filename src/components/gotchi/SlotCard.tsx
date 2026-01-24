import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { Button } from "@/ui/button";
import { X } from "lucide-react";
import { SLOT_NAMES } from "@/lib/constants";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { formatTraitValue } from "@/lib/format";
import { useEffect, useState } from "react";
import type { Wearable } from "@/types";
import { useAppStore } from "@/state/useAppStore";

interface SlotCardProps {
  slotIndex: number;
  wearable: Wearable | null;
  isDragOver: boolean;
  instanceId: string;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
}

export function SlotCard({
  slotIndex,
  wearable,
  isDragOver,
  instanceId,
  onDrop,
  onDragOver,
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
        className={`group relative w-[88px] flex-shrink-0 p-1 ${
          isDragOver ? "ring-2 ring-primary" : ""
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <div className="text-[10px] text-muted-foreground mb-1">
          {SLOT_NAMES[slotIndex]}
        </div>
        <div className="h-[64px] w-full rounded-md bg-muted flex items-center justify-center">
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
              className={`max-h-[60px] max-w-[60px] object-contain transition-opacity duration-200 ${
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
            onClick={() => unequipSlot(instanceId, slotIndex)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {wearable && (
          <div className="mt-1 flex flex-wrap gap-1 justify-center">
            {wearable.traitModifiers.slice(0, 4).map((mod, i) => {
              if (mod === 0) return null;
              const labels = ["NRG", "AGG", "SPK", "BRN"];
              return (
                <span
                  key={`${wearable.id}-${i}`}
                  className="text-[10px] leading-none px-1 py-[1px] rounded bg-[hsl(var(--chip-bg))] text-[hsl(var(--chip-text))] border"
                >
                  {labels[i]} {formatTraitValue(mod)}
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

