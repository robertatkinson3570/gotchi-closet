import { describe, it, expect } from "vitest";
import {
  wearableVp,
  gotchiVp,
  realmVp,
  foldGotchiPage,
  foldItemOwnershipPage,
  foldParcelPage,
  emptyBucket,
  excludedAddressSet,
  EXCLUDED_WALLETS,
  SNAPSHOT_QUORUM_VP,
} from "./quorumVp";

describe("wearableVp", () => {
  it("matches the strategy price table incl. its irregular entries", () => {
    // regular rarity tiers
    expect(wearableVp(1)).toBe(5); // Camo Hat — Common
    expect(wearableVp(87)).toBe(10); // Uncommon
    expect(wearableVp(17)).toBe(10000); // Godlike
    // irregular literals in the table
    expect(wearableVp(127)).toBe(20);
    expect(wearableVp(129)).toBe(50);
    expect(wearableVp(212)).toBe(3000);
    // baadges are 0
    expect(wearableVp(163)).toBe(0);
    expect(wearableVp(197)).toBe(0);
  });

  it("returns 0 for empty slots and ids outside the table (Base-era items)", () => {
    expect(wearableVp(0)).toBe(0);
    expect(wearableVp(418)).toBe(0); // "Based Shirt" — not in the deployed table
    expect(wearableVp(9999)).toBe(0);
  });
});

describe("gotchiVp", () => {
  it("sums BRS plus equipped wearable values across all 16 slots", () => {
    // gotchi #100 fixture from the live core-base subgraph
    const equipped = [0, 0, 0, 87, 3, 0, 0, 210, 0, 0, 0, 0, 0, 0, 0, 0];
    // 503 BRS + 10 (id 87) + 5 (id 3) + 5 (id 210 Haunt1 BG)
    expect(gotchiVp(503, equipped)).toBe(523);
  });

  it("tolerates a non-finite BRS", () => {
    expect(gotchiVp(NaN, [1])).toBe(5);
  });
});

describe("realmVp", () => {
  it("uses the agip-17 size table", () => {
    expect(realmVp(0)).toBe(32);
    expect(realmVp(1)).toBe(128);
    expect(realmVp(2)).toBe(1028);
    expect(realmVp(3)).toBe(1028);
    expect(realmVp(4)).toBe(2048);
    expect(realmVp(9)).toBe(0);
  });
});

describe("page folders", () => {
  const excluded = new Set(["0xdao"]);

  it("foldGotchiPage routes excluded original owners to excludedVp", () => {
    const acc = foldGotchiPage(
      emptyBucket(),
      [
        { baseRarityScore: "500", equippedWearables: [1, 0], originalOwner: { id: "0xUser" } },
        { baseRarityScore: 400, equippedWearables: [], originalOwner: { id: "0xDAO" } },
        { baseRarityScore: 300, equippedWearables: [17], originalOwner: null },
      ],
      excluded
    );
    expect(acc.vp).toBe(505 + 10300); // owner-less rows count as votable
    expect(acc.excludedVp).toBe(400);
    expect(acc.count).toBe(3);
  });

  it("foldItemOwnershipPage multiplies balance by item value and skips 0-VP rows", () => {
    const acc = foldItemOwnershipPage(
      emptyBucket(),
      [
        { balance: "3", itemType: { id: "212" }, owner: "0xuser" }, // 3 × 3000
        { balance: "4017", itemType: { id: "197" }, owner: "0xvault" }, // baadge, 0 VP
        { balance: "10", itemType: { id: "1" }, owner: "0xDAO" }, // excluded owner
      ],
      excluded
    );
    expect(acc.vp).toBe(9000);
    expect(acc.excludedVp).toBe(50);
    expect(acc.count).toBe(2); // 0-VP row not counted
  });

  it("foldParcelPage counts sizes and honors exclusions", () => {
    const acc = foldParcelPage(
      emptyBucket(),
      [
        { size: "0", owner: { id: "0xuser" } },
        { size: 4, owner: { id: "0xDAO" } },
        { size: "2", owner: null },
      ],
      excluded
    );
    expect(acc.vp).toBe(32 + 1028);
    expect(acc.excludedVp).toBe(2048);
    expect(acc.count).toBe(3);
  });
});

describe("excluded wallet config", () => {
  it("stores addresses lowercased so set lookups match subgraph ids", () => {
    for (const w of EXCLUDED_WALLETS) {
      expect(w.address).toBe(w.address.toLowerCase());
      expect(w.address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("has no duplicate addresses", () => {
    expect(excludedAddressSet().size).toBe(EXCLUDED_WALLETS.length);
  });

  it("quorum constant matches the live space setting", () => {
    expect(SNAPSHOT_QUORUM_VP).toBe(7_200_000);
  });
});
