import { memo, useState, useRef, useEffect } from "react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { GotchiInfoOverlay } from "./GotchiInfoOverlay";
import { Info } from "lucide-react";

type EyeRarities = {
  shape: number | null;
  color: number | null;
  combo: number | null;
};

type Props = {
  gotchi: ExplorerGotchi;
  eyeRarities?: EyeRarities;
  frequencyLoading?: boolean;
};

const NAKED_WEARABLES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const TRAIT_ABBR = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

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
  eyeRarities,
  frequencyLoading 
}: Props) {
  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const colors = tierColors[tier] || tierColors.common;
  const wearableCount = gotchi.equippedWearables.filter((w) => w > 0).length;
  const [imageHovered, setImageHovered] = useState(false);
  const [infoHovered, setInfoHovered] = useState(false);
  const [eyeBadgeHovered, setEyeBadgeHovered] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const baseRarity = gotchi.baseRarityScore || null;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!mobileInfoOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setMobileInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileInfoOpen]);

  const comboRarityText = eyeRarities?.combo 
    ? `1/${eyeRarities.combo}` 
    : frequencyLoading ? "..." : null;

  const isUnique = eyeRarities?.combo === 1;

  const priceGhst = gotchi.listing 
    ? parseFloat(gotchi.listing.priceInWei) / 1e18 
    : null;

  const showOverlay = isMobile ? mobileInfoOpen : infoHovered;

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) {
      setMobileInfoOpen(!mobileInfoOpen);
    }
  };

  const eyeExplainText = eyeRarities?.combo 
    ? eyeRarities.combo === 1 
      ? "Unique eye combo in this haunt!" 
      : `Only ${eyeRarities.combo} gotchis in H${gotchi.hauntId} share this eye combo`
    : null;

  return (
    <div
      className={`rounded-lg border ${colors.border} ${colors.bg} hover:ring-1 hover:ring-primary/40 transition-all duration-150 active:scale-[0.98] relative`}
    >
      <div 
        className="relative aspect-square flex items-center justify-center bg-gradient-to-b from-transparent to-background/20 overflow-hidden rounded-t-lg"
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        {wearableCount > 0 && (
          <div className={`absolute inset-1 transition-opacity duration-200 ${imageHovered ? "opacity-0" : "opacity-100"}`}>
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
        <div className={`${wearableCount > 0 ? "absolute inset-1" : ""} transition-opacity duration-200 ${wearableCount > 0 && !imageHovered ? "opacity-0" : "opacity-100"}`}>
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
            className={`absolute bottom-0.5 right-0.5 text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 cursor-help ${
              isUnique 
                ? "bg-pink-500 text-white font-semibold" 
                : "bg-background/80 text-muted-foreground"
            }`}
            onMouseEnter={() => setEyeBadgeHovered(true)}
            onMouseLeave={() => setEyeBadgeHovered(false)}
          >
            <span className="opacity-70">👁</span>
            <span>{comboRarityText}</span>
            {eyeBadgeHovered && eyeExplainText && (
              <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-foreground text-background text-[9px] rounded whitespace-nowrap z-20 shadow-lg">
                {eyeExplainText}
              </div>
            )}
          </div>
        )}
      </div>

      <div 
        ref={infoRef}
        className="px-2 py-1.5 space-y-1 relative"
        onMouseEnter={() => !isMobile && setInfoHovered(true)}
        onMouseLeave={() => !isMobile && setInfoHovered(false)}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold truncate flex-1">{gotchi.name || "Unnamed"}</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-mono shrink-0">#{gotchi.tokenId}</span>
            <button
              onClick={handleInfoClick}
              className="md:hidden p-0.5 rounded hover:bg-muted/50 transition-colors"
              title="Show details"
            >
              <Info className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span className="bg-muted/50 px-1 rounded">H{gotchi.hauntId}</span>
          {eyeRarities?.combo && eyeRarities.combo <= 10 && (
            <div 
              className="relative"
              onMouseEnter={() => setEyeBadgeHovered(true)}
              onMouseLeave={() => setEyeBadgeHovered(false)}
            >
              <span className="bg-purple-500/20 text-purple-400 px-1 rounded font-medium cursor-help">
                {eyeRarities.combo === 1 ? "UNIQUE" : `${eyeRarities.combo}X`} 👁
              </span>
              {eyeBadgeHovered && eyeExplainText && (
                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-foreground text-background text-[9px] rounded whitespace-nowrap z-20 shadow-lg">
                  {eyeExplainText}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">RAR</span>
            <span className={`font-semibold ${colors.text}`}>{gotchi.withSetsRarityScore}</span>
            {baseRarity && baseRarity !== gotchi.withSetsRarityScore && (
              <span className="text-muted-foreground/60">({baseRarity})</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>KIN <span className="text-foreground">{gotchi.kinship || 0}</span></span>
            <span>LVL <span className="text-foreground">{gotchi.level}</span></span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px]">
          {traits.slice(0, 6).map((val: number, i: number) => {
            const isExtreme = val <= 10 || val >= 90;
            return (
              <div key={i} className="flex items-center justify-between">
                <span className="text-muted-foreground">{TRAIT_ABBR[i]}</span>
                <span className={isExtreme ? "text-purple-400 font-semibold" : "text-foreground"}>
                  {val}
                </span>
              </div>
            );
          })}
        </div>

        {priceGhst !== null && (
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <span className="text-[9px] text-muted-foreground">PRICE</span>
            <span className="text-[10px] text-green-500 font-semibold">
              {priceGhst.toLocaleString(undefined, { maximumFractionDigits: 0 })} GHST
            </span>
          </div>
        )}

        {showOverlay && (
          <GotchiInfoOverlay gotchi={gotchi} position="below" />
        )}
      </div>
    </div>
  );
});
