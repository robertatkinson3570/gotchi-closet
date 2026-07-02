import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchXpDropStatus } from "./xpDrops";

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchXpDropStatus", () => {
  it("joins claims onto drops by id (claimed=true with claimedAt)", async () => {
    mockFetchOnce({
      data: {
        xpdrops: [{ id: "0xabc", amount: "10", createdAt: "1700000000" }],
        claimedXPDrops: [{ drop: { id: "0xabc" }, createdAt: "1700000100" }],
      },
    });

    const result = await fetchXpDropStatus("123");

    expect(result).toEqual([
      { dropId: "0xabc", amount: 10, createdAt: 1700000000, claimed: true, claimedAt: 1700000100 },
    ]);
  });

  it("gives unclaimed drops claimed: false, claimedAt: null", async () => {
    mockFetchOnce({
      data: {
        xpdrops: [{ id: "0xdef", amount: "20", createdAt: "1700000200" }],
        claimedXPDrops: [],
      },
    });

    const result = await fetchXpDropStatus("456");

    expect(result).toEqual([
      { dropId: "0xdef", amount: 20, createdAt: 1700000200, claimed: false, claimedAt: null },
    ]);
  });

  it("throws on GraphQL errors", async () => {
    mockFetchOnce({ errors: [{ message: "boom" }] });

    await expect(fetchXpDropStatus("789")).rejects.toThrow("boom");
  });
});
