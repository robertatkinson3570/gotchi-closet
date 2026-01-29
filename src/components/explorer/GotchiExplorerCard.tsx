import { memo, useState } from "react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";

type EyeRarities = {
  shape: number | null;
  color: number | null;
  combo: number | null;
};

type Props = {
  gotchi: ExplorerGotchi;
  onClick: () => void;
  eyeRarities?: EyeRarities;
  frequencyLoading?: boolean;
};

const NAKED_WEARABLES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: "bg-gray-500/5", border: "border-gray-400/20", text: "text-gray-500" },
  uncommon: { bg: "bg-green-500/5", border: "border-green-400/20", text: "text-green-500" },
  rare: { bg: "bg-blue-500/5", border: "border-blue-400/20", text: "text-blue-500" },
  legendary: { bg: "bg-orange-500/5", border: "border-orange-400/20", text: "text-orange-500" },
  mythical: { bg: "bg-purple-500/5", border: "border-purple-400/20", text: "text-purple-500" },
  godlike: { bg: "bg-pink-500/5", border: "border-pink-400/20", text: "text-pink-500" },
};

export const GotchiExplorerCard = memo(function GotchiExplorerCard({ 
  gotchi, 
  onClick, 
  eyeRarities,
  frequencyLoading 
}: Props) {
  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const colors = tierColors[tier] || tierColors.common;
  const wearableCount = gotchi.equippedWearables.filter((w) => w > 0).length;
  const [isHovered, setIsHovered] = useState(false);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;

  const comboRarityText = eyeRarities?.combo 
    ? `1/${eyeRarities.combo}` 
    : frequencyLoading ? "..." : null;

  const isUnique = eyeRarities?.combo === 1;

  const priceGhst = gotchi.listing 
    ? parseFloat(gotchi.listing.priceInWei) / 1e18 
    : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`cursor-pointer rounded-lg border ${colors.border} ${colors.bg} hover:ring-1 hover:ring-primary/40 transition-all duration-150 overflow-hidden active:scale-[0.98]`}
    >
      <div className="relative aspect-square flex items-center justify-center bg-gradient-to-b from-transparent to-background/20">
        {wearableCount > 0 && (
          <div className={`absolute inset-1 transition-opacity duration-200 ${isHovered ? "opacity-0" : "opacity-100"}`}>
            <GotchiSvg
              gotchiId={gotchi.tokenId}
              hauntId={gotchi.hauntId}
              collateral={gotchi.collateral}
              numericTraits={gotchi.numericTraits as number[]}
              equippedWearables={gotchi.equippedWearables as number[]}
              className="w-full h-full"
            />
          </div>
        )}
        <div className={`${wearableCount > 0 ? "absolute inset-1" : ""} transition-opacity duration-200 ${wearableCount > 0 && !isHovered ? "opacity-0" : "opacity-100"}`}>
          <GotchiSvg
            gotchiId={gotchi.tokenId}
            hauntId={gotchi.hauntId}
            collateral={gotchi.collateral}
            numericTraits={gotchi.numericTraits as number[]}
            equippedWearables={wearableCount > 0 ? NAKED_WEARABLES : gotchi.equippedWearables as number[]}
            className="w-full h-full"
          />
        </div>
        
        {comboRarityText && (
          <div
            className={`absolute bottom-0.5 right-0.5 text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 ${
              isUnique 
                ? "bg-pink-500 text-white font-semibold" 
                : "bg-background/80 text-muted-foreground"
            }`}
          >
            <span className="opacity-70">👁</span>
            <span>{comboRarityText}</span>
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium truncate flex-1">{gotchi.name || "Unnamed"}</span>
          <span className="text-[9px] text-muted-foreground font-mono shrink-0">#{gotchi.tokenId}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className={`font-semibold ${colors.text}`}>{gotchi.withSetsRarityScore} BRS</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>H{gotchi.hauntId}</span>
            <span>Lv{gotchi.level}</span>
            {gotchi.kinship !== undefined && <span>❤️{gotchi.kinship}</span>}
          </div>
        </div>

        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          {traits.map((val: number, i: number) => (
            <span key={i} className={val <= 10 || val >= 90 ? "text-purple-400 font-medium" : ""}>
              {val}
            </span>
          ))}
        </div>

        {priceGhst !== null && (
          <div className="flex items-center justify-between pt-0.5 border-t border-border/30">
            <span className="text-[9px] text-muted-foreground">Price</span>
            <span className="text-[10px] text-green-500 font-medium">
              {priceGhst.toLocaleString(undefined, { maximumFractionDigits: 0 })} GHST
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
