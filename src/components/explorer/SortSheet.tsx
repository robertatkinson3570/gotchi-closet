import { Button } from "@/ui/button";
import { X, Check } from "lucide-react";
import type { ExplorerSort } from "@/lib/explorer/types";
import { sortOptions } from "@/lib/explorer/sorts";

type Props = {
  sort: ExplorerSort;
  onSortChange: (sort: ExplorerSort) => void;
  onClose: () => void;
};

export function SortSheet({ sort, onSortChange, onClose }: Props) {
  const currentKey = `${sort.field}:${sort.direction}`;
  
  const statsOptions = sortOptions.filter((o) => o.category === "stats");
  const traitOptions = sortOptions.filter((o) => o.category === "traits");
  const marketOptions = sortOptions.filter((o) => o.category === "market");

  const renderOption = (opt: typeof sortOptions[0]) => {
    const key = `${opt.value.field}:${opt.value.direction}`;
    const isActive = key === currentKey;
    return (
      <button
        key={key}
        onClick={() => {
          onSortChange(opt.value);
          onClose();
        }}
        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors ${
          isActive ? "bg-primary/10" : ""
        }`}
      >
        <span className={`text-sm ${isActive ? "font-medium text-primary" : ""}`}>{opt.label}</span>
        {isActive && <Check className="h-4 w-4 text-primary" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b">
        <h2 className="text-lg font-semibold">Sort By</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground font-medium bg-muted/30">
          Stats
        </div>
        {statsOptions.map(renderOption)}
        
        <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground font-medium bg-muted/30 mt-2">
          Traits
        </div>
        {traitOptions.map(renderOption)}
        
        <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground font-medium bg-muted/30 mt-2">
          Market
        </div>
        {marketOptions.map(renderOption)}
      </div>
    </div>
  );
}
