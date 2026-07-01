import { describe, it, expect } from "vitest";
import { itemMetaSync, formatModifiers, RARITY_COLORS } from "@/lib/explorer/itemMeta";

describe("itemMetaSync", () => {
  it("resolves a known wearable (Jamaican Flag #110)", () => {
    const m = itemMetaSync(110)!;
    expect(m.name).toBe("Jamaican Flag");
    expect(m.rarity).toBe("Rare"); // rarityScoreModifier 5
    expect(m.slot).toBe("Hand L"); // slotPositions[4] + [5] → first equippable
    expect(m.modifiers).toEqual(["NRG -1", "AGG -2"]);
  });

  it("accepts string ids (subgraph token ids arrive as strings)", () => {
    expect(itemMetaSync("110")?.name).toBe("Jamaican Flag");
  });

  it("returns undefined for unknown ids (consumables come from remote merge)", () => {
    expect(itemMetaSync(126)).toBeUndefined();
  });

  it("exposes a color for every rarity tier", () => {
    for (const t of ["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Godlike"]) {
      expect(RARITY_COLORS[t]).toBeTruthy();
    }
  });
});

describe("formatModifiers", () => {
  it("keeps only non-zero traits with signed values", () => {
    expect(formatModifiers([1, 0, -2, 0, 3, 0])).toEqual(["NRG +1", "SPK -2", "EYS +3"]);
  });
  it("handles empty/garbage input", () => {
    expect(formatModifiers([])).toEqual([]);
    expect(formatModifiers(["x", null, undefined] as unknown[])).toEqual([]);
  });
});
