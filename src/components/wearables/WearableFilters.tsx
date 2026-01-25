import { Input } from "@/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { SLOT_NAMES } from "@/lib/constants";
import { useAppStore } from "@/state/useAppStore";

export function WearableFilters() {
  const filters = useAppStore((state) => state.filters);
  const sets = useAppStore((state) => state.sets);
  const setFilters = useAppStore((state) => state.setFilters);

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 border-b bg-muted/30">
      <div className="flex-1 min-w-[120px]">
        <Input
          placeholder="Search wearables..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="h-7 text-[11px]"
        />
      </div>
      <Select
        value={filters.slot?.toString() || "all"}
        onValueChange={(value) =>
          setFilters({ slot: value === "all" ? null : Number(value) })
        }
      >
        <SelectTrigger className="h-7 min-w-[90px] text-[11px]">
          <SelectValue placeholder="Slot" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-[11px]">All Slots</SelectItem>
          {SLOT_NAMES.map((name, i) => (
            <SelectItem key={i} value={i.toString()} className="text-[11px]">
              {name}
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
        <SelectTrigger className="h-7 min-w-[90px] text-[11px]">
          <SelectValue placeholder="Set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-[11px]">All Sets</SelectItem>
          {sets.map((set) => (
            <SelectItem key={set.id} value={set.id} className="text-[11px]">
              {set.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

