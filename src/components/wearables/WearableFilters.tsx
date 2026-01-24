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
    <div className="flex flex-wrap items-center gap-2 p-2 border-b bg-muted/30">
      <div className="flex-1 min-w-[180px]">
        <Input
          placeholder="Search wearables..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
      </div>
      <Select
        value={filters.slot?.toString() || "all"}
        onValueChange={(value) =>
          setFilters({ slot: value === "all" ? null : Number(value) })
        }
      >
        <SelectTrigger className="min-w-[140px]">
          <SelectValue placeholder="Slot" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Slots</SelectItem>
          {SLOT_NAMES.map((name, i) => (
            <SelectItem key={i} value={i.toString()}>
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
        <SelectTrigger className="min-w-[140px]">
          <SelectValue placeholder="Set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sets</SelectItem>
          {sets.map((set) => (
            <SelectItem key={set.id} value={set.id}>
              {set.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

