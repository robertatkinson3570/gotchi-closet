import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTopHolders, fetchOwnedWearableBalances } from "./wearableHolders";

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTopHolders", () => {
  it("maps owner/balance and preserves descending order", async () => {
    mockFetchOnce({
      data: {
        itemTypeOwnerships: [
          { owner: "0xaaa", balance: "12800" },
          { owner: "0xbbb", balance: "500" },
          { owner: "0xccc", balance: "10" },
        ],
      },
    });

    const rows = await fetchTopHolders(1);
    expect(rows).toEqual([
      { owner: "0xaaa", balance: 12800 },
      { owner: "0xbbb", balance: 500 },
      { owner: "0xccc", balance: 10 },
    ]);
  });

  it("throws on GraphQL errors", async () => {
    mockFetchOnce({ errors: [{ message: "boom" }] });
    await expect(fetchTopHolders(1)).rejects.toThrow("boom");
  });
});

describe("fetchOwnedWearableBalances", () => {
  it("lowercases the address and returns a Map keyed by numeric wearable id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            itemTypeOwnerships: [
              { itemType: { id: "228" }, balance: "3" },
              { itemType: { id: "212" }, balance: "1" },
            ],
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchOwnedWearableBalances("0xABCDEF0000000000000000000000000000ABCD");

    expect(map).toEqual(
      new Map([
        [228, 3],
        [212, 1],
      ])
    );
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.variables.owner).toBe("0xabcdef0000000000000000000000000000abcd");
  });

  it("throws on GraphQL errors", async () => {
    mockFetchOnce({ errors: [{ message: "boom" }] });
    await expect(fetchOwnedWearableBalances("0xabc")).rejects.toThrow("boom");
  });
});
