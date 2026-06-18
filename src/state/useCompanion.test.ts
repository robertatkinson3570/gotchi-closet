import { describe, expect, it, beforeEach } from "vitest";
import { useCompanion, pickDefaultTokenId } from "./useCompanion";
import type { Gotchi } from "@/types";

const g = (id: string, brs: number): Gotchi => ({
  id, name: `G${id}`, numericTraits: [50,50,50,50,0,0], equippedWearables: [],
  withSetsRarityScore: brs,
} as Gotchi);

describe("pickDefaultTokenId", () => {
  it("chooses the highest-BRS gotchi", () => {
    expect(pickDefaultTokenId([g("1", 500), g("2", 650), g("3", 480)])).toBe("2");
  });
  it("returns null for an empty list", () => {
    expect(pickDefaultTokenId([])).toBeNull();
  });
});

describe("useCompanion", () => {
  beforeEach(() => useCompanion.setState({ selectedTokenId: null, isOpen: false, draft: "" }));
  it("sets selection and toggles open", () => {
    useCompanion.getState().setSelected("4821");
    expect(useCompanion.getState().selectedTokenId).toBe("4821");
    useCompanion.getState().toggleOpen();
    expect(useCompanion.getState().isOpen).toBe(true);
  });
});
