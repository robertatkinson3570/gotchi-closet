import { motion } from "framer-motion";
import { Card } from "@/ui/card";
import { formatTraitValue } from "@/lib/format";
import {
  getWearableCandidateFields,
  getWearableIconUrlCandidates,
} from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { useEffect, useState } from "react";

let didLogWearableDebug = false;
import type { Wearable } from "@/types";

interface WearableCardViewProps {
  wearable: Wearable;
  onClick?: () => void;
  nativeDrag?: boolean;
}

export function WearableCardView({
  wearable,
  onClick,
  nativeDrag = false,
}: WearableCardViewProps) {
  const traitSummary = wearable.traitModifiers
    .slice(0, 4)
    .map((mod, i) => {
      const labels = ["NRG", "AGG", "SPK", "BRN"];
      if (mod === 0) return null;
      return `${labels[i]} ${formatTraitValue(mod)}`;
    })
    .filter(Boolean)
    .join(", ");
  const tooltip = `${wearable.name} • Rarity ${wearable.rarityScoreModifier}${
    traitSummary ? ` • ${traitSummary}` : ""
  }`;
  const imageUrls = getWearableIconUrlCandidates(wearable.id);
  const [urlIndex, setUrlIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const fallbackSvg = placeholderSvg(String(wearable.id), "no image");
  useEffect(() => {
    if (!import.meta.env.DEV || didLogWearableDebug) return;
    didLogWearableDebug = true;
    const fields = getWearableCandidateFields(wearable);
    console.debug("[wearable-debug]", {
      id: wearable.id,
      candidates: fields,
    });
  }, [wearable]);

  useEffect(() => {
    setUrlIndex(0);
    setLoaded(false);
    setErrored(false);
  }, [wearable.id]);
  return (
    <Card
      data-testid={`wearable-card-${wearable.id}`}
      className={`group relative w-[120px] p-1 overflow-visible ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      draggable={nativeDrag}
      onDragStart={
        nativeDrag
          ? (event) => {
              event.dataTransfer.setData("text/plain", `wearable:${wearable.id}`);
            }
          : undefined
      }
      title={tooltip}
    >
      <div className="h-[96px] w-full flex items-center justify-center overflow-visible">
        <div
          data-testid={`wearable-thumb-${wearable.id}`}
          className="h-[96px] w-full flex items-center justify-center"
        >
          {!imageUrls[urlIndex] || errored ? (
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: fallbackSvg }}
            />
          ) : (
            <img
              src={imageUrls[urlIndex]}
              alt={wearable.name}
              className={`max-h-[92px] max-w-[92px] object-contain transition-opacity duration-200 ${
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
        </div>
        {!loaded && !!imageUrls[urlIndex] && !errored && (
          <div className="absolute inset-2 rounded-md bg-muted/60 animate-pulse" />
        )}
      </div>
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
    </Card>
  );
}

interface WearableCardProps extends WearableCardViewProps {}

export function WearableCard({ wearable, onClick }: WearableCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="touch-none select-none"
    >
      <WearableCardView
        wearable={wearable}
        onClick={onClick}
        nativeDrag
      />
    </motion.div>
  );
}

