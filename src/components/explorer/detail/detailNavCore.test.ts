import { describe, it, expect } from "vitest";
import { navView, neighborId, atForwardEdge, adoptedId } from "./detailNavCore";

type Row = { id: string };
const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
const gid = (r: Row) => r.id;

describe("navView", () => {
  it("resolves open item + index + bounds for a middle item", () => {
    const v = navView(rows, gid, "wearable", "b");
    expect(v.open?.id).toBe("b");
    expect(v.index).toBe(1);
    expect(v.hasPrev).toBe(true);
    expect(v.hasNext).toBe(true);
    expect(v.shareUrl).toBe("?asset=wearable&id=b");
  });
  it("has no prev at the first item and no next at the last", () => {
    expect(navView(rows, gid, "x", "a").hasPrev).toBe(false);
    expect(navView(rows, gid, "x", "a").hasNext).toBe(true);
    expect(navView(rows, gid, "x", "c").hasNext).toBe(false);
    expect(navView(rows, gid, "x", "c").hasPrev).toBe(true);
  });
  it("returns a closed view (null) when nothing is open or id is absent", () => {
    const closed = navView(rows, gid, "x", null);
    expect(closed.open).toBeNull();
    expect(closed.index).toBe(-1);
    expect(closed.shareUrl).toBeNull();
    expect(navView(rows, gid, "x", "zzz").open).toBeNull();
  });
});

describe("neighborId", () => {
  it("returns the next / previous id", () => {
    expect(neighborId(rows, gid, "b", 1)).toBe("c");
    expect(neighborId(rows, gid, "b", -1)).toBe("a");
  });
  it("clamps at the bounds (null, no wrap)", () => {
    expect(neighborId(rows, gid, "c", 1)).toBeNull();
    expect(neighborId(rows, gid, "a", -1)).toBeNull();
  });
  it("returns null when nothing is open", () => {
    expect(neighborId(rows, gid, null, 1)).toBeNull();
  });
});

describe("atForwardEdge", () => {
  it("is true only on the last item when more can load", () => {
    expect(atForwardEdge(rows, gid, "c", true)).toBe(true);
    expect(atForwardEdge(rows, gid, "b", true)).toBe(false);
    expect(atForwardEdge(rows, gid, "c", false)).toBe(false);
    expect(atForwardEdge([], gid, "c", true)).toBe(false);
  });
});

describe("adoptedId", () => {
  it("adopts a present id for the matching asset", () => {
    expect(adoptedId("wearable", "c", "wearable", (id) => rows.some((r) => r.id === id))).toBe("c");
  });
  it("ignores a different asset or an absent id", () => {
    expect(adoptedId("gotchi", "c", "wearable", () => true)).toBeNull();
    expect(adoptedId("wearable", "zzz", "wearable", (id) => rows.some((r) => r.id === id))).toBeNull();
    expect(adoptedId("wearable", null, "wearable", () => true)).toBeNull();
  });
});
