import { useState } from "react";
import { Button } from "@/ui/button";
import { X, Copy, Check, ChevronDown } from "lucide-react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { extractEyeData, getEyeShapeName, getEyeColorName } from "@/lib/explorer/traitFrequency";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { useGotchiSalesHistory } from "@/hooks/useGotchiSalesHistory";
import wearablesData from "../../../data/wearables.json";

const NAKED_WEARABLES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function getWearableImageUrl(id: number): string {
  return `https://app.aavegotchi.com/images/items/${id}.svg`;
}

const wearableNameMap = new Map<number, string>(
  (wearablesData as { id: number; name: string }[]).map((w) => [w.id, w.name])
);

function getWearableName(id: number): string {
  return wearableNameMap.get(id) || `#${id}`;
}

const COLLATERAL_NAMES: Record<string, string> = {
  "0x20d3922b4a1a8560e1ac99fba4fade0c849e2142": "maWETH",
  "0x823cd4264c1b951c9209ad0deaea9988fe8429bf": "maAAVE",
  "0x98ea609569bd25119707451ef982b90e3eb719cd": "maLINK",
  "0xe0b22e0037b130a9f56bbb537684e6fa18192341": "maDAI",
  "0xf4b8888427b00d7caf21654408b7cba2ecf4ebd9": "maUSDT",
  "0x8c8bdbe9cee455732525086264a4bf9cf821c498": "maUNI",
  "0x9719d867a500ef117cc201206b8ab51e794d3f82": "maUSDC",
  "0xdae5f1590db13e3b40423b5b5c5fbf175515910b": "maUSDC",
  "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390": "amWETH",
  "0x1a13f4ca1d028320a707d99520abfefca3998b7f": "amUSDC",
  "0x27f8d03b3a2196956ed754badc28d73be8830a6e": "amDAI",
  "0x60d55f02a771d515e077c9c2403a1ef324885cec": "amUSDT",
  "0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4": "amWMATIC",
  "0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360": "amAAVE",
  "0x0ca2e42e8c21954af73bc9af1213e4e81d6a669a": "amWBTC",
};

function getCollateralName(address: string): string {
  const lower = address.toLowerCase();
  return COLLATERAL_NAMES[lower] || "Unknown";
}

type Props = {
  gotchi: ExplorerGotchi | null;
  onClose: () => void;
  onAddToDress?: (gotchi: ExplorerGotchi) => void;
};

const TRAIT_NAMES = ["NRG", "AGG", "SPK", "BRN"];

function formatAge(createdAtBlock: number | undefined): { age: string } {
  if (!createdAtBlock) return { age: "Unknown" };
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAtBlock;
  const ageDays = Math.floor(ageSeconds / 86400);
  
  let ageLabel = "";
  if (ageDays >= 730) ageLabel = "AANCIENT";
  else if (ageDays >= 365) ageLabel = "ANCIENT";
  else if (ageDays >= 180) ageLabel = "OLDE";
  else if (ageDays >= 90) ageLabel = "YOUNG";
  else ageLabel = "NEWBORN";
  
  return { age: `${ageLabel} (~${ageDays}d)` };
}

