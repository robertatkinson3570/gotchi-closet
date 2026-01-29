import { Button } from "@/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/ui/sheet";
import { Check } from "lucide-react";
import type { WearableSort, WearableSortField } from "@/lib/explorer/wearableTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: WearableSort;
  setSort: (sort: WearableSort) => void;
  mode: string;
}

type SortOption = {
  label: string;
  field: WearableSortField;
  direction: "asc" | "desc";
};

const BASE_SORTS: SortOption[] = [
  { label: "Name A–Z", field: "name", direction: "asc" },
  { label: "Name Z–A", field: "name", direction: "desc" },
  { label: "ID ↑", field: "id", direction: "asc" },
  { label: "ID ↓", field: "id", direction: "desc" },
  { label: "Rarity ↓", field: "rarity", direction: "desc" },
  { label: "Rarity ↑", field: "rarity", direction: "asc" },
  { label: "Slot", field: "slot", direction: "asc" },
  { label: "Total Stats ↓", field: "totalStats", direction: "desc" },
  { label: "Total Stats ↑", field: "totalStats", direction: "asc" },
];

const OWNED_SORTS: SortOption[] = [
  { label: "Quantity ↓", field: "quantity", direction: "desc" },
  { label: "Quantity ↑", field: "quantity", direction: "asc" },
];

const BAAZAAR_SORTS: SortOption[] = [
  { label: "Price ↓", field: "price", direction: "desc" },
  { label: "Price ↑ (Cheapest)", field: "price", direction: "asc" },
];

export function WearableSortSheet({ open, onOpenChange, sort, setSort, mode }: Props) {
  const allSorts = [
    ...BASE_SORTS,
    ...(mode === "mine" ? OWNED_SORTS : []),
    ...(mode === "baazaar" ? BAAZAAR_SORTS : []),
  ];

  const handleSelect = (option: SortOption) => {
    setSort({ field: option.field, direction: option.direction });
    onOpenChange(false);
  };

  const isSelected = (option: SortOption) =>
    sort.field === option.field && sort.direction === option.direction;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[60vh]">
        <SheetHeader>
          <SheetTitle>Sort Wearables</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {allSorts.map((option) => (
            <Button
              key={`${option.field}-${option.direction}`}
              variant={isSelected(option) ? "default" : "outline"}
              size="sm"
              onClick={() => handleSelect(option)}
              className="justify-start"
            >
              {isSelected(option) && <Check className="w-4 h-4 mr-2" />}
              {option.label}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
