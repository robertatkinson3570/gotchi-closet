import { useState } from "react";
import { Copy, Check, X } from "lucide-react";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import wearablesData from "../../../data/wearables.json";

type WearableData = {
  id: number;
  name: string;
  traitModifiers: number[];
  rarityScoreModifier: number;
};

const wearablesMap = new Map<number, WearableData>(
  (wearablesData as WearableData[]).map((w) => [w.id, w])
);

function getWearableImageUrl(id: number): string {
  return `https://app.aavegotchi.com/images/items/${id}.svg`;
}

function getWearable(id: number): WearableData | undefined {
  return wearablesMap.get(id);
}

const TRAIT_ABBR = ["NRG", "AGG", "SPK", "BRN"];

function formatTraitMods(mods: number[]): string {
  const parts: string[] = [];
  mods.slice(0, 4).forEach((val, i) => {
    if (val !== 0) {
      parts.push(`${val > 0 ? "+" : ""}${val} ${TRAIT_ABBR[i]}`);
    }
  });
  return parts.length > 0 ? parts.join(", ") : "—";
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

function formatAge(createdAtTimestamp: number | undefined): string {
  if (!createdAtTimestamp) return "Unknown";
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAtTimestamp;
  const ageDays = Math.floor(ageSeconds / 86400);
  
  if (ageDays < 0) return "Unknown";
  
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
  onClose?: () => void;
};

export function GotchiInfoOverlay({ gotchi, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const equippedWearableIds = gotchi.equippedWearables.filter((id) => id > 0);
  const equippedWearables = equippedWearableIds.map((id) => getWearable(id)).filter(Boolean) as WearableData[];
  const collateralName = getCollateralName(gotchi.collateral);
  const owner = gotchi.owner || "";
  const age = formatAge(gotchi.createdAt);
  const setName = gotchi.equippedSetName;

  const copyOwner = async () => {
    if (owner) {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div 
      className="absolute inset-0 z-50 bg-background backdrop-blur-md rounded-lg flex flex-col animate-in fade-in-0 duration-100 border border-primary/20"
      onClick={(e) => e.stopPropagation()}
    >
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-1 right-1 p-0.5 rounded hover:bg-muted/50 transition-colors z-10"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      )}

      <div className="flex-1 p-2 overflow-y-auto space-y-2">
        <div className="text-[10px] font-semibold text-center text-primary border-b border-primary/20 pb-1">
          {gotchi.name || "Unnamed"}
        </div>

        {setName && (
          <div className="bg-primary/10 border border-primary/20 rounded px-2 py-1 text-center">
            <span className="text-[9px] text-muted-foreground">Set: </span>
            <span className="text-[10px] font-medium text-primary">{setName}</span>
          </div>
        )}

        {equippedWearables.length > 0 && (
          <div>
            <div className="text-[9px] text-primary uppercase tracking-wider mb-1 font-medium">
              Wearables ({equippedWearables.length})
            </div>
            <div className="space-y-1">
              {equippedWearables.map((w, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-2 bg-muted/20 rounded p-1"
                >
                  <img
                    src={getWearableImageUrl(w.id)}
                    alt={w.name}
                    className="w-6 h-6 rounded bg-muted/30 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-semibold truncate text-foreground">{w.name}</div>
                    <div className="text-[8px] text-muted-foreground">
                      {formatTraitMods(w.traitModifiers)}
                      {w.rarityScoreModifier > 0 && (
                        <span className="text-green-600 dark:text-green-400 ml-1">+{w.rarityScoreModifier} BRS</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1 text-[10px] bg-muted/30 rounded p-1.5">
          <div>
            <div className="text-muted-foreground font-medium text-[9px]">Collateral</div>
            <div className="font-semibold text-foreground">{collateralName}</div>
          </div>
          
          {owner && (
            <div>
              <div className="text-muted-foreground font-medium text-[9px]">Owner</div>
              <button 
                onClick={copyOwner}
                className="flex items-center gap-1 hover:text-primary transition-colors font-mono text-[9px] text-foreground"
              >
                {shortenAddress(owner)}
                {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            </div>
          )}
          
          <div>
            <div className="text-muted-foreground font-medium text-[9px]">Age</div>
            <div className="font-semibold text-foreground">{age}</div>
          </div>

          {(gotchi.stakedAmount || gotchi.escrow) && parseFloat(gotchi.stakedAmount || gotchi.escrow || "0") > 0 && (
            <div>
              <div className="text-muted-foreground font-medium text-[9px]">GHST Pocket</div>
              <div className="font-semibold text-foreground">
                {(parseFloat(gotchi.stakedAmount || gotchi.escrow || "0") / 1e18).toFixed(2)} GHST
              </div>
            </div>
          )}
        </div>

        {equippedWearables.length === 0 && (
          <div className="text-[9px] text-muted-foreground text-center py-2 bg-muted/20 rounded">
            No wearables equipped
          </div>
        )}
      </div>
    </div>
  );
}
