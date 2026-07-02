import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchOutfitsForOwner, fetchWardrobeHistory, fetchCurrentWearers } from "./wardrobe";

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOutfitsForOwner", () => {
  it("lowercases the owner address it sends and maps fields", async () => {
    const fetchMock = mockFetchOnce({
      data: {
        wearablesConfigs: [
          { id: "0xABC-11008-0", name: "Brs Opti", gotchiTokenId: "11008", wearables: [105, 295, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        ],
      },
    });

    const result = await fetchOutfitsForOwner("0xABCDEF0000000000000000000000000000000A");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables.owner).toBe("0xabcdef0000000000000000000000000000000a");

    expect(result).toEqual([
      { id: "0xABC-11008-0", name: "Brs Opti", gotchiTokenId: "11008", wearables: [105, 295, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
  });

  it("throws on subgraph errors", async () => {
    mockFetchOnce({ errors: [{ message: "boom" }] });
    await expect(fetchOutfitsForOwner("0xabc")).rejects.toThrow("boom");
  });
});

describe("fetchWardrobeHistory", () => {
  it("maps unequippedAt '0' to null and preserves order", async () => {
    mockFetchOnce({
      data: {
        equippedWearableOwners: [
          { wearableId: 246, slotPosition: 2, equippedAt: "1782932927", unequippedAt: null, isCurrentlyEquipped: true, isDelegated: false },
          { wearableId: 157, slotPosition: 1, equippedAt: "1782900000", unequippedAt: "0", isCurrentlyEquipped: false, isDelegated: false },
          { wearableId: 88, slotPosition: 0, equippedAt: "1782800000", unequippedAt: "1782850000", isCurrentlyEquipped: false, isDelegated: true },
        ],
      },
    });

    const result = await fetchWardrobeHistory("3044");

    expect(result).toEqual([
      { wearableId: 246, slotPosition: 2, equippedAt: 1782932927, unequippedAt: null, isCurrentlyEquipped: true, isDelegated: false },
      { wearableId: 157, slotPosition: 1, equippedAt: 1782900000, unequippedAt: null, isCurrentlyEquipped: false, isDelegated: false },
      { wearableId: 88, slotPosition: 0, equippedAt: 1782800000, unequippedAt: 1782850000, isCurrentlyEquipped: false, isDelegated: true },
    ]);
  });

  it("throws on subgraph errors", async () => {
    mockFetchOnce({ errors: [{ message: "kaboom" }] });
    await expect(fetchWardrobeHistory("3044")).rejects.toThrow("kaboom");
  });
});

describe("fetchCurrentWearers", () => {
  it("maps gotchiId + equippedAt", async () => {
    mockFetchOnce({
      data: {
        equippedWearableOwners: [
          { gotchiId: "3044", equippedAt: "1782932927" },
          { gotchiId: "9001", equippedAt: "1782900000" },
        ],
      },
    });

    const result = await fetchCurrentWearers(246);

    expect(result).toEqual([
      { gotchiId: "3044", equippedAt: 1782932927 },
      { gotchiId: "9001", equippedAt: 1782900000 },
    ]);
  });

  it("throws on subgraph errors", async () => {
    mockFetchOnce({ errors: [{ message: "nope" }] });
    await expect(fetchCurrentWearers(246)).rejects.toThrow("nope");
  });
});
