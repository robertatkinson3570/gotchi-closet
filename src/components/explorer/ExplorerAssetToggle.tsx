import type { AssetType } from "@/lib/explorer/wearableTypes";
import { Ghost, Shirt, Sparkles, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  value: AssetType;
  onChange: (value: AssetType) => void;
}

const TABS: { key: AssetType; label: string; icon: LucideIcon }[] = [
  { key: "gotchi", label: "Gotchis", icon: Ghost },
  { key: "wearable", label: "Wearables", icon: Shirt },
  { key: "item", label: "Items", icon: Sparkles },
  { key: "parcel", label: "Parcels", icon: MapPin },
];

export function ExplorerAssetToggle({ value, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden bg-muted/30">
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={label}
          className={`relative group flex items-center justify-center w-9 h-9 transition-colors ${
            value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Icon className="w-4 h-4" />
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-xs font-medium bg-popover text-popover-foreground border border-border rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
