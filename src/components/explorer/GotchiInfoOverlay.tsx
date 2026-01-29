import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import wearablesData from "../../../data/wearables.json";
import setsByTraitDirectionData from "../../../data/setsByTraitDirection.json";

function getWearableImageUrl(id: number): string {
  return `https://app.aavegotchi.com/images/items/${id}.svg`;
}

const wearableNameMap = new Map<number, string>(
  (wearablesData as { id: number; name: string }[]).map((w) => [w.id, w.name])
);

function getWearableName(id: number): string {
  return wearableNameMap.get(id) || `#${id}`;
}

const setNameMap = new Map<string, string>(
  (setsByTraitDirectionData as { sets: { name: string }[] }).sets.map((s, i) => [String(i), s.name])
);

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

function formatAge(createdAtBlock: number | undefined): string {
  if (!createdAtBlock) return "Unknown";
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAtBlock;
  const ageDays = Math.floor(ageSeconds / 86400);
  
  let ageLabel = "";
  if (ageDays >= 730) ageLabel = "AANCIENT";
  else if (ageDays >= 365) ageLabel = "ANCIENT";
  else if (ageDays >= 180) ageLabel = "OLDE";
  else if (ageDays >= 90) ageLabel = "YOUNG";
  else ageLabel = "NEWBORN";
  
  return `${ageLabel} (~${ageDays}d)`;
}

function shortenAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

type Props = {
  gotchi: ExplorerGotchi;
  position?: "above" | "below";
};

export function GotchiInfoOverlay({ gotchi, position = "above" }: Props) {
  const [copied, setCopied] = useState(false);
  const [hoveredWearable, setHoveredWearable] = useState<number | null>(null);

  const equippedWearables = gotchi.equippedWearables.filter((id) => id > 0);
  const collateralName = getCollateralName(gotchi.collateral);
  const owner = gotchi.owner || "";
  const age = formatAge(gotchi.createdAt);
  const setId = gotchi.equippedSetID;
  const setName = setId ? setNameMap.get(String(setId)) : null;

  const copyOwner = async () => {
    if (owner) {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const positionClass = position === "above" 
    ? "bottom-full mb-1" 
    : "top-full mt-1";

  return (
    <div 
      className={`absolute left-0 right-0 ${positionClass} z-50 bg-background/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl p-2 space-y-2 animate-in fade-in-0 zoom-in-95 duration-150`}
      onClick={(e) => e.stopPropagation()}
    >
      {equippedWearables.length > 0 && (
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
            Wearables ({equippedWearables.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {equippedWearables.map((id, idx) => (
              <div 
                key={idx}
                className="relative group"
                onMouseEnter={() => setHoveredWearable(id)}
                onMouseLeave={() => setHoveredWearable(null)}
              >
                <img
                  src={getWearableImageUrl(id)}
                  alt={getWearableName(id)}
                  className="w-7 h-7 rounded bg-muted/30 p-0.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {hoveredWearable === id && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-foreground text-background text-[9px] rounded whitespace-nowrap z-10">
                    {getWearableName(id)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Collateral</span>
          <span className="font-medium">{collateralName}</span>
        </div>
        {owner && (
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Owner</span>
            <button 
              onClick={copyOwner}
              className="flex items-center gap-0.5 hover:text-primary transition-colors"
            >
              <span className="font-mono text-[9px]">{shortenAddress(owner)}</span>
              {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
            </button>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Age</span>
          <span className="font-medium">{age}</span>
        </div>
        {setName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Set</span>
            <span className="font-medium text-purple-400 truncate max-w-[80px]">{setName}</span>
          </div>
        )}
      </div>

      {equippedWearables.length === 0 && (
        <div className="text-[10px] text-muted-foreground text-center py-1">
          No wearables equipped
        </div>
      )}
    </div>
  );
}