function Section({
  title,
  children,
  defaultOpen = true,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-4">{children}</div>
      </div>
    </div>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  const isExtreme = value <= 10 || value >= 90;
  const percent = Math.min(100, Math.max(0, value));
  const isLow = value < 50;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded ${isExtreme ? "bg-purple-500/20 text-purple-400 font-bold" : "bg-muted"}`}>
          {value}
        </span>
      </div>
      <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden relative border border-border/30">
        <div className="absolute inset-0 flex">
          <div className="w-1/2 border-r border-muted-foreground/20" />
        </div>
        <div
          className={`absolute h-full rounded-full transition-all ${isExtreme ? "bg-gradient-to-r from-purple-500 to-pink-500" : "bg-gradient-to-r from-primary/80 to-primary"}`}
          style={{
            left: isLow ? `${percent}%` : "50%",
            width: isLow ? `${50 - percent}%` : `${percent - 50}%`,
          }}
        />
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  const days = Math.floor(diff / 86400);
  if (days >= 365) return `${Math.floor(days / 365)} yr ago`;
  if (days >= 30) return `${Math.floor(days / 30)} mo ago`;
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3600);
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

function SalesHistorySection({ tokenId }: { tokenId: string }) {
  const { sales, loading } = useGotchiSalesHistory(tokenId);
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border/30 last:border-0">
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium">
          <span>Recent Sales</span>
          <span className="text-xs text-muted-foreground">Loading...</span>
        </button>
      </div>
    );
  }

  if (sales.length === 0) return null;

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span>Recent Sales ({sales.length})</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-4 pb-3 space-y-3">
          {sales.map((sale) => {
            const wearables = sale.equippedWearables.filter((w) => w > 0);
            const priceGhst = (parseFloat(sale.priceInWei) / 1e18).toFixed(2);
            return (
              <div key={sale.id} className="bg-muted/20 rounded-lg p-2.5 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">
                    {sale.seller.slice(0, 6)}...{sale.seller.slice(-4)}
                  </span>
                  <span className="font-medium text-green-500">{priceGhst} GHST</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{formatTimeAgo(sale.timePurchased)}</span>
                  <span className="text-muted-foreground">
                    {wearables.length > 0 ? `${wearables.length} Wearable${wearables.length > 1 ? "s" : ""}` : "No Wearables"}
                  </span>
                </div>
                {wearables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/20">
                    {wearables.map((id, i) => (
                      <div key={i} className="flex items-center gap-1 bg-background/50 rounded px-1.5 py-0.5">
                        <img
                          src={getWearableImageUrl(id)}
                          alt={getWearableName(id)}
                          className="w-4 h-4 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://wiki.aavegotchi.com/wearables/${id}.svg`;
                          }}
                        />
                        <span className="text-[10px]">{getWearableName(id)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GotchiDetailDrawer({ gotchi, onClose, onAddToDress }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  
  if (!gotchi) return null;

  const tier = getRarityTier(gotchi.withSetsRarityScore);
  const traits = gotchi.withSetsNumericTraits || gotchi.modifiedNumericTraits || gotchi.numericTraits;
  const eyeData = extractEyeData(gotchi);
  const equippedWearableIds = gotchi.equippedWearables.filter((w) => w > 0);
  const wearableCount = equippedWearableIds.length;

  const copyTokenId = () => {
    navigator.clipboard.writeText(gotchi.tokenId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tierStyles: Record<string, string> = {
    godlike: "from-pink-500/30 to-pink-500/5 border-pink-500/30",
    mythical: "from-purple-500/30 to-purple-500/5 border-purple-500/30",
    legendary: "from-yellow-500/30 to-yellow-500/5 border-yellow-500/30",
    rare: "from-blue-500/30 to-blue-500/5 border-blue-500/30",
    uncommon: "from-green-500/30 to-green-500/5 border-green-500/30",
    common: "from-gray-500/30 to-gray-500/5 border-gray-500/30",
  };

  const copyOwner = () => {
    navigator.clipboard.writeText(gotchi.owner);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[360px] bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <button 
            onClick={copyTokenId}
            className="flex items-center gap-1 text-sm font-mono px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            #{gotchi.tokenId}
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">H{gotchi.hauntId}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div 
          className={`p-4 bg-gradient-to-b ${tierStyles[tier] || tierStyles.common} border-b border-border/30`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="relative aspect-square max-w-40 mx-auto">
            {wearableCount > 0 && (
              <div className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? "opacity-0" : "opacity-100"}`}>
                <GotchiSvg
                  gotchiId={gotchi.tokenId}
                  hauntId={gotchi.hauntId}
                  collateral={gotchi.collateral}
                  numericTraits={gotchi.numericTraits}
                  equippedWearables={gotchi.equippedWearables}
                  className="w-full h-full"
                />
              </div>
            )}
            <div className={`${wearableCount > 0 ? "absolute inset-0" : ""} transition-opacity duration-300 ${wearableCount > 0 && !isHovered ? "opacity-0" : "opacity-100"}`}>
              <GotchiSvg
                gotchiId={gotchi.tokenId}
                hauntId={gotchi.hauntId}
                collateral={gotchi.collateral}
                numericTraits={gotchi.numericTraits}
                equippedWearables={wearableCount > 0 ? NAKED_WEARABLES : gotchi.equippedWearables}
                className="w-full h-full"
              />
            </div>
          </div>
          <div className="text-center mt-3 space-y-1">
            <div className="text-base font-medium">{gotchi.name || "Unnamed"}</div>
            <div className="text-sm text-muted-foreground">
              Rarity Score {gotchi.withSetsRarityScore} ({gotchi.baseRarityScore})
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-2 border-b border-border/30">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/30 rounded-lg py-2">
              <div className="text-xs text-muted-foreground">Level</div>
              <div className="font-semibold">{gotchi.level}</div>
            </div>
            <div className="bg-muted/30 rounded-lg py-2">
              <div className="text-xs text-muted-foreground">Kinship</div>
              <div className="font-semibold">{gotchi.kinship ?? "—"}</div>
            </div>
            <div className="bg-muted/30 rounded-lg py-2">
              <div className="text-xs text-muted-foreground">XP</div>
              <div className="font-semibold">{gotchi.experience ?? 0}</div>
            </div>
          </div>
          {gotchi.equippedSetName && (
            <div className="text-xs text-center text-purple-400">Set: {gotchi.equippedSetName}</div>
          )}
          {gotchi.listing && (
            <div className="text-sm text-center text-green-500 font-medium">
              {(parseFloat(gotchi.listing.priceInWei) / 1e18).toFixed(2)} GHST
            </div>
          )}
        </div>

        <Section title="Traits">
          {traits.slice(0, 4).map((val, i) => (
            <TraitBar key={i} label={TRAIT_NAMES[i]} value={val} />
          ))}
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/20">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Eye Shape</span>
              <span>{getEyeShapeName(eyeData.shape)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Eye Color</span>
              <span>{getEyeColorName(eyeData.color)}</span>
            </div>
          </div>
        </Section>

        <Section title={`Wearables (${wearableCount})`} defaultOpen={wearableCount > 0}>
          {equippedWearableIds.length > 0 ? (
            <div className="space-y-1">
              {equippedWearableIds.map((id, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <img
                    src={getWearableImageUrl(id)}
                    alt={getWearableName(id)}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://wiki.aavegotchi.com/wearables/${id}.svg`;
                    }}
                  />
                  <span className="text-sm">{getWearableName(id)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">No wearables equipped</div>
          )}
        </Section>

        <Section title="Info" defaultOpen={false}>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Collateral</span><span>{getCollateralName(gotchi.collateral)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Owner</span>
              <button onClick={copyOwner} className="flex items-center gap-1 hover:text-primary transition-colors">
                {gotchi.owner.slice(0, 6)}...{gotchi.owner.slice(-4)}
                <Copy className="h-3 w-3" />
              </button>
            </div>
            {gotchi.createdAt && (
              <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{formatAge(gotchi.createdAt).age}</span></div>
            )}
          </div>
        </Section>

        <SalesHistorySection tokenId={gotchi.tokenId} />
      </div>

      <div className="p-3 border-t border-border/30">
        {onAddToDress && (
          <Button variant="default" className="w-full h-10 text-sm" onClick={() => onAddToDress(gotchi)}>
            Add to Dress
          </Button>
        )}
      </div>
    </div>
  );
}
