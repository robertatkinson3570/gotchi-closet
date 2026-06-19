import { memo, useState, useRef, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { GotchiInfoOverlay } from "./GotchiInfoOverlay";
import { BuyButton } from "./BuyButton";
import { MakeOfferButton } from "./MakeOfferButton";
import { AAVEGOTCHI_DIAMOND_BASE, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { Info } from "lucide-react";
import { prefetchGotchiSvg } from "@/components/gotchi/GotchiSvg";
import { isGotchiRenderReady } from "@/lib/explorer/gotchiReady";
import { SoulBadge } from "@/components/soul/SoulBadge";

type EyeRarities = {
  shape: number | null;
  color: number | null;
  combo: number | null;
};

type Props = {
  gotchi: ExplorerGotchi;
  eyeRarities?: EyeRarities;
  frequencyLoading?: boolean;
  // When provided (owned view), shows a footer button that opens the gotchi
  // manage modal (or toggles selection in bulk-list mode). rentalBadge marks
  // "Rented out" / "Borrowed".
  onManage?: () => void;
  manageLabel?: string;
  selected?: boolean;
  rentalBadge?: string | null;
  // Soul seal status on Base, shown on every gotchi card. null/undefined hides it.
  sealStatus?: "sealed" | "unsealed" | null;
  // Owner (non-borrower) only: clicking the "unsealed" badge opens the seal flow.
  onSeal?: () => void;
  // Buy-side only: show a "Make Offer" (buy order) action. Set by the browse
  // grid, not by auction/lending views.
  offerable?: boolean;
};

const NAKED_WEARABLES: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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
  frequencyLoading,
  onManage,
  manageLabel,
  selected,
  rentalBadge,
  sealStatus,
  onSeal,
  offerable,
}: Props) {
  const { address } = useAccount();
  const isOwnListing = !!gotchi.listing?.seller && !!address && gotchi.listing.seller.toLowerCase() === address.toLowerCase();
  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const colors = tierColors[tier] || tierColors.common;
  const wearableCount = gotchi.equippedWearables.filter((w) => w > 0).length;
  const [imageHovered, setImageHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [imageBadgeHovered, setImageBadgeHovered] = useState(false);
  const [infoBadgeHovered, setInfoBadgeHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const baseRarity = gotchi.baseRarityScore || null;
  const paintedKeyRef = useRef<string | null>(null);

  // Check if gotchi is ready for rendering
  const isReady = isGotchiRenderReady(gotchi);

  // Use normalized arrays directly from gotchi (already normalized in transformGotchi)
  // Memoize to prevent reference changes
  const stableEquippedWearables = useMemo((): number[] => {
    if (!Array.isArray(gotchi.equippedWearables) || gotchi.equippedWearables.length !== 16) {
      return [...NAKED_WEARABLES]; // Return a copy to ensure mutability
    }
    return gotchi.equippedWearables;
  }, [
    // Use stringified array as dependency to prevent re-computation on reference changes
    Array.isArray(gotchi.equippedWearables) ? gotchi.equippedWearables.join(",") : ""
  ]);

  const stableNumericTraits = useMemo(() => {
    if (!Array.isArray(gotchi.numericTraits) || gotchi.numericTraits.length !== 6) {
      return [0, 0, 0, 0, 0, 0];
    }
    return gotchi.numericTraits;
  }, [
    // Use stringified array as dependency to prevent re-computation on reference changes
    Array.isArray(gotchi.numericTraits) ? gotchi.numericTraits.join(",") : ""
  ]);

  // Compute active wearables based on hover state
  const activeWearables = useMemo((): number[] => {
    return imageHovered ? [...NAKED_WEARABLES] : stableEquippedWearables; // Return a copy for hover state
  }, [imageHovered, stableEquippedWearables]);

  // Prewarm both dressed and naked SVGs on mount (only if ready)
  useEffect(() => {
    if (!isReady) return;

    const prewarmDressed = () => {
      if (wearableCount > 0) {
        prefetchGotchiSvg({
          gotchiId: gotchi.tokenId,
          hauntId: gotchi.hauntId,
          collateral: gotchi.collateral,
          numericTraits: stableNumericTraits,
          equippedWearables: stableEquippedWearables,
          mode: "preview",
        });
      }
    };

    const prewarmNaked = () => {
      prefetchGotchiSvg({
        gotchiId: gotchi.tokenId,
        hauntId: gotchi.hauntId,
        collateral: gotchi.collateral,
        numericTraits: stableNumericTraits,
        equippedWearables: NAKED_WEARABLES,
        mode: "preview",
      });
    };

    // Prewarm both states
    prewarmNaked();
    if (wearableCount > 0) {
      prewarmDressed();
    }
  }, [isReady, gotchi.tokenId, gotchi.hauntId, gotchi.collateral, stableNumericTraits, stableEquippedWearables, wearableCount]);

  // Track requestKey stability (dev-only warning)
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && isReady) {
      // Compute current requestKey for dressed state
      const currentKey = [
        gotchi.tokenId || "",
        gotchi.hauntId ?? "",
        gotchi.collateral || "",
        stableNumericTraits.join(","),
        stableEquippedWearables.join("-"),
        "preview",
      ].join("|");

      if (paintedKeyRef.current && !imageHovered && paintedKeyRef.current !== currentKey) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "🚨 Explorer requestKey changed post-paint (not hovered)",
            {
              gotchiId: gotchi.tokenId,
              previousKey: paintedKeyRef.current,
              currentKey,
            }
          );
        }
      }

      // Update painted key when not hovered (dressed state)
      if (!imageHovered) {
        paintedKeyRef.current = currentKey;
      }
    }
  }, [isReady, gotchi.tokenId, gotchi.hauntId, gotchi.collateral, stableNumericTraits, stableEquippedWearables, imageHovered]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!showDetails || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowDetails(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDetails, isMobile]);

  const comboRarityText = eyeRarities?.combo 
    ? `1/${eyeRarities.combo}` 
    : frequencyLoading ? "..." : null;

  const isUnique = eyeRarities?.combo === 1;

  const priceGhst = gotchi.listing 
    ? parseFloat(gotchi.listing.priceInWei) / 1e18 
    : null;

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails(!showDetails);
  };

  const eyeExplainText = eyeRarities?.combo 
    ? eyeRarities.combo === 1 
      ? "Unique eye combo in this haunt!" 
      : `Only ${eyeRarities.combo} gotchis in H${gotchi.hauntId} share this eye combo`
    : null;

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border ${selected ? "border-emerald-500 ring-2 ring-emerald-500/50" : colors.border} ${colors.bg} hover:ring-1 hover:ring-primary/40 transition-all duration-150 active:scale-[0.98] relative overflow-hidden`}
    >
      <div 
        className="relative aspect-square flex items-center justify-center"
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        {/* READY GATE: Only mount GotchiSvg when gotchi is ready */}
        {isReady ? (
          <GotchiSvg
            gotchiId={gotchi.tokenId}
            hauntId={gotchi.hauntId}
            collateral={gotchi.collateral}
            numericTraits={stableNumericTraits}
            equippedWearables={activeWearables}
            mode="preview"
            className="w-full h-full"
            testId={`explorer-gotchi-${gotchi.tokenId}`}
            useBlobUrl={true} // Use blob URL to prevent DOM repaint flash
          />
        ) : (
          <div 
            className="w-full h-full bg-muted/50 animate-pulse"
            data-testid={`explorer-gotchi-${gotchi.tokenId}-skeleton`}
          />
        )}
        
        {comboRarityText && (
          <div
            className={`absolute bottom-0.5 right-0.5 text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 cursor-help ${
              isUnique 
                ? "bg-pink-500 text-white font-semibold" 
                : "bg-background/80 text-muted-foreground"
            }`}
            onMouseEnter={() => setImageBadgeHovered(true)}
            onMouseLeave={() => setImageBadgeHovered(false)}
          >
            <span className="opacity-70">👁</span>
            <span>{comboRarityText}</span>
            {imageBadgeHovered && eyeExplainText && (
              <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-foreground text-background text-[9px] rounded max-w-[140px] text-center leading-tight z-20 shadow-lg pointer-events-none">
                {eyeExplainText}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold truncate flex-1">{gotchi.name || "Unnamed"}</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-mono shrink-0">#{gotchi.tokenId}</span>
            <button
              onClick={handleInfoClick}
              className={`p-0.5 rounded transition-colors ${showDetails ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
              title="Show details"
            >
              <Info className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span className="bg-muted/50 px-1 rounded">H{gotchi.hauntId}</span>
          {eyeRarities?.combo && eyeRarities.combo <= 10 && (
            <div 
              className="relative"
              onMouseEnter={() => setInfoBadgeHovered(true)}
              onMouseLeave={() => setInfoBadgeHovered(false)}
            >
              <span className="bg-purple-500/20 text-purple-400 px-1 rounded font-medium cursor-help">
                {eyeRarities.combo === 1 ? "UNIQUE" : `${eyeRarities.combo}X`} 👁
              </span>
              {infoBadgeHovered && eyeExplainText && (
                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-foreground text-background text-[9px] rounded max-w-[140px] text-center leading-tight z-20 shadow-lg pointer-events-none">
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
            <SoulBadge kinship={gotchi.kinship} level={gotchi.level} createdAt={gotchi.createdAt} size="sm" />
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
          <div className="pt-1 border-t border-border/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">PRICE</span>
              <span className="text-[10px] text-green-500 font-semibold">
                {priceGhst.toLocaleString(undefined, { maximumFractionDigits: 0 })} GHST
              </span>
            </div>
            {gotchi.listing?.id && (
              isOwnListing ? (
                <span className="inline-flex items-center h-7 px-2 rounded-md bg-muted/60 text-[10px] font-semibold text-muted-foreground">Your listing</span>
              ) : (
                <BuyButton
                  listingId={gotchi.listing.id}
                  tokenId={gotchi.tokenId}
                  priceInWei={gotchi.listing.priceInWei}
                  kind="erc721"
                  contractAddress={AAVEGOTCHI_DIAMOND_BASE}
                  label={`#${gotchi.tokenId}`}
                />
              )
            )}
          </div>
        )}

        {/* Buy-mode offer: any gotchi you don't own/list can receive a buy order. */}
        {offerable && !isOwnListing && (
          <div className="pt-1" onClick={(e) => e.stopPropagation()}>
            <MakeOfferButton
              kind="erc721"
              category={BAAZAAR_CATEGORY.AAVEGOTCHI}
              tokenId={gotchi.tokenId}
              contractAddress={AAVEGOTCHI_DIAMOND_BASE}
              label={gotchi.name || `#${gotchi.tokenId}`}
              compact
            />
          </div>
        )}
      </div>

      {onManage && (
        <button
          onClick={onManage}
          className={`w-full h-7 text-[11px] font-semibold border-t ${selected ? "bg-emerald-600 text-white border-emerald-600" : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"}`}
        >
          {selected ? "✓ Selected" : (manageLabel ?? "Manage")}
        </button>
      )}

      {rentalBadge && (
        <span className="absolute top-1 left-1 z-10 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/90 text-white shadow">{rentalBadge}</span>
      )}

      {/* Soul seal status (every card). Sealed = quiet emerald. Unsealed =
          standout, clickable violet pill for the owner (opens the seal flow);
          a faint informational chip for everyone else. */}
      {sealStatus === "sealed" && (onSeal ? (
        <button
          onClick={(e) => { e.stopPropagation(); onSeal(); }}
          className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/90 text-white shadow ring-1 ring-emerald-300/50 hover:bg-emerald-400 transition-colors"
          title="Soul sealed on Base — view certificate"
        >
          🔏 Sealed
        </button>
      ) : (
        <span className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/90 text-white shadow" title="Soul sealed on Base">
          🔏 Sealed
        </span>
      ))}
      {sealStatus === "unsealed" && (onSeal ? (
        <button
          onClick={(e) => { e.stopPropagation(); onSeal(); }}
          className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-600 text-white shadow ring-1 ring-violet-300/70 hover:bg-violet-500 transition-colors"
          title="This soul isn't sealed on Base yet — tap to seal it"
        >
          🔏 Seal soul
        </button>
      ) : (
        <span className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/45 text-white/70 shadow" title="Soul not sealed on Base">
          Unsealed
        </span>
      ))}

      {showDetails && (
        <GotchiInfoOverlay gotchi={gotchi} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
});
