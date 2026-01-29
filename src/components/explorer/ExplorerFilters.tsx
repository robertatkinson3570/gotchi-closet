import { useState, useEffect } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import type { ExplorerFilters } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";

type Props = {
  filters: ExplorerFilters;
  onFiltersChange: (filters: ExplorerFilters) => void;
  onClose?: () => void;
  isMobile?: boolean;
};

const rarityTiers = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "legendary", label: "Legendary" },
  { value: "mythical", label: "Mythical" },
  { value: "godlike", label: "Godlike" },
];

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function RangeInputs({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-1 mt-1">
        <Input
          type="number"
          placeholder="Min"
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          className="h-7 text-xs"
        />
        <span className="text-muted-foreground self-center">-</span>
        <Input
          type="number"
          placeholder="Max"
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

export function ExplorerFilters({ filters, onFiltersChange, onClose, isMobile }: Props) {
  const [localFilters, setLocalFilters] = useState(filters);
  
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const updateFilter = <K extends keyof ExplorerFilters>(key: K, value: ExplorerFilters[K]) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    if (!isMobile) {
      onFiltersChange(updated);
    }
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onClose?.();
  };

  const handleClear = () => {
    setLocalFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  };

  const toggleRarityTier = (tier: string) => {
    const current = localFilters.rarityTiers;
    const updated = current.includes(tier)
      ? current.filter((t) => t !== tier)
      : [...current, tier];
    updateFilter("rarityTiers", updated);
  };

  return (
    <div className={`flex flex-col h-full ${isMobile ? "bg-background" : ""}`}>
      {isMobile && (
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">Filters</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <FilterSection title="Token ID" defaultOpen>
          <div>
            <Label className="text-xs text-muted-foreground">Exact ID</Label>
            <Input
              type="text"
              placeholder="e.g. 12345"
              value={localFilters.tokenId}
              onChange={(e) => updateFilter("tokenId", e.target.value)}
              className="h-7 text-xs mt-1"
            />
          </div>
          <RangeInputs
            label="ID Range"
            minValue={localFilters.tokenIdMin}
            maxValue={localFilters.tokenIdMax}
            onMinChange={(v) => updateFilter("tokenIdMin", v)}
            onMaxChange={(v) => updateFilter("tokenIdMax", v)}
          />
        </FilterSection>

        <FilterSection title="Name">
          <Input
            type="text"
            placeholder="Search name..."
            value={localFilters.nameContains}
            onChange={(e) => updateFilter("nameContains", e.target.value)}
            className="h-7 text-xs"
          />
        </FilterSection>

        <FilterSection title="Rarity" defaultOpen>
          <RangeInputs
            label="Score Range"
            minValue={localFilters.rarityMin}
            maxValue={localFilters.rarityMax}
            onMinChange={(v) => updateFilter("rarityMin", v)}
            onMaxChange={(v) => updateFilter("rarityMax", v)}
          />
          <div>
            <Label className="text-xs text-muted-foreground">Tiers</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {rarityTiers.map((tier) => (
                <button
                  key={tier.value}
                  onClick={() => toggleRarityTier(tier.value)}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    localFilters.rarityTiers.includes(tier.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>
        </FilterSection>

        <FilterSection title="Traits">
          <RangeInputs
            label="NRG (Energy)"
            minValue={localFilters.nrgMin}
            maxValue={localFilters.nrgMax}
            onMinChange={(v) => updateFilter("nrgMin", v)}
            onMaxChange={(v) => updateFilter("nrgMax", v)}
          />
          <RangeInputs
            label="AGG (Aggression)"
            minValue={localFilters.aggMin}
            maxValue={localFilters.aggMax}
            onMinChange={(v) => updateFilter("aggMin", v)}
            onMaxChange={(v) => updateFilter("aggMax", v)}
          />
          <RangeInputs
            label="SPK (Spookiness)"
            minValue={localFilters.spkMin}
            maxValue={localFilters.spkMax}
            onMinChange={(v) => updateFilter("spkMin", v)}
            onMaxChange={(v) => updateFilter("spkMax", v)}
          />
          <RangeInputs
            label="BRN (Brain)"
            minValue={localFilters.brnMin}
            maxValue={localFilters.brnMax}
            onMinChange={(v) => updateFilter("brnMin", v)}
            onMaxChange={(v) => updateFilter("brnMax", v)}
          />
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.extremeTraits}
                onCheckedChange={(c) => updateFilter("extremeTraits", !!c)}
              />
              Extreme (≤10 or ≥90)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.balancedTraits}
                onCheckedChange={(c) => updateFilter("balancedTraits", !!c)}
              />
              Balanced (40-60)
            </label>
          </div>
        </FilterSection>

        <FilterSection title="Level">
          <RangeInputs
            label="Level Range"
            minValue={localFilters.levelMin}
            maxValue={localFilters.levelMax}
            onMinChange={(v) => updateFilter("levelMin", v)}
            onMaxChange={(v) => updateFilter("levelMax", v)}
          />
        </FilterSection>

        <FilterSection title="Wearables">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasWearables === true}
                onCheckedChange={(c) => updateFilter("hasWearables", c ? true : null)}
              />
              Has Wearables
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasWearables === false}
                onCheckedChange={(c) => updateFilter("hasWearables", c ? false : null)}
              />
              No Wearables
            </label>
          </div>
          <RangeInputs
            label="Wearable Count"
            minValue={localFilters.wearableCountMin}
            maxValue={localFilters.wearableCountMax}
            onMinChange={(v) => updateFilter("wearableCountMin", v)}
            onMaxChange={(v) => updateFilter("wearableCountMax", v)}
          />
        </FilterSection>

        <FilterSection title="Haunt">
          <Input
            type="number"
            placeholder="Haunt ID (1, 2, etc.)"
            value={localFilters.hauntId}
            onChange={(e) => updateFilter("hauntId", e.target.value)}
            className="h-7 text-xs"
          />
        </FilterSection>

        <FilterSection title="Price (Baazaar)">
          <RangeInputs
            label="GHST Price"
            minValue={localFilters.priceMin}
            maxValue={localFilters.priceMax}
            onMinChange={(v) => updateFilter("priceMin", v)}
            onMaxChange={(v) => updateFilter("priceMax", v)}
          />
        </FilterSection>
      </div>

      <div className="flex items-center gap-2 p-3 border-t bg-background">
        <Button variant="outline" onClick={handleClear} className="flex-1">
          Clear All
        </Button>
        {isMobile && (
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
        )}
      </div>
    </div>
  );
}
