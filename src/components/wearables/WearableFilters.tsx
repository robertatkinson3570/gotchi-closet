import { Input } from "@/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/switch";
import { X } from "lucide-react";
import { SLOT_NAMES } from "@/lib/constants";
import { useAppStore } from "@/state/useAppStore";

const RARITIES = ["Godlike", "Mythical", "Legendary", "Rare", "Uncommon", "Common"] as const;

export function WearableFilters() {
  const filters = useAppStore((state) => state.filters);
  const sets = useAppStore((state) => state.sets);
  const setFilters = useAppStore((state) => state.setFilters);
  const clearFilters = useAppStore((state) => state.clearFilters);

  const hasActiveFilters = filters.search || filters.slot !== null || filters.rarity || filters.set || filters.traitDirections;

  return (
    <div className="flex flex-col gap-1.5 p-1.5 border-b bg-muted/30">
      <div className="flex items-center gap-1">
        <Input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="h-7 text-[11px] flex-1"
        />
        <label className="flex items-center gap-2 text-[10px] text-muted-foreground whitespace-nowrap cursor-pointer select-none shrink-0">
          <Switch
            checked={filters.ownedOnly}
            onCheckedChange={(checked) => setFilters({ ownedOnly: checked })}
            className="h-4 w-8 shrink-0 data-[state=checked]:bg-primary"
          />
          <span>My Items</span>
        </label>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={clearFilters}
            title="Clear all filters"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Select
          value={filters.slot?.toString() || "all"}
          onValueChange={(value) =>
            setFilters({ slot: value === "all" ? null : Number(value) })
          }
        >
          <SelectTrigger className="h-7 flex-1 text-[11px]">
            <SelectValue placeholder="Slot" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[11px]">Slots All</SelectItem>
            {SLOT_NAMES.map((name, i) => (
              <SelectItem key={i} value={i.toString()} className="text-[11px]">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.rarity || "all"}
          onValueChange={(value) =>
            setFilters({ rarity: value === "all" ? null : value })
          }
        >
          <SelectTrigger className="h-7 flex-1 text-[11px]">
            <SelectValue placeholder="Rarity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[11px]">Rarity All</SelectItem>
            {RARITIES.map((rarity) => (
              <SelectItem key={rarity} value={rarity} className="text-[11px]">
                {rarity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.set || "all"}
          onValueChange={(value) =>
            setFilters({ set: value === "all" ? null : value })
          }
        >
          <SelectTrigger className="h-7 flex-1 text-[11px]">
            <SelectValue placeholder="Set" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[11px]">Sets All</SelectItem>
            {sets.map((set) => (
              <SelectItem key={set.id} value={set.id} className="text-[11px]">
                {set.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

