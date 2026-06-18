import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchGotchiState } from "./gotchiState";

afterEach(() => vi.unstubAllGlobals());

describe("fetchGotchiState", () => {
  it("maps subgraph fields to PersonalityInput", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { aavegotchi: {
        name: "SteelFang",
        numericTraits: [50, 50, 50, 96, 0, 0],
        modifiedNumericTraits: [50, 50, 50, 96, 0, 0],
        withSetsNumericTraits: [60, 50, 50, 96, 0, 0],
        kinship: "1240", level: "12", createdAt: "1700000000",
        equippedWearables: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      } } }),
    })) as any);

    const s = await fetchGotchiState("4821");
    expect(s).not.toBeNull();
    expect(s!.name).toBe("SteelFang");
    expect(s!.withSetsNumericTraits![0]).toBe(60);
    expect(s!.kinship).toBe(1240);
    expect(s!.level).toBe(12);
  });

  it("returns null when the gotchi is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { aavegotchi: null } }) })) as any);
    expect(await fetchGotchiState("999999")).toBeNull();
  });
});
