import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchIncentives, fetchScorecard, fetchSellerSales } from "./gbmEarnings";

function mockFetchOnce(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ data }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchIncentives", () => {
  it("lowercases the address variable and converts wei to GHST", async () => {
    const fetchMock = mockFetchOnce({
      incentives: [
        { earner: "0xABC", amount: "1500000000000000000", receiveTime: "1782901185", tokenId: "4879", contractAddress: "0xDEF", auctionID: "6271" },
      ],
    });

    const rows = await fetchIncentives("0xABCDEF0000000000000000000000000000000000");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.variables.a).toBe("0xabcdef0000000000000000000000000000000000");

    expect(rows).toEqual([
      { amountGhst: 1.5, receiveTime: 1782901185, tokenId: "4879", contractAddress: "0xdef", auctionId: "6271" },
    ]);
  });

  it("returns an empty array when there are no incentives", async () => {
    mockFetchOnce({ incentives: [] });
    const rows = await fetchIncentives("0xabc");
    expect(rows).toEqual([]);
  });
});

describe("fetchScorecard", () => {
  it("returns null when the wallet has no GBM history", async () => {
    mockFetchOnce({ user: null });
    const scorecard = await fetchScorecard("0xabc");
    expect(scorecard).toBeNull();
  });

  it("maps bids/outbids/wins/payoutAmount/totalAuctionsCreated", async () => {
    mockFetchOnce({
      user: { id: "0xabc", bids: "36", outbids: "32", wins: "4", payoutAmount: "3638770945368385000000", totalAuctionsCreated: "1" },
    });
    const scorecard = await fetchScorecard("0xabc");
    expect(scorecard?.bids).toBe(36);
    expect(scorecard?.outbids).toBe(32);
    expect(scorecard?.wins).toBe(4);
    expect(scorecard?.auctionsCreated).toBe(1);
    expect(scorecard?.payoutGhst).toBeCloseTo(3638.770945368385, 6);
  });
});

describe("fetchSellerSales", () => {
  it("maps all four fee fields from wei to GHST", async () => {
    mockFetchOnce({
      auctions: [
        {
          id: "6208",
          type: "erc1155",
          tokenId: "1000000027",
          contractAddress: "0x50AF",
          endsAt: "1781268410",
          sellerProceeds: "960000000000000000",
          platformFees: "30000000000000000",
          gbmFees: "10000000000000000",
          royaltyFees: "0",
        },
      ],
    });

    const sales = await fetchSellerSales("0xabc");

    expect(sales).toEqual([
      {
        auctionId: "6208",
        tokenId: "1000000027",
        contractAddress: "0x50af",
        type: "erc1155",
        endsAt: 1781268410,
        proceedsGhst: 0.96,
        platformFeesGhst: 0.03,
        gbmFeesGhst: 0.01,
        royaltyFeesGhst: 0,
      },
    ]);
  });
});
