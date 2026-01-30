import type { AssetType } from "@/lib/explorer/wearableTypes";
import { Ghost, Shirt } from "lucide-react";

interface Props {
  value: AssetType;
  onChange: (value: AssetType) => void;
}

export function ExplorerAssetToggle({ value, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden bg-muted/30">
      <button
        onClick={() => onChange("gotchi")}
        title="Gotchis"
        className={`relative group flex items-center justify-center w-9 h-9 transition-colors ${
          value === "gotchi"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <Ghost className="w-4 h-4" />
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-xs font-medium bg-popover text-popover-foreground border border-border rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          Gotchis
        </span>
      </button>
      <button
        onClick={() => onChange("wearable")}
        title="Wearables"
        className={`relative group flex items-center justify-center w-9 h-9 transition-colors ${
          value === "wearable"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <Shirt className="w-4 h-4" />
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-xs font-medium bg-popover text-popover-foreground border border-border rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          Wearables
        </span>
      </button>
    </div>
  );
}
