import { describe, it, expect } from "vitest";
import { buildListedMap } from "./ownedListings";

describe("buildListedMap", () => {
  it("indexes erc721 + erc1155 rows by tokenId, first (newest) wins", () => {
    const map = buildListedMap(
      [{ id: "L1", tokenId: "5", priceInWei: "1000000000000000000" }],
      [
        { id: "L2", erc1155TypeId: "42", priceInWei: "2000000000000000000" },
        { id: "L3", erc1155TypeId: "42", priceInWei: "3000000000000000000" }, // ignored (first wins)
      ],
    );
    expect(map["5"]).toEqual({ listingId: "L1", priceWei: "1000000000000000000" });
    expect(map["42"]).toEqual({ listingId: "L2", priceWei: "2000000000000000000" });
  });

  it("returns an empty map for no rows", () => {
    expect(buildListedMap([], [])).toEqual({});
  });
});
