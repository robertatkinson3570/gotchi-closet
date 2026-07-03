import { describe, expect, it } from "vitest";
import { computeOwnedCounts } from "@/state/selectors";
import type { Gotchi } from "@/types";

const g = (id: string, equipped: number[]): Gotchi =>
  ({ id, name: `G${id}`, numericTraits: [], equippedWearables: equipped } as unknown as Gotchi);

describe("owned counts (audit H4)", () => {
  it("adds wallet-held balances on top of equipped counts", () => {
    const gotchis = [g("1", [10, 0])];
    expect(computeOwnedCounts(gotchis, { 10: 2, 55: 1 })).toEqual({ 10: 3, 55: 1 });
  });

  it("defaults to equipped-only when no wallet map is given", () => {
    expect(computeOwnedCounts([g("1", [10, 10, 0])])).toEqual({ 10: 2 });
  });
});
