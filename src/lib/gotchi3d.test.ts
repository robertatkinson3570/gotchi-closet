import { describe, expect, it } from "vitest";
import { gotchi3dHash, gotchi3dHashes } from "./gotchi3d";

// All expected hashes below were verified to EXIST on the render CDN via
// POST www.aavegotchi.com/api/renderer/batch {verify:true} on 2026-07-09.
describe("gotchi3dHashes", () => {
  it("derives the naked anchor (#19634, amWMATIC)", () => {
    expect(
      gotchi3dHash({
        collateral: "0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4",
        hauntId: 2,
        numericTraits: [75, 11, 108, 79, 7, 98],
        equippedWearables: [],
      })
    ).toBe("Polygon-RareLow3-Mythical_High-0-0-0-0-0-0-0");
  });

  it("covers both hand orderings when hands differ (#19095 cached right-left)", () => {
    const hashes = gotchi3dHashes({
      collateral: "0x1a13f4ca1d028320a707d99520abfefca3998b7f",
      hauntId: 2,
      numericTraits: [-5, 91, 8, 95, 0, 92],
      equippedWearables: [258, 260, 259, 161, 75, 17, 238, 0],
    });
    expect(hashes).toContain("USDC-MythicalLow1_H2-Rare_High-258-260-259-161-17-75-238");
    expect(hashes).toHaveLength(2);
  });

  it("covers both hand orderings when hands differ (#15995 cached left-right)", () => {
    const hashes = gotchi3dHashes({
      collateral: "0x60d55f02a771d515e077c9c2403a1ef324885cec",
      hauntId: 2,
      numericTraits: [92, 100, 7, 3, 19, 86],
      equippedWearables: [250, 371, 249, 245, 251, 6, 0, 0],
    });
    expect(hashes).toContain("USDT-UncommonLow2-Uncommon_High-250-371-249-245-251-6-0");
  });

  it("maps amWBTC (#23192 Kornholio, symmetric hands => single hash)", () => {
    const hashes = gotchi3dHashes({
      collateral: "0x5c2ed810328349100a66b82b78a1791b101c9d61",
      hauntId: 2,
      numericTraits: [88, -4, 1, 94, 66, 97],
      equippedWearables: [98, 378, 301, 97, 100, 100, 40, 0],
    });
    expect(hashes).toEqual(["wBTC-Common3-Rare_High-98-378-301-97-100-100-40"]);
  });

  it("returns [] for unknown collateral (fallback to 2D)", () => {
    expect(gotchi3dHashes({ collateral: "0xdead", hauntId: 1, numericTraits: [0, 0, 0, 0, 50, 50], equippedWearables: [] })).toEqual([]);
  });
});
