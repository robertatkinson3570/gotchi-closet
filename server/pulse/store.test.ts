import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-test-"));
  process.env.PULSE_DB_PATH = path.join(dir, "pulse.db");
});

afterEach(async () => {
  const { closeDb } = await import("./store");
  closeDb();
  delete process.env.PULSE_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("pulse store", () => {
  it("upserts idempotently and returns day-sorted series", async () => {
    const { upsertMetrics, getAllSeries } = await import("./store");
    upsertMetrics([
      { day: "2026-07-02", metric: "sales_volume_ghst", value: 10 },
      { day: "2026-07-01", metric: "sales_volume_ghst", value: 5 },
      { day: "2026-07-01", metric: "sales_count", value: 1 },
    ]);
    // Same (day, metric) again with a corrected value → overwrites, no dup
    upsertMetrics([{ day: "2026-07-01", metric: "sales_volume_ghst", value: 7 }]);
    const all = getAllSeries();
    expect(all.sales_volume_ghst).toEqual([
      { day: "2026-07-01", value: 7 },
      { day: "2026-07-02", value: 10 },
    ]);
    expect(all.sales_count).toEqual([{ day: "2026-07-01", value: 1 }]);
  });

  it("stores and reads meta keys", async () => {
    const { getMeta, setMeta } = await import("./store");
    expect(getMeta("backfilled")).toBeNull();
    setMeta("backfilled", "1");
    setMeta("backfilled", "2");
    expect(getMeta("backfilled")).toBe("2");
  });
});
