import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPriceHistory } from "./priceHistory";

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchPriceHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps wei strings to GHST numbers in order", async () => {
    mockFetchOnce({
      data: {
        aavegotchi: {
          historicalPrices: ["200000000000000000000", "335000000000000000000"],
          timesTraded: "2",
        },
      },
    });

    const result = await fetchPriceHistory("gotchi", "4552");

    expect(result).toEqual({ pricesGhst: [200, 335], timesTraded: 2 });
  });

  it("returns null for missing entity", async () => {
    mockFetchOnce({ data: { aavegotchi: null } });

    const result = await fetchPriceHistory("gotchi", "999999");

    expect(result).toBeNull();
  });

  it("returns null for empty historicalPrices", async () => {
    mockFetchOnce({
      data: { aavegotchi: { historicalPrices: [], timesTraded: "0" } },
    });

    const result = await fetchPriceHistory("gotchi", "1");

    expect(result).toBeNull();
  });

  it("picks the right entity name per kind", async () => {
    const fetchMock = mockFetchOnce({
      data: { portal: { historicalPrices: ["1000000000000000000"], timesTraded: "1" } },
    });

    await fetchPriceHistory("portal", "42");

    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((options as RequestInit).body as string);
    expect(sentBody.query).toContain("portal(id: $id)");
    expect(sentBody.variables).toEqual({ id: "42" });
  });

  it("throws on GraphQL errors", async () => {
    mockFetchOnce({ errors: [{ message: "boom" }] });

    await expect(fetchPriceHistory("gotchi", "1")).rejects.toThrow("boom");
  });
});
