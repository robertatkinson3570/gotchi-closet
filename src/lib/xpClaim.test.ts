import { describe, it, expect, vi } from "vitest";
import {
  findGotchiLeaf,
  buildClaimArgs,
  resolveGotchiClaim,
  dropFileUrl,
  getAddressEntry,
  resolveAddressClaim,
  buildBatchClaimArgs,
  type XpDropData,
  type XpDropTree,
} from "./xpClaim";

const DATA: XpDropData = {
  "0xaaa": { address: "0xaaa", gotchiIds: ["10", "20", "30"] },
  "0xbbb": { address: "0xbbb", gotchiIds: ["40", "50"] },
};
const TREE: XpDropTree = {
  "0xaaa": { leaf: "0xleafa", proof: ["0xp1", "0xp2"] },
  "0xbbb": { leaf: "0xleafb", proof: ["0xp3"] },
};

describe("findGotchiLeaf", () => {
  it("finds the leaf whose gotchi list contains the id", () => {
    expect(findGotchiLeaf(DATA, "20")).toEqual({ claimer: "0xaaa", gotchiIds: ["10", "20", "30"] });
    expect(findGotchiLeaf(DATA, "40")).toEqual({ claimer: "0xbbb", gotchiIds: ["40", "50"] });
  });

  it("matches numeric ids passed as strings either way", () => {
    expect(findGotchiLeaf(DATA, String(30))).toEqual({ claimer: "0xaaa", gotchiIds: ["10", "20", "30"] });
  });

  it("returns null when no leaf contains the gotchi", () => {
    expect(findGotchiLeaf(DATA, "999")).toBeNull();
  });
});

describe("buildClaimArgs", () => {
  it("emits the claimXPDrop tuple with bigint ids and empty subset arrays", () => {
    const args = buildClaimArgs({
      propId: "0xdrop",
      claimer: "0xaaa",
      gotchiIds: ["10", "20", "30"],
      proof: ["0xp1", "0xp2"],
    });
    expect(args).toEqual(["0xdrop", "0xaaa", [10n, 20n, 30n], ["0xp1", "0xp2"], [], []]);
  });

  it("preserves gotchi-id order (the leaf preimage must match exactly)", () => {
    const args = buildClaimArgs({ propId: "0xd", claimer: "0xb", gotchiIds: ["50", "40"], proof: [] });
    expect(args[2]).toEqual([50n, 40n]);
  });
});

describe("resolveGotchiClaim", () => {
  function fetchStub(dataBody: unknown, treeBody: unknown, ok = true) {
    return vi.fn(async (url: string) => ({
      ok,
      json: async () => (url.endsWith("data.json") ? dataBody : treeBody),
    })) as unknown as typeof fetch;
  }

  it("joins data + tree and returns the claim for the gotchi", async () => {
    const claim = await resolveGotchiClaim("0xDROP", "20", fetchStub(DATA, TREE));
    expect(claim).toEqual({ propId: "0xDROP", claimer: "0xaaa", gotchiIds: ["10", "20", "30"], proof: ["0xp1", "0xp2"] });
  });

  it("returns null when the gotchi is not in the drop (not eligible)", async () => {
    const claim = await resolveGotchiClaim("0xdrop", "999", fetchStub(DATA, TREE));
    expect(claim).toBeNull();
  });

  it("returns null when either file is missing (non-ok response)", async () => {
    const claim = await resolveGotchiClaim("0xdrop", "20", fetchStub(DATA, TREE, false));
    expect(claim).toBeNull();
  });

  it("lowercases the propId in the fetched path", async () => {
    const fetchImpl = fetchStub(DATA, TREE);
    await resolveGotchiClaim("0xABCD", "10", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(dropFileUrl("0xabcd", "data.json"));
  });
});

describe("getAddressEntry", () => {
  it("finds the entry case-insensitively", () => {
    expect(getAddressEntry(DATA, "0xAAA")).toEqual({ claimer: "0xaaa", gotchiIds: ["10", "20", "30"] });
    expect(getAddressEntry(DATA, "0xbbb")).toEqual({ claimer: "0xbbb", gotchiIds: ["40", "50"] });
  });

  it("returns null when the address is not in the drop", () => {
    expect(getAddressEntry(DATA, "0xccc")).toBeNull();
  });
});

describe("resolveAddressClaim", () => {
  function fetchStub(dataBody: unknown, treeBody: unknown, ok = true) {
    return vi.fn(async (url: string) => ({
      ok,
      json: async () => (url.endsWith("data.json") ? dataBody : treeBody),
    })) as unknown as typeof fetch;
  }

  it("resolves the address's claim (gotchi list + proof)", async () => {
    const claim = await resolveAddressClaim("0xdrop", "0xAAA", fetchStub(DATA, TREE));
    expect(claim).toEqual({ propId: "0xdrop", claimer: "0xaaa", gotchiIds: ["10", "20", "30"], proof: ["0xp1", "0xp2"] });
  });

  it("returns null when the address is not eligible", async () => {
    const claim = await resolveAddressClaim("0xdrop", "0xzzz", fetchStub(DATA, TREE));
    expect(claim).toBeNull();
  });
});

describe("buildBatchClaimArgs", () => {
  it("transposes many claims into parallel arrays for batchDropClaimXPDrop", () => {
    const args = buildBatchClaimArgs([
      { propId: "0xd1", claimer: "0xaaa", gotchiIds: ["10", "20"], proof: ["0xp1"] },
      { propId: "0xd2", claimer: "0xaaa", gotchiIds: ["30"], proof: ["0xp2", "0xp3"] },
    ]);
    expect(args).toEqual([
      ["0xd1", "0xd2"],
      ["0xaaa", "0xaaa"],
      [[10n, 20n], [30n]],
      [["0xp1"], ["0xp2", "0xp3"]],
      [[], []],
      [[], []],
    ]);
  });
});
