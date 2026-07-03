import { describe, expect, it } from "vitest";
import { cumulativeSlotArrays, equipOrder, sumLastDays, weekLabel } from "./shape";

describe("equipOrder", () => {
  it("returns worn slots in slot order, skipping empties", () => {
    const equipped = [10, 0, 22, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(equipOrder(equipped)).toEqual([
      { slot: 0, id: 10 },
      { slot: 2, id: 22 },
      { slot: 5, id: 7 },
    ]);
  });
});

describe("cumulativeSlotArrays", () => {
  it("builds one 16-slot array per step, each adding one wearable", () => {
    const order = [
      { slot: 0, id: 10 },
      { slot: 2, id: 22 },
    ];
    const arrays = cumulativeSlotArrays(order);
    expect(arrays).toHaveLength(2);
    expect(arrays[0][0]).toBe(10);
    expect(arrays[0][2]).toBe(0);
    expect(arrays[1][0]).toBe(10);
    expect(arrays[1][2]).toBe(22);
    expect(arrays[1]).toHaveLength(16);
  });
});

describe("sumLastDays", () => {
  it("sums the trailing N points of a series", () => {
    const series = [
      { day: "2026-06-25", value: 1 },
      { day: "2026-06-26", value: 2 },
      { day: "2026-06-27", value: 3 },
    ];
    expect(sumLastDays(series, 2)).toBe(5);
    expect(sumLastDays(series, 10)).toBe(6);
    expect(sumLastDays(undefined, 7)).toBe(0);
  });
});

describe("weekLabel", () => {
  it("formats a 7-day window ending at the given ms timestamp", () => {
    expect(weekLabel(Date.UTC(2026, 6, 3))).toBe("JUN 27 – JUL 3");
  });
});
