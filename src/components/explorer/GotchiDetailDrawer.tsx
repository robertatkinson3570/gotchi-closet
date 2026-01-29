import { useState } from "react";
import { Button } from "@/ui/button";
import { X, ChevronDown, Copy, Check } from "lucide-react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { getRarityTier } from "@/lib/explorer/filters";
import { extractEyeData, getEyeShapeName, getEyeColorName } from "@/lib/explorer/traitFrequency";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";

const NAKED_WEARABLES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function getWearableImageUrl(id: number): string {
  return `https://app.aavegotchi.com/images/items/${id}.svg`;
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
const TRAIT_LABELS = ["Energy", "Aggression", "Spookiness", "Brain Size"];

const ENERGY_NAMES: Record<string, string> = {
  low: "Zen", mid: "Calm", high: "Energetic", extreme_low: "Serene", extreme_high: "Hyper"
};
const AGG_NAMES: Record<string, string> = {
  low: "Peaceful", mid: "Neutral", high: "Aggressive", extreme_low: "Tranquil", extreme_high: "Hostile"  
};
const SPK_NAMES: Record<string, string> = {
  low: "Cuddly", mid: "Spooky", high: "Ghastly", extreme_low: "Adorable", extreme_high: "Terrifying"
};
const BRN_NAMES: Record<string, string> = {
  low: "Smooth", mid: "Average", high: "Galaxy", extreme_low: "Simple", extreme_high: "Genius"
};

function getTraitPersonality(value: number, traitIndex: number): string {
  const names = [ENERGY_NAMES, AGG_NAMES, SPK_NAMES, BRN_NAMES][traitIndex];
  if (!names) return "";
  if (value <= 10) return names.extreme_low;
  if (value >= 90) return names.extreme_high;
  if (value < 40) return names.low;
  if (value > 60) return names.high;
  return names.mid;
}

function getXpToNextLevel(level: number, currentXp: number): number {
  const xpRequired = level * level * 50;
  return Math.max(0, xpRequired - currentXp);
}

function formatAge(createdAtBlock: number | undefined): { age: string; bonus: number } {
  if (!createdAtBlock) return { age: "Unknown", bonus: 0 };
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAtBlock;
  const ageDays = Math.floor(ageSeconds / 86400);
  
  let ageLabel = "";
  let bonus = 0;
  
  if (ageDays >= 730) { ageLabel = "AANCIENT"; bonus = 9; }
  else if (ageDays >= 365) { ageLabel = "ANCIENT"; bonus = 6; }
  else if (ageDays >= 180) { ageLabel = "OLDE"; bonus = 3; }
  else if (ageDays >= 90) { ageLabel = "YOUNG"; bonus = 1; }
  else { ageLabel = "NEWBORN"; bonus = 0; }
  
  return { age: `${ageLabel} (~${ageDays}d)`, bonus };
}

function formatGhstBalance(escrow: string | undefined): string {
  if (!escrow) return "0.00";
  return "0.00";
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

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-primary" : "text-foreground"}`}>{value}</span>
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

  return (
    <div className="fixed inset-0 z-50 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[420px] bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-bold truncate">{gotchi.name || "Unnamed"}</h2>
          <button 
            onClick={copyTokenId}
            className="flex items-center gap-1 text-xs text-muted-foreground font-mono px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            #{gotchi.tokenId}
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-destructive/10" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div 
          className={`p-6 bg-gradient-to-b ${tierStyles[tier] || tierStyles.common} border-b border-border/30`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="relative aspect-square max-w-56 mx-auto">
            {wearableCount > 0 && (
              <div className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? "opacity-0" : "opacity-100"}`}>
                <GotchiSvg
                  gotchiId={gotchi.tokenId}
                  hauntId={gotchi.hauntId}
                  collateral={gotchi.collateral}
                  numericTraits={gotchi.numericTraits}
                  equippedWearables={gotchi.equippedWearables}
                  className="w-full h-full drop-shadow-lg"
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
                className="w-full h-full drop-shadow-lg"
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className={`text-sm px-3 py-1 rounded-full capitalize font-medium ${
              tier === "godlike" ? "bg-pink-500/20 text-pink-400 border border-pink-500/30" :
              tier === "mythical" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
              tier === "legendary" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
              tier === "rare" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
              tier === "uncommon" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
              "bg-gray-500/20 text-gray-400 border border-gray-500/30"
            }`}>
              {tier}
            </span>
            <span className="text-2xl font-bold">{gotchi.withSetsRarityScore} <span className="text-sm font-normal text-muted-foreground">BRS</span></span>
          </div>
        </div>

        <Section title="Stats">
          <StatRow label="Rarity Score" value={`${gotchi.withSetsRarityScore} (${gotchi.baseRarityScore})`} highlight />
          <StatRow label="Kinship" value={gotchi.kinship ?? "—"} />
          <StatRow label="Haunt" value={gotchi.hauntId} />
          <StatRow label="Level" value={`${gotchi.level} (${gotchi.experience ?? 0} XP)`} />
          {gotchi.experience !== undefined && gotchi.level && (
            <StatRow label="XP to Next Level" value={getXpToNextLevel(gotchi.level, gotchi.experience)} />
          )}
          <StatRow label="Spirit Points" value={gotchi.usedSkillPoints ?? 0} />
          {gotchi.equippedSetName && <StatRow label="Equipped Set" value={gotchi.equippedSetName} highlight />}
          {gotchi.createdAt && (
            <StatRow label="Age" value={`${formatAge(gotchi.createdAt).age} (+${formatAge(gotchi.createdAt).bonus} pts)`} />
          )}
          <StatRow label="GHST Balance" value={formatGhstBalance(gotchi.escrow)} />
          <StatRow label="Collateral" value={getCollateralName(gotchi.collateral)} />
          <StatRow label="Owner" value={`${gotchi.owner.slice(0, 6)}...${gotchi.owner.slice(-4)}`} />
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
              label={`${TRAIT_NAMES[i]} (${TRAIT_LABELS[i]}) — ${getTraitPersonality(val, i).toUpperCase()}`}
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

        <Section title={`Wearables (${wearableCount})`} defaultOpen={false}>
          {equippedWearableIds.length > 0 ? (
            <div className="grid grid-cols-4 gap-3 mt-1">
              {equippedWearableIds.map((id, i) => (
                <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors">
                  <img
                    src={getWearableImageUrl(id)}
                    alt={`Wearable #${id}`}
                    className="w-12 h-12 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://wiki.aavegotchi.com/wearables/${id}.svg`;
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">#{id}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center bg-muted/20 rounded-lg">No wearables equipped</div>
          )}
        </Section>
      </div>

      <div className="flex items-center gap-3 p-4 border-t border-border/30 bg-gradient-to-t from-muted/30 to-transparent">
        {onAddToDress && (
          <Button variant="default" className="flex-1 h-11 text-sm font-medium" onClick={() => onAddToDress(gotchi)}>
            Add to Dress
          </Button>
        )}
      </div>
    </div>
  );
}
