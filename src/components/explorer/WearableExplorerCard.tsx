import { useState, useEffect } from "react";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { formatTraitValue } from "@/lib/format";
import { getSlotName, getWearableRarityTier } from "@/lib/explorer/wearableTypes";
import type { ExplorerWearable } from "@/lib/explorer/wearableTypes";

interface WearableExplorerCardProps {
  wearable: ExplorerWearable;
  quantity?: number;
  price?: string;
  onClick?: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  Godlike: "text-cyan-400",
  Mythical: "text-pink-400",
  Legendary: "text-yellow-400",
  Rare: "text-blue-400",
  Uncommon: "text-green-400",
  Common: "text-gray-400",
};

const RARITY_BG: Record<string, string> = {
  Godlike: "bg-cyan-500/20 border-cyan-500/40",
  Mythical: "bg-pink-500/20 border-pink-500/40",
  Legendary: "bg-yellow-500/20 border-yellow-500/40",
  Rare: "bg-blue-500/20 border-blue-500/40",
  Uncommon: "bg-green-500/20 border-green-500/40",
  Common: "bg-gray-500/20 border-gray-500/40",
};

export function WearableExplorerCard({
  wearable,
  quantity,
  price,
  onClick,
}: WearableExplorerCardProps) {
  const imageUrls = getWearableIconUrlCandidates(wearable.id);
  const [urlIndex, setUrlIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const fallbackSvg = placeholderSvg(String(wearable.id), wearable.name);

  useEffect(() => {
    setUrlIndex(0);
    setLoaded(false);
    setErrored(false);
  }, [wearable.id]);

  const rarity = wearable.rarity || getWearableRarityTier(wearable.rarityScoreModifier);
  const slots = wearable.slots || [];
  const slotLabel = slots.length > 0 ? getSlotName(slots[0]) : "—";

  const traitMods = wearable.traitModifiers.slice(0, 4);
  const hasTraits = traitMods.some((m) => m !== 0);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-lg border p-1.5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${RARITY_BG[rarity] || RARITY_BG.Common}`}
    >
      {quantity !== undefined && quantity > 0 && (
        <span className="absolute top-1 right-1 z-10 text-[9px] font-bold px-1 py-0.5 rounded bg-primary text-primary-foreground">
          ×{quantity}
        </span>
      )}

      <div className="h-12 w-full flex items-center justify-center bg-black/20 rounded overflow-hidden">
        {!imageUrls[urlIndex] || errored ? (
          <div
            className="w-10 h-10 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: fallbackSvg }}
          />
        ) : (
          <img
            src={imageUrls[urlIndex]}
            alt={wearable.name}
            className={`max-h-10 max-w-10 object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => {
              if (urlIndex < imageUrls.length - 1) {
                setLoaded(false);
                setUrlIndex((i) => i + 1);
              } else {
                setErrored(true);
              }
            }}
          />
        )}
        {!loaded && !!imageUrls[urlIndex] && !errored && (
          <div className="absolute inset-0 bg-muted/40 animate-pulse rounded" />
        )}
      </div>

      <div className="mt-1 text-center">
        <div className="text-[10px] font-semibold truncate leading-tight" title={wearable.name}>
          {wearable.name}
        </div>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <span className={`text-[9px] font-medium ${RARITY_COLORS[rarity] || "text-muted-foreground"}`}>
            {rarity}
          </span>
          <span className="text-[8px] text-muted-foreground">•</span>
          <span className="text-[9px] text-muted-foreground">{slotLabel}</span>
        </div>
      </div>

      {hasTraits && (
        <div className="mt-1 grid grid-cols-2 gap-0.5 text-[8px]">
          {["NRG", "AGG", "SPK", "BRN"].map((label, i) => {
            const mod = traitMods[i];
            if (mod === 0) return null;
            const isExtreme = Math.abs(mod) >= 3;
            return (
              <div
                key={label}
                className={`text-center px-0.5 py-[1px] rounded ${isExtreme ? "bg-purple-500/30 text-purple-300" : "bg-muted/50"}`}
              >
                {label} {formatTraitValue(mod)}
              </div>
            );
          })}
        </div>
      )}

      {!hasTraits && (
        <div className="mt-1 text-[8px] text-center text-muted-foreground">
          Visual only
        </div>
      )}

      {price && (
        <div className="mt-1 text-center">
          <span className="text-[9px] font-medium text-emerald-400">
            {parseFloat(price).toFixed(0)} GHST
          </span>
        </div>
      )}

      <div className="mt-0.5 text-center text-[8px] text-muted-foreground">
        #{wearable.id} • BRS +{wearable.rarityScoreModifier}
      </div>
    </div>
  );
}
