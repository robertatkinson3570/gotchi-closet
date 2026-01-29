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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold">Sort By</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortOptions.map((opt) => {
          const key = `${opt.value.field}:${opt.value.direction}`;
          const isActive = key === currentKey;

          return (
            <button
              key={key}
              onClick={() => {
                onSortChange(opt.value);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-4 py-3 border-b border-border/30 hover:bg-muted/50 ${
                isActive ? "bg-primary/10" : ""
              }`}
            >
              <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{opt.label}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
