import { useState, useEffect } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { X, ChevronDown } from "lucide-react";
import type { ExplorerFilters } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";

type Props = {
  filters: ExplorerFilters;
  onFiltersChange: (filters: ExplorerFilters) => void;
  onClose?: () => void;
  isMobile?: boolean;
  availableSets?: string[];
};

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
    <div className="border-b border-border/20">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-primary/5 transition-colors"
      >
        <span className="text-foreground">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-4 pb-4 space-y-3">{children}</div>
      </div>
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
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          className="h-9 text-sm bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="number"
          placeholder="Max"
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          className="h-9 text-sm bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}

export function ExplorerFilters({ filters, onFiltersChange, onClose, isMobile, availableSets = [] }: Props) {
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

  const toggleHaunt = (haunt: string) => {
    const current = localFilters.haunts;
    const updated = current.includes(haunt)
      ? current.filter((h) => h !== haunt)
      : [...current, haunt];
    updateFilter("haunts", updated);
  };

  const toggleEquippedSet = (setName: string) => {
    const current = localFilters.equippedSets;
    const updated = current.includes(setName)
      ? current.filter((s) => s !== setName)
      : [...current, setName];
    updateFilter("equippedSets", updated);
  };

  return (
    <div className={`flex flex-col h-full ${isMobile ? "bg-background/95 backdrop-blur-xl" : "bg-background/95 backdrop-blur-xl"}`}>
      {isMobile && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/10 to-transparent">
          <h2 className="text-xl font-bold">Filters</h2>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-destructive/10" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <FilterSection title="Token ID" defaultOpen>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Exact ID</Label>
            <Input
              type="text"
              placeholder="e.g. 12345"
              value={localFilters.tokenId}
              onChange={(e) => updateFilter("tokenId", e.target.value)}
              className="h-9 text-sm bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
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
            className="h-9 text-sm bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
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
          <div className="flex flex-wrap gap-3 pt-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
              <Checkbox
                checked={localFilters.extremeTraits}
                onCheckedChange={(c) => updateFilter("extremeTraits", !!c)}
                className="h-4 w-4"
              />
              Extreme (≤10 or ≥90)
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
              <Checkbox
                checked={localFilters.balancedTraits}
                onCheckedChange={(c) => updateFilter("balancedTraits", !!c)}
                className="h-4 w-4"
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
          <div className="flex gap-4">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
              <Checkbox
                checked={localFilters.haunts.includes("1")}
                onCheckedChange={() => toggleHaunt("1")}
                className="h-4 w-4"
              />
              Haunt 1
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
              <Checkbox
                checked={localFilters.haunts.includes("2")}
                onCheckedChange={() => toggleHaunt("2")}
                className="h-4 w-4"
              />
              Haunt 2
            </label>
          </div>
        </FilterSection>

        <FilterSection title="GHST Pocket">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasGhstPocket === true}
                onCheckedChange={(c) => updateFilter("hasGhstPocket", c ? true : null)}
              />
              Has GHST in Pocket
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasGhstPocket === false}
                onCheckedChange={(c) => updateFilter("hasGhstPocket", c ? false : null)}
              />
              No GHST in Pocket
            </label>
          </div>
          <RangeInputs
            label="GHST Balance"
            minValue={localFilters.ghstBalanceMin}
            maxValue={localFilters.ghstBalanceMax}
            onMinChange={(v) => updateFilter("ghstBalanceMin", v)}
            onMaxChange={(v) => updateFilter("ghstBalanceMax", v)}
          />
        </FilterSection>

        <FilterSection title="Equipped Set">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasEquippedSet === true}
                onCheckedChange={(c) => updateFilter("hasEquippedSet", c ? true : null)}
              />
              Has Complete Set
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={localFilters.hasEquippedSet === false}
                onCheckedChange={(c) => updateFilter("hasEquippedSet", c ? false : null)}
              />
              No Complete Set
            </label>
          </div>
          {availableSets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/20">
              <Label className="text-xs text-muted-foreground mb-2 block">Filter by Set</Label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {availableSets.map((setName) => (
                  <label key={setName} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 px-2 py-1 rounded">
                    <Checkbox
                      checked={localFilters.equippedSets.includes(setName)}
                      onCheckedChange={() => toggleEquippedSet(setName)}
                    />
                    <span className="truncate">{setName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </FilterSection>

        <FilterSection title="Eye Traits">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={localFilters.doubleMythEyes}
              onCheckedChange={(c) => updateFilter("doubleMythEyes", !!c)}
            />
            Double Mythical Eyes
          </label>
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

      <div className="flex items-center gap-3 p-4 border-t border-border/30 bg-gradient-to-t from-muted/30 to-transparent">
        <Button variant="outline" onClick={handleClear} className="flex-1 h-11">
          Clear All
        </Button>
        {isMobile && (
          <Button onClick={handleApply} className="flex-1 h-11 font-medium">
            Apply Filters
          </Button>
        )}
      </div>
    </div>
  );
}
