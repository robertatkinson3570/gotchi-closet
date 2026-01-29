import { useState } from "react";
import { Button } from "@/ui/button";
import { X, ChevronDown, ChevronUp, Copy } from "lucide-react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { extractEyeData, getEyeShapeName, getEyeColorName } from "@/lib/explorer/traitFrequency";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";

function getWearableImageUrl(id: number): string {
  return `https://app.aavegotchi.com/images/items/${id}.svg`;
}

type Props = {
  gotchi: ExplorerGotchi | null;
  onClose: () => void;
  onAddToDress?: (gotchi: ExplorerGotchi) => void;
};

const TRAIT_NAMES = ["NRG", "AGG", "SPK", "BRN"];
const TRAIT_LABELS = ["Energy", "Aggression", "Spookiness", "Brain Size"];

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${highlight ? "font-bold text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  const isExtreme = value <= 10 || value >= 90;
  const percent = Math.min(100, Math.max(0, value));
  const isLow = value < 50;

  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-mono ${isExtreme ? "text-purple-400 font-bold" : ""}`}>
          {value}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden relative">
        <div className="absolute inset-0 flex">
          <div className="w-1/2 border-r border-muted-foreground/30" />
        </div>
        <div
          className={`absolute h-full rounded-full transition-all ${isExtreme ? "bg-purple-500" : "bg-primary"}`}
          style={{
            left: isLow ? `${percent}%` : "50%",
            width: isLow ? `${50 - percent}%` : `${percent - 50}%`,
          }}
        />
      </div>
    </div>
  );
}

export function GotchiDetailDrawer({ gotchi, onClose, onAddToDress }: Props) {
  if (!gotchi) return null;

  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const eyeData = extractEyeData(gotchi);
  const equippedWearableIds = gotchi.equippedWearables.filter((w) => w > 0);
  const wearableCount = equippedWearableIds.length;

  const copyTokenId = () => {
    navigator.clipboard.writeText(gotchi.tokenId);
  };

  return (
    <div className="fixed inset-0 z-50 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-96 bg-background border-l shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-semibold truncate">{gotchi.name || "Unnamed"}</h2>
          <span className="text-xs text-muted-foreground font-mono shrink-0">#{gotchi.tokenId}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copyTokenId}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 bg-muted/20 border-b">
          <div className="relative aspect-square max-w-48 mx-auto">
            <GotchiSvg
              gotchiId={gotchi.tokenId}
              hauntId={gotchi.hauntId}
              collateral={gotchi.collateral}
              numericTraits={gotchi.numericTraits}
              equippedWearables={gotchi.equippedWearables}
              className="w-full h-full"
            />
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              tier === "godlike" ? "bg-pink-500/20 text-pink-400" :
              tier === "mythical" ? "bg-purple-500/20 text-purple-400" :
              tier === "legendary" ? "bg-yellow-500/20 text-yellow-400" :
              tier === "rare" ? "bg-blue-500/20 text-blue-400" :
              tier === "uncommon" ? "bg-green-500/20 text-green-400" :
              "bg-gray-500/20 text-gray-400"
            }`}>
              {tier}
            </span>
            <span className="text-lg font-bold">{gotchi.withSetsRarityScore} BRS</span>
          </div>
        </div>

        <Section title="Identity">
          <StatRow label="Token ID" value={gotchi.tokenId} />
          <StatRow label="Haunt" value={gotchi.hauntId} />
          <StatRow label="Level" value={gotchi.level} />
          {gotchi.kinship !== undefined && <StatRow label="Kinship" value={gotchi.kinship} />}
          {gotchi.experience !== undefined && <StatRow label="XP" value={gotchi.experience} />}
          <StatRow label="Collateral" value={gotchi.collateral.slice(0, 10) + "..."} />
        </Section>

        {gotchi.listing && (
          <Section title="Market">
            <StatRow
              label="Listed Price"
              value={`${(parseFloat(gotchi.listing.priceInWei) / 1e18).toFixed(2)} GHST`}
              highlight
            />
          </Section>
        )}

        <Section title="Traits">
          {traits.slice(0, 4).map((val, i) => (
            <TraitBar
              key={i}
              label={`${TRAIT_NAMES[i]} (${TRAIT_LABELS[i]})`}
              value={val}
            />
          ))}
        </Section>

        <Section title="Eye Traits">
          <StatRow label="Eye Shape" value={getEyeShapeName(eyeData.shape)} />
          <StatRow label="Eye Color" value={getEyeColorName(eyeData.color)} />
          <StatRow label="Shape Rarity" value={eyeData.shapeRarity} />
          <StatRow label="Color Rarity" value={eyeData.colorRarity} />
          <StatRow label="Combo Rarity" value={eyeData.comboRarity} highlight />
        </Section>

        <Section title="Wearables" defaultOpen={false}>
          <StatRow label="Equipped Count" value={wearableCount} />
          {equippedWearableIds.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {equippedWearableIds.map((id, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <img
                    src={getWearableImageUrl(id)}
                    alt={`Wearable #${id}`}
                    className="w-10 h-10 object-contain bg-muted rounded p-1"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://wiki.aavegotchi.com/wearables/${id}.svg`;
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground">#{id}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">No wearables equipped</div>
          )}
        </Section>
      </div>

      <div className="flex items-center gap-2 p-3 border-t bg-background">
        {onAddToDress && (
          <Button variant="default" className="flex-1" onClick={() => onAddToDress(gotchi)}>
            Add to Dress
          </Button>
        )}
      </div>
    </div>
  );
}
