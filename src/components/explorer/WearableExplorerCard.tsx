import { useState, useEffect } from "react";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { placeholderSvg } from "@/lib/placeholderSvg";
import { formatTraitValue } from "@/lib/format";
import { getSlotName, getWearableRarityTier } from "@/lib/explorer/wearableTypes";
import type { ExplorerWearable } from "@/lib/explorer/wearableTypes";
import { BuyButton } from "./BuyButton";
import { MakeOfferButton } from "./MakeOfferButton";
import { InlineSvg } from "./InlineSvg";
import { AAVEGOTCHI_DIAMOND_BASE, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { RARITY_COLORS, RARITY_BG } from "@/lib/explorer/itemMeta";
import { useView3D } from "@/app/View3DProvider";
import { ModelViewer3D } from "@/components/viewer3d/ModelViewer3D";
import { hasWearable3D, wearable3dGlbUrl } from "@/lib/gotchi3d";

interface WearableExplorerCardProps {
  wearable: ExplorerWearable;
  quantity?: number;
  price?: string;
  /** Cheapest open listing for one-click buy (Baazaar mode). */
  listing?: { listingId: string; minPriceWei: bigint; quantity: number };
  /** When false (owned/"mine" scope), hide the Make Offer button — you can't offer on your own items. */
  canOffer?: boolean;
  onClick?: () => void;
}

export function WearableExplorerCard({
  wearable,
  quantity,
  price,
  listing,
  canOffer = true,
  onClick,
}: WearableExplorerCardProps) {
  const imageUrls = getWearableIconUrlCandidates(wearable.id);
  const [urlIndex, setUrlIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const fallbackSvg = placeholderSvg(String(wearable.id), wearable.name);
  // Site-wide 3D toggle: cards with a display model render it in place
  // (viewport-lazy, ~200-550 KB each); the rest keep their 2D icon. Models
  // sit still until the rotate button is pressed.
  const { enabled: view3d } = useView3D();
  const [threeDFailed, setThreeDFailed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const show3d = view3d && !threeDFailed && hasWearable3D(wearable.id);

  useEffect(() => {
    setUrlIndex(0);
    setLoaded(false);
    setErrored(false);
  }, [wearable.id]);

  const rarity = wearable.rarity || getWearableRarityTier(wearable.rarityScoreModifier);
  const slots = wearable.slots || [];
  const slotLabel = slots.length > 0 ? getSlotName(slots[0]) : "None";

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

      <div className={`relative ${show3d ? "h-20" : "h-12"} w-full flex items-center justify-center bg-black/20 rounded overflow-hidden`}>
        {show3d && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setRotating((v) => !v); }}
            title={rotating ? "Stop rotating" : "Rotate 360°"}
            aria-label={rotating ? "Stop rotating" : "Rotate 360°"}
            className={`absolute bottom-1 left-1 z-10 text-[11px] leading-none px-1 py-0.5 rounded border transition-colors ${
              rotating ? "bg-primary/25 text-primary border-primary/50" : "bg-black/50 text-primary/90 border-primary/40 hover:bg-primary/20"
            }`}
          >
            ⟳
          </button>
        )}
        {show3d ? (
          <ModelViewer3D
            src={wearable3dGlbUrl(wearable.id)}
            alt={`${wearable.name} in 3D`}
            className="w-full h-full"
            onLoadError={() => setThreeDFailed(true)}
            disableZoom
            autoRotate={rotating}
          />
        ) : !imageUrls[urlIndex] || errored ? (
          <InlineSvg
            svg={fallbackSvg}
            className="w-10 h-10 [&>svg]:w-full [&>svg]:h-full"
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
        {!show3d && !loaded && !!imageUrls[urlIndex] && !errored && (
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

      {listing && (
        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
          <BuyButton
            listingId={listing.listingId}
            tokenId={String(wearable.id)}
            priceInWei={listing.minPriceWei.toString()}
            kind="erc1155"
            contractAddress={AAVEGOTCHI_DIAMOND_BASE}
            quantity={1}
            label={wearable.name}
            className="inline-flex items-center justify-center gap-1 h-6 w-full px-1 rounded bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 text-[9px] font-semibold"
          />
        </div>
      )}

      {canOffer && (
        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
          <MakeOfferButton
            kind="erc1155"
            category={BAAZAAR_CATEGORY.WEARABLE}
            tokenId={String(wearable.id)}
            contractAddress={AAVEGOTCHI_DIAMOND_BASE}
            label={wearable.name}
            compact
          />
        </div>
      )}

      <div className="mt-0.5 text-center text-[8px] text-muted-foreground">
        #{wearable.id} • BRS +{wearable.rarityScoreModifier}
      </div>
    </div>
  );
}
