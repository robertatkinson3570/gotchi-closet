import { describe, expect, it } from "vitest";
import { buildPulsePayload } from "./payload";
import type { SeriesMap } from "./verdicts";

const UPDATED_AT = Date.UTC(2026, 6, 2, 12); // endDay = 2026-07-02

const stored: SeriesMap = {
  ghst_price_usd: [
    { day: "2026-06-29", value: 0.5 },
    { day: "2026-07-01", value: 0.6 },
  ],
  sales_volume_ghst: [
    { day: "2026-06-30", value: 1000 },
    { day: "2026-07-01", value: 2000 },
  ],
  sales_count: [
    { day: "2026-06-30", value: 10 },
    { day: "2026-07-01", value: 0 },
  ],
  ghst_supply: [{ day: "2026-07-01", value: 50_000_000 }],
};

describe("buildPulsePayload", () => {
  const p = buildPulsePayload(stored, UPDATED_AT);

  it("derives per-day USD volume from that day's price", () => {
    expect(p.series.sales_volume_usd).toEqual([
      { day: "2026-06-30", value: 1000 * 0.5 }, // levelAt: 06-29 price carries forward
      { day: "2026-07-01", value: 2000 * 0.6 },
    ]);
  });

  it("derives average sale price, guarding division by zero", () => {
    expect(p.series.sales_avg_ghst).toEqual([
      { day: "2026-06-30", value: 100 },
      { day: "2026-07-01", value: 0 },
    ]);
  });

  it("derives approximate mcap from price × latest supply", () => {
    expect(p.series.ghst_mcap_usd?.[1].value).toBeCloseTo(0.6 * 50_000_000);
  });

  it("exposes latest values and trackingSince", () => {
    expect(p.latest.ghst_price_usd).toBe(0.6);
    expect(p.trackingSince.sales_volume_ghst).toBe("2026-06-30");
  });

  it("computes 30d windows over complete days", () => {
    expect(p.windows.sales_volume_ghst_30d).toBe(3000);
    expect(p.windows.sales_count_30d).toBe(10);
  });

  it("includes verdicts and updatedAt", () => {
    expect(p.verdicts.length).toBeGreaterThan(0);
    expect(p.updatedAt).toBe(UPDATED_AT);
  });

  it("zero-fills gaps in flow series so charts never interpolate quiet days", () => {
    const gappy = buildPulsePayload(
      { gotchis_summoned: [{ day: "2026-06-27", value: 2 }] },
      UPDATED_AT // endDay 2026-07-02 → filled through 2026-07-01
    );
    expect(gappy.series.gotchis_summoned).toEqual([
      { day: "2026-06-27", value: 2 },
      { day: "2026-06-28", value: 0 },
      { day: "2026-06-29", value: 0 },
      { day: "2026-06-30", value: 0 },
      { day: "2026-07-01", value: 0 },
    ]);
    // Level series are never zero-filled — gaps carry the last value instead.
    const level = buildPulsePayload({ ghst_holders: [{ day: "2026-06-27", value: 5 }] }, UPDATED_AT);
    expect(level.series.ghst_holders).toEqual([{ day: "2026-06-27", value: 5 }]);
  });
});
