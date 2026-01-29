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

export const GotchiExplorerCard = memo(function GotchiExplorerCard({ 
  gotchi, 
  onClick, 
  eyeRarities,
  frequencyLoading 
}: Props) {
  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const wearableCount = gotchi.equippedWearables.filter((w) => w > 0).length;
  const [showPopover, setShowPopover] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const eyeShape = traits.length > 4 ? traits[4] : 0;
  const eyeColor = traits.length > 5 ? traits[5] : 0;

  const comboRarityText = eyeRarities?.combo 
    ? `1/${eyeRarities.combo}` 
    : frequencyLoading ? "..." : "?";

  const isUnique = eyeRarities?.combo === 1;

  const handlePopoverToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover(!showPopover);
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`cursor-pointer rounded-xl border ${rarityBorders[tier]} ${rarityColors[tier]} hover:ring-2 hover:ring-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 overflow-hidden active:scale-[0.98] backdrop-blur-sm`}
    >
      <div className="flex items-center justify-between px-2 py-1 bg-background/50 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground font-mono">#{gotchi.tokenId}</span>
        <span className="text-[9px] bg-muted px-1 rounded">H{gotchi.hauntId}</span>
      </div>

      <div className="relative aspect-square p-2 flex items-center justify-center bg-gradient-to-b from-transparent to-background/30">
        {wearableCount > 0 && (
          <div className={`absolute inset-2 transition-opacity duration-300 ${isHovered ? "opacity-0" : "opacity-100"}`}>
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
        <div className={`${wearableCount > 0 ? "absolute inset-2" : ""} transition-opacity duration-300 ${wearableCount > 0 && !isHovered ? "opacity-0" : "opacity-100"}`}>
          <GotchiSvg
            gotchiId={gotchi.tokenId}
            hauntId={gotchi.hauntId}
            collateral={gotchi.collateral}
            numericTraits={gotchi.numericTraits as number[]}
            equippedWearables={wearableCount > 0 ? NAKED_WEARABLES : gotchi.equippedWearables as number[]}
            className="w-full h-full"
          />
        </div>
        
        <button
          onClick={handlePopoverToggle}
          className={`absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 transition-colors ${
            isUnique 
              ? "bg-pink-500/90 text-white font-bold" 
              : "bg-background/90 text-foreground border border-border/50 hover:bg-muted"
          }`}
        >
          <span>👁</span>
          <span>{comboRarityText}</span>
        </button>

        {showPopover && (
          <div 
            className="absolute bottom-8 right-0 z-20 bg-background border border-border rounded-lg shadow-lg p-2 min-w-[140px] text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold mb-1.5 text-center border-b pb-1">Eye Trait Rarity</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Combo:</span>
                <span className={`font-mono ${isUnique ? "text-pink-500 font-bold" : ""}`}>
                  {eyeRarities?.combo ? `1/${eyeRarities.combo}` : "..."}
                  {isUnique && " ⭐"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shape ({eyeShape}):</span>
                <span className="font-mono">{eyeRarities?.shape ? `1/${eyeRarities.shape}` : "..."}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Color ({eyeColor}):</span>
                <span className="font-mono">{eyeRarities?.color ? `1/${eyeRarities.color}` : "..."}</span>
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-2 pt-1 border-t">
              1 of N in Haunt {gotchi.hauntId}
            </div>
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 bg-background/70 border-t border-border/30">
        <div className="text-xs font-medium truncate mb-0.5">{gotchi.name || "Unnamed"}</div>
        <div className="text-[10px] text-muted-foreground mb-1">
          Rarity Score {gotchi.withSetsRarityScore} ({gotchi.baseRarityScore})
        </div>

        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mb-1">
          <span>Lv.{gotchi.level}</span>
          {gotchi.kinship !== undefined && <span>❤️{gotchi.kinship}</span>}
          {gotchi.listing && (
            <span className="text-green-500">
              {(parseFloat(gotchi.listing.priceInWei) / 1e18).toFixed(0)} GHST
            </span>
          )}
        </div>
        {gotchi.equippedSetName && (
          <div className="text-[9px] text-purple-400 mb-1 truncate">
            Set: {gotchi.equippedSetName}
          </div>
        )}

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
