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
  availCount?: number;
  priceGHST?: string;
}

export function WearableCardView({
  wearable,
  onClick,
  nativeDrag = false,
  availCount,
  priceGHST,
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
      className={`group relative w-[72px] p-1 overflow-hidden ${onClick ? "cursor-pointer" : ""}`}
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
      <div className="h-[52px] w-full flex items-center justify-center overflow-hidden rounded-md bg-muted relative">
        {availCount !== undefined && availCount > 0 && (
          <span className="absolute top-0.5 right-0.5 z-10 text-[9px] font-semibold px-1 py-0.5 rounded bg-primary text-primary-foreground leading-none">
            ×{availCount}
          </span>
        )}
        <div
          data-testid={`wearable-thumb-${wearable.id}`}
          className="h-[52px] w-full flex items-center justify-center"
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
        </div>
        {!loaded && !!imageUrls[urlIndex] && !errored && (
          <div className="absolute inset-1 rounded-md bg-muted/60 animate-pulse" />
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-0.5 justify-center">
        {wearable.traitModifiers.slice(0, 4).map((mod, i) => {
          if (mod === 0) return null;
          const labels = ["NRG", "AGG", "SPK", "BRN"];
          return (
            <span
              key={`${wearable.id}-${i}`}
              className="text-[8px] leading-none px-0.5 py-[1px] rounded bg-[hsl(var(--chip-bg))] text-[hsl(var(--chip-text))] border"
            >
              {labels[i]} {formatTraitValue(mod)}
            </span>
          );
        })}
      </div>
      {priceGHST && (
        <a
          href={`https://dapp.aavegotchi.com/baazaar/wearables?search=${encodeURIComponent(wearable.name)}&chainId=8453`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 block text-center text-[9px] text-emerald-600 dark:text-emerald-400 font-medium truncate hover:underline"
        >
          From {parseFloat(priceGHST).toFixed(0)} GHST
        </a>
      )}
    </Card>
  );
}

interface WearableCardProps extends WearableCardViewProps {}

export function WearableCard({ wearable, onClick, availCount, priceGHST }: WearableCardProps) {
  return (
    <motion.div
      data-testid={`wearable-${wearable.id}`}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="touch-none select-none"
    >
      <WearableCardView
        wearable={wearable}
        onClick={onClick}
        nativeDrag
        availCount={availCount}
        priceGHST={priceGHST}
      />
    </motion.div>
  );
}

