import { describe, expect, it } from "vitest";
import { parseSetDefinition } from "./sets";

describe("set definition validation", () => {
  it("fails when traitBonuses length is not 6", () => {
    const raw = {
      id: "bad-length",
      name: "Bad Length",
      wearableIds: [1, 2],
      traitBonuses: [1, 0, 0, 0, 0],
      setBonusBRS: 1,
    };
    expect(() => parseSetDefinition(raw as any)).toThrow(
      /traitBonuses length must be 6/
    );
  });

  it("fails when eye bonuses are non-zero", () => {
    const raw = {
      id: "bad-eyes",
      name: "Bad Eyes",
      wearableIds: [1, 2],
      traitBonuses: [1, 0, 0, 0, 1, 0],
      setBonusBRS: 1,
    };
    expect(() => parseSetDefinition(raw as any)).toThrow(
      /eye trait bonuses must be 0/
    );
  });

  it("fails when setBonusBRS is missing", () => {
    const raw = {
      id: "missing-bonus",
      name: "Missing Bonus",
      wearableIds: [1, 2],
      traitBonuses: [1, 0, 0, 0, 0, 0],
    };
    expect(() => parseSetDefinition(raw as any)).toThrow(
      /setBonusBRS missing or invalid/
    );
  });
});

describe("set trait order mapping", () => {
  it("maps traitBonuses indices to core traits", () => {
    const raw = {
      id: "order-test",
      name: "Order Test",
      wearableIds: [1, 2],
      traitBonuses: [1, 2, 3, 4, 0, 0],
      setBonusBRS: 1,
    };
    const parsed = parseSetDefinition(raw as any);
    expect(parsed.traitModifiers).toEqual({
      nrg: 1,
      agg: 2,
      spk: 3,
      brn: 4,
    });
  });
});

