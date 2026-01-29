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
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
          value === "gotchi"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <Ghost className="w-4 h-4" />
        <span className="hidden sm:inline">Gotchis</span>
      </button>
      <button
        onClick={() => onChange("wearable")}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
          value === "wearable"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <Shirt className="w-4 h-4" />
        <span className="hidden sm:inline">Wearables</span>
      </button>
    </div>
  );
}
