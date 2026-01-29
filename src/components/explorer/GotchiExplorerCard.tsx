import { memo, useMemo } from "react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { extractEyeData, getEyeShapeName } from "@/lib/explorer/traitFrequency";

type Props = {
  gotchi: ExplorerGotchi;
  onClick: () => void;
};

const rarityColors: Record<string, string> = {
  common: "bg-gray-500/10",
  uncommon: "bg-green-500/10",
  rare: "bg-blue-500/10",
  legendary: "bg-yellow-500/10",
  mythical: "bg-purple-500/10",
  godlike: "bg-pink-500/10",
};

const rarityBorders: Record<string, string> = {
  common: "border-gray-500/30",
  uncommon: "border-green-500/30",
  rare: "border-blue-500/30",
  legendary: "border-yellow-500/30",
  mythical: "border-purple-500/30",
  godlike: "border-pink-500/30",
};

const TRAIT_NAMES = ["NRG", "AGG", "SPK", "BRN"];

function TraitBar({ value, name }: { value: number; name: string }) {
  const isExtreme = value <= 10 || value >= 90;
  const percent = Math.min(100, Math.max(0, value));
  const isLow = value < 50;

  return (
    <div className="flex items-center gap-1">
      <span className={`text-[8px] w-6 ${isExtreme ? "text-purple-400 font-bold" : "text-muted-foreground"}`}>
        {name}
      </span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden relative">
        <div className="absolute inset-0 flex">
          <div className="w-1/2 border-r border-muted-foreground/20" />
        </div>
        <div
          className={`absolute h-full rounded-full ${isExtreme ? "bg-purple-500" : "bg-primary/70"}`}
          style={{
            left: isLow ? `${percent}%` : "50%",
            width: isLow ? `${50 - percent}%` : `${percent - 50}%`,
          }}
        />
      </div>
      <span className={`text-[8px] w-4 text-right ${isExtreme ? "text-purple-400 font-bold" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export const GotchiExplorerCard = memo(function GotchiExplorerCard({ gotchi, onClick }: Props) {
  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const eyeData = useMemo(() => extractEyeData(gotchi), [gotchi]);
  const wearableCount = gotchi.equippedWearables.filter((w) => w > 0).length;

  const svgUrl = `https://app.aavegotchi.com/images/aavegotchis/${gotchi.tokenId}.svg`;

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border ${rarityBorders[tier]} ${rarityColors[tier]} hover:ring-2 hover:ring-primary/50 transition-all overflow-hidden active:scale-[0.98]`}
    >
      <div className="flex items-center justify-between px-2 py-1 bg-background/50 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground font-mono">#{gotchi.tokenId}</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] bg-muted px-1 rounded">H{gotchi.hauntId}</span>
          {wearableCount > 0 && (
            <span className="text-[9px] bg-primary/20 text-primary px-1 rounded">{wearableCount}w</span>
          )}
        </div>
      </div>

      <div className="relative aspect-square p-2 flex items-center justify-center">
        <img
          src={svgUrl}
          alt={gotchi.name}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute bottom-1 right-1 text-[8px] bg-background/80 px-1 rounded text-muted-foreground">
          {getEyeShapeName(eyeData.shape)} {eyeData.comboRarity}
        </div>
      </div>

      <div className="px-2 py-1.5 bg-background/70 border-t border-border/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate flex-1 mr-1">{gotchi.name || "Unnamed"}</span>
          <span className="text-[10px] font-bold text-primary">{gotchi.withSetsRarityScore}</span>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mb-1.5">
          <span>Lv.{gotchi.level}</span>
          {gotchi.kinship !== undefined && <span>❤️{gotchi.kinship}</span>}
          {gotchi.listing && (
            <span className="text-green-500">
              {(parseFloat(gotchi.listing.priceInWei) / 1e18).toFixed(0)} GHST
            </span>
          )}
        </div>

        <div className="space-y-0.5">
          {traits.slice(0, 4).map((val, i) => (
            <TraitBar
              key={i}
              value={val}
              name={TRAIT_NAMES[i]}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
