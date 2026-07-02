import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ExplorerWearable } from "@/lib/explorer/wearableTypes";
import { getSlotName, getWearableRarityTier } from "@/lib/explorer/wearableTypes";
import { formatTraitValue } from "@/lib/format";
import { AAVEGOTCHI_DIAMOND_BASE, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { AssetImage } from "./AssetImage";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { RecentSales } from "./RecentSales";
import { WornBy } from "./WornBy";
import { BuyButton } from "./BuyButton";
import { MakeOfferButton } from "./MakeOfferButton";

const RARITY_COLORS: Record<string, string> = {
  Godlike: "text-cyan-400", Mythical: "text-pink-400", Legendary: "text-yellow-400",
  Rare: "text-blue-400", Uncommon: "text-green-400", Common: "text-gray-400",
};

/** Read-only detail view for a wearable: info, trait modifiers, recent sales,
 *  and buy / make-offer actions. Mirrors the gotchi Details modal. */
export function WearableDetailModal({
  wearable, listing, onClose,
}: {
  wearable: ExplorerWearable;
  listing?: { listingId: string; minPriceWei: bigint; quantity: number };
  onClose: () => void;
}) {
  const rarity = wearable.rarity || getWearableRarityTier(wearable.rarityScoreModifier);
  const slots = wearable.slots || [];
  const slotLabel = slots.length > 0 ? getSlotName(slots[0]) : "—";
  const mods = wearable.traitModifiers.slice(0, 4);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-[min(460px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold truncate">{wearable.name} <span className="text-muted-foreground font-mono text-sm">#{wearable.id}</span></div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/50 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 flex items-center justify-center [&_img]:max-h-28 [&_img]:max-w-28 [&_img]:object-contain">
            <AssetImage candidates={getWearableIconUrlCandidates(wearable.id)} alt={wearable.name} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded bg-muted/30 py-1.5"><div className="text-muted-foreground">Rarity</div><div className={`font-semibold ${RARITY_COLORS[rarity] || ""}`}>{rarity}</div></div>
            <div className="rounded bg-muted/30 py-1.5"><div className="text-muted-foreground">Slot</div><div className="font-semibold">{slotLabel}</div></div>
            <div className="rounded bg-muted/30 py-1.5"><div className="text-muted-foreground">BRS</div><div className="font-semibold">+{wearable.rarityScoreModifier}</div></div>
          </div>

          {mods.some((m) => m !== 0) && (
            <div className="grid grid-cols-4 gap-1 text-center">
              {["NRG", "AGG", "SPK", "BRN"].map((t, i) => (
                <div key={t} className={`rounded-md py-1 ${mods[i] ? "bg-purple-500/20" : "bg-muted/30"}`}>
                  <div className="text-[9px] text-muted-foreground">{t}</div>
                  <div className="text-xs font-semibold tabular-nums">{mods[i] ? formatTraitValue(mods[i]) : "—"}</div>
                </div>
              ))}
            </div>
          )}

          {listing && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lowest listing</div>
              <div className="text-2xl font-bold text-emerald-500">{(Number(listing.minPriceWei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} GHST</div>
            </div>
          )}

          {listing && (
            <BuyButton listingId={listing.listingId} tokenId={String(wearable.id)} priceInWei={listing.minPriceWei.toString()} kind="erc1155" contractAddress={AAVEGOTCHI_DIAMOND_BASE} quantity={1} label={wearable.name}
              className="inline-flex items-center justify-center gap-1.5 h-10 w-full px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 text-sm font-semibold" />
          )}
          <MakeOfferButton kind="erc1155" category={BAAZAAR_CATEGORY.WEARABLE} tokenId={String(wearable.id)} contractAddress={AAVEGOTCHI_DIAMOND_BASE} label={wearable.name} />

          <WornBy wearableId={wearable.id} />

          <RecentSales kind="erc1155" tokenId={String(wearable.id)} />
        </div>
      </div>
    </div>,
    document.body
  );
}
