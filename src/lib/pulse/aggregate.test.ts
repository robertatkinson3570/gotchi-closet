import { describe, expect, it } from "vitest";
import {
  addDays, bucketClaims, bucketSales, computeDelta, dayKey, dayStartTs, levelAt, pctChange,
  summarizeEngagement, sumRange,
  type PulsePoint, type SaleRow,
} from "./aggregate";

const ts = (y: number, mo: number, d: number, h = 12) => Math.floor(Date.UTC(y, mo - 1, d, h) / 1000);

describe("dayKey / addDays / dayStartTs", () => {
  it("buckets by UTC day and handles boundaries", () => {
    expect(dayKey(Math.floor(Date.UTC(2026, 0, 15, 23, 59, 59) / 1000))).toBe("2026-01-15");
    expect(dayKey(Math.floor(Date.UTC(2026, 0, 16, 0, 0, 0) / 1000))).toBe("2026-01-16");
  });
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("dayStartTs is midnight UTC", () => {
    expect(dayStartTs("2026-01-16")).toBe(Math.floor(Date.UTC(2026, 0, 16) / 1000));
  });
});

describe("bucketSales", () => {
  const rows: SaleRow[] = [
    { t: ts(2026, 6, 1), ghst: 100, cat: "gotchis", buyer: "0xA", seller: "0xB" },
    { t: ts(2026, 6, 1), ghst: 50, cat: "wearables", buyer: "0xa", seller: "0xC" }, // same buyer, different case
    { t: ts(2026, 6, 2), ghst: 10, cat: "other", buyer: "0xD", seller: "0xE" },
    { t: ts(2026, 6, 1), ghst: 0, cat: "gotchis", buyer: "0xF", seller: "0xG" }, // zero-price → skipped
  ];
  const out = bucketSales(rows);
  const get = (day: string, metric: string) => out.find((r) => r.day === day && r.metric === metric)?.value;

  it("sums volume and counts per UTC day", () => {
    expect(get("2026-06-01", "sales_volume_ghst")).toBe(150);
    expect(get("2026-06-01", "sales_count")).toBe(2);
    expect(get("2026-06-02", "sales_volume_ghst")).toBe(10);
  });
  it("dedupes buyers case-insensitively", () => {
    expect(get("2026-06-01", "sales_buyers")).toBe(1);
    expect(get("2026-06-01", "sales_sellers")).toBe(2);
  });
  it("splits volume by category", () => {
    expect(get("2026-06-01", "sales_ghst_gotchis")).toBe(100);
    expect(get("2026-06-01", "sales_ghst_wearables")).toBe(50);
    expect(get("2026-06-01", "sales_ghst_parcels")).toBe(0);
  });
  it("emits days in ascending order", () => {
    expect(out[0].day <= out[out.length - 1].day).toBe(true);
  });
});

describe("bucketClaims", () => {
  it("counts summons per UTC day", () => {
    const out = bucketClaims([ts(2026, 6, 1), ts(2026, 6, 1), ts(2026, 6, 3)]);
    expect(out).toEqual([
      { day: "2026-06-01", metric: "gotchis_summoned", value: 2 },
      { day: "2026-06-03", metric: "gotchis_summoned", value: 1 },
    ]);
  });
});

describe("summarizeEngagement", () => {
  it("computes totals, petted windows, and kinship stats for one day", () => {
    const now = ts(2026, 6, 10, 12);
    const rows = [
      { kinship: 100, lastInteracted: now - 3600 },        // petted 1h ago
      { kinship: 300, lastInteracted: now - 3 * 86400 },   // 3d ago → 7d only
      { kinship: 50, lastInteracted: now - 30 * 86400 },   // stale
      { kinship: 200, lastInteracted: now - 3600 },        // petted
    ];
    const out = summarizeEngagement(rows, now);
    const get = (m: string) => out.find((r) => r.metric === m)?.value;
    expect(out.every((r) => r.day === "2026-06-10")).toBe(true);
    expect(get("gotchis_total")).toBe(4);
    expect(get("gotchis_petted_24h")).toBe(2);
    expect(get("gotchis_petted_7d")).toBe(3);
    expect(get("kinship_avg")).toBeCloseTo((100 + 300 + 50 + 200) / 4);
    expect(get("kinship_median")).toBe(150); // even count → mean of middle two (100, 200)
  });

  it("returns empty for no gotchis", () => {
    expect(summarizeEngagement([], ts(2026, 6, 10))).toEqual([]);
  });
});

describe("pctChange / sumRange / levelAt", () => {
  it("pctChange handles zero prior", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(5, 0)).toBeNull();
  });
  const s: PulsePoint[] = [
    { day: "2026-06-01", value: 10 },
    { day: "2026-06-03", value: 20 },
    { day: "2026-06-05", value: 30 },
  ];
  it("sumRange is from-inclusive, to-exclusive", () => {
    expect(sumRange(s, "2026-06-01", "2026-06-05")).toBe(30);
    expect(sumRange(s, "2026-06-01", "2026-06-06")).toBe(60);
  });
  it("levelAt returns last value at-or-before the day (gap-tolerant)", () => {
    expect(levelAt(s, "2026-06-04")).toBe(20);
    expect(levelAt(s, "2026-05-31")).toBeNull();
  });
});

describe("computeDelta", () => {
  // 20 days of flow data: first 10 days value 10/day, last 10 days value 20/day
  const flow: PulsePoint[] = [];
  for (let i = 0; i < 20; i++) flow.push({ day: addDays("2026-06-01", i), value: i < 10 ? 10 : 20 });
  it("flow mode compares trailing windows", () => {
    // endDay 2026-06-21: last 10 days sum 200, prior 10 days sum 100 → +100%
    expect(computeDelta(flow, "flow", 10, "2026-06-21")).toBeCloseTo(100);
  });
  it("returns null when history is insufficient", () => {
    expect(computeDelta(flow, "flow", 30, "2026-06-21")).toBeNull();
    expect(computeDelta([], "flow", 7, "2026-06-21")).toBeNull();
  });
  it("level mode compares point values", () => {
    const level: PulsePoint[] = [
      { day: "2026-05-01", value: 100 },
      { day: "2026-06-01", value: 90 },
    ];
    expect(computeDelta(level, "level", 30, "2026-06-01")).toBeCloseTo(-10);
  });
});
