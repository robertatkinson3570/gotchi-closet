import { useState } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { WearableExplorerFilters } from "@/lib/explorer/wearableTypes";
import { SLOT_NAMES_EXPLORER, RARITY_TIERS } from "@/lib/explorer/wearableTypes";
import setsData from "../../../data/setsByTraitDirection.json";

interface Props {
  filters: WearableExplorerFilters;
  setFilters: (updates: Partial<WearableExplorerFilters>) => void;
  resetFilters: () => void;
  mode: string;
}

type Section = "slots" | "rarity" | "traits" | "sets" | "quantity" | "price" | "quality";

const RARITY_COLORS: Record<string, string> = {
  Godlike: "text-cyan-400",
  Mythical: "text-pink-400",
  Legendary: "text-yellow-400",
  Rare: "text-blue-400",
  Uncommon: "text-green-400",
  Common: "text-gray-400",
};

export function WearableExplorerFilters({ filters, setFilters, resetFilters, mode }: Props) {
  const [openSections, setOpenSections] = useState<Section[]>(["slots", "rarity"]);

  const toggleSection = (section: Section) => {
    setOpenSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const isOpen = (section: Section) => openSections.includes(section);

  const toggleSlot = (slotIndex: number) => {
    const newSlots = filters.slots.includes(slotIndex)
      ? filters.slots.filter((s) => s !== slotIndex)
      : [...filters.slots, slotIndex];
    setFilters({ slots: newSlots });
  };

  const toggleRarity = (rarity: string) => {
    const newRarities = filters.rarityTiers.includes(rarity)
      ? filters.rarityTiers.filter((r) => r !== rarity)
      : [...filters.rarityTiers, rarity];
    setFilters({ rarityTiers: newRarities });
  };

  const toggleSet = (setId: string) => {
    const newSets = filters.sets.includes(setId)
      ? filters.sets.filter((s) => s !== setId)
      : [...filters.sets, setId];
    setFilters({ sets: newSets });
  };

  const setsArray = (setsData as { sets: Array<{ name: string; id?: string }> }).sets;

  const activeCount =
    filters.slots.length +
    filters.rarityTiers.length +
    filters.sets.length +
    (filters.nrgMin || filters.nrgMax ? 1 : 0) +
    (filters.aggMin || filters.aggMax ? 1 : 0) +
    (filters.spkMin || filters.spkMax ? 1 : 0) +
    (filters.brnMin || filters.brnMax ? 1 : 0) +
    (filters.positiveModsOnly ? 1 : 0) +
    (filters.negativeModsOnly ? 1 : 0) +
    (filters.quantityMin || filters.quantityMax ? 1 : 0) +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.hasSetBonus !== null ? 1 : 0) +
    (filters.statModifyingOnly !== null ? 1 : 0);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-foreground">Filters</span>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />
            Clear ({activeCount})
          </Button>
        )}
      </div>

      <button
        onClick={() => toggleSection("slots")}
        className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
      >
        {isOpen("slots") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Slot
      </button>
      {isOpen("slots") && (
        <div className="pl-5 space-y-1">
          {SLOT_NAMES_EXPLORER.map((slot, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={filters.slots.includes(i)}
                onCheckedChange={() => toggleSlot(i)}
              />
              <span className="text-xs">{slot}</span>
            </label>
          ))}
        </div>
      )}

      <button
        onClick={() => toggleSection("rarity")}
        className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
      >
        {isOpen("rarity") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Rarity
      </button>
      {isOpen("rarity") && (
        <div className="pl-5 space-y-1">
          {RARITY_TIERS.map((tier) => (
            <label key={tier.name} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={filters.rarityTiers.includes(tier.name)}
                onCheckedChange={() => toggleRarity(tier.name)}
              />
              <span className={`text-xs ${RARITY_COLORS[tier.name]}`}>{tier.name}</span>
            </label>
          ))}
        </div>
      )}

      <button
        onClick={() => toggleSection("traits")}
        className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
      >
        {isOpen("traits") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Trait Modifiers
      </button>
      {isOpen("traits") && (
        <div className="pl-5 space-y-2">
          {["NRG", "AGG", "SPK", "BRN"].map((trait) => {
            const key = trait.toLowerCase() as "nrg" | "agg" | "spk" | "brn";
            return (
              <div key={trait} className="flex items-center gap-1">
                <span className="text-xs w-8">{trait}</span>
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters[`${key}Min`]}
                  onChange={(e) => setFilters({ [`${key}Min`]: e.target.value })}
                  className="h-6 w-14 text-xs"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters[`${key}Max`]}
                  onChange={(e) => setFilters({ [`${key}Max`]: e.target.value })}
                  className="h-6 w-14 text-xs"
                />
              </div>
            );
          })}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={filters.positiveModsOnly}
              onCheckedChange={(c) => setFilters({ positiveModsOnly: !!c })}
            />
            <span className="text-xs">Positive mods only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={filters.negativeModsOnly}
              onCheckedChange={(c) => setFilters({ negativeModsOnly: !!c })}
            />
            <span className="text-xs">Negative mods only</span>
          </label>
        </div>
      )}

      <button
        onClick={() => toggleSection("sets")}
        className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
      >
        {isOpen("sets") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Sets ({setsArray.length})
      </button>
      {isOpen("sets") && (
        <div className="pl-5 max-h-40 overflow-y-auto space-y-1">
          {setsArray.slice(0, 50).map((set, i) => {
            const setId = set.id || set.name;
            return (
              <label key={i} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={filters.sets.includes(setId)}
                  onCheckedChange={() => toggleSet(setId)}
                />
                <span className="text-xs truncate">{set.name}</span>
              </label>
            );
          })}
          {setsArray.length > 50 && (
            <div className="text-xs text-muted-foreground">+{setsArray.length - 50} more...</div>
          )}
        </div>
      )}

      {mode === "mine" && (
        <>
          <button
            onClick={() => toggleSection("quantity")}
            className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
          >
            {isOpen("quantity") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Quantity Owned
          </button>
          {isOpen("quantity") && (
            <div className="pl-5 flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min"
                value={filters.quantityMin}
                onChange={(e) => setFilters({ quantityMin: e.target.value })}
                className="h-6 w-16 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={filters.quantityMax}
                onChange={(e) => setFilters({ quantityMax: e.target.value })}
                className="h-6 w-16 text-xs"
              />
            </div>
          )}
        </>
      )}

      {mode === "baazaar" && (
        <>
          <button
            onClick={() => toggleSection("price")}
            className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
          >
            {isOpen("price") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Price (GHST)
          </button>
          {isOpen("price") && (
            <div className="pl-5 flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min"
                value={filters.priceMin}
                onChange={(e) => setFilters({ priceMin: e.target.value })}
                className="h-6 w-16 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={filters.priceMax}
                onChange={(e) => setFilters({ priceMax: e.target.value })}
                className="h-6 w-16 text-xs"
              />
            </div>
          )}
        </>
      )}

      <button
        onClick={() => toggleSection("quality")}
        className="flex items-center gap-1 w-full text-left font-medium text-muted-foreground hover:text-foreground"
      >
        {isOpen("quality") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Quality / Meta
      </button>
      {isOpen("quality") && (
        <div className="pl-5 space-y-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={filters.hasSetBonus === true}
              onCheckedChange={(c) => setFilters({ hasSetBonus: c ? true : null })}
            />
            <span className="text-xs">Has set bonus</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={filters.statModifyingOnly === true}
              onCheckedChange={(c) => setFilters({ statModifyingOnly: c ? true : null })}
            />
            <span className="text-xs">Stat-modifying only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={filters.statModifyingOnly === false}
              onCheckedChange={(c) => setFilters({ statModifyingOnly: c ? false : null })}
            />
            <span className="text-xs">Visual-only</span>
          </label>
        </div>
      )}
    </div>
  );
}
