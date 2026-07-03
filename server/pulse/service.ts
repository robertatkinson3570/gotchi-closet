/**
 * Pulse orchestration: one-time backfill into SQLite, nightly re-settle +
 * snapshots, and an in-memory payload cache. Quorum-style: /api/pulse serves
 * 202 while the first backfill runs, then always the cached payload.
 */
import { addDays, bucketSales, dayKey, dayStartTs } from "../../src/lib/pulse/aggregate";
import { buildPulsePayload, type PulsePayload } from "../../src/lib/pulse/payload";
import { getAllSeries, getMeta, setMeta, upsertMetrics } from "./store";
import { fetchLlamaDaily, fetchSales1155, fetchSales721, fetchSalesGbm, fetchSnapshots } from "./sources";

/** Day-aligned start of history. Predates Base Baazaar activity; earlier pages are empty. */
const BACKFILL_START_TS = Math.floor(Date.UTC(2024, 11, 1) / 1000); // 2024-12-01T00:00Z

let payload: PulsePayload | null = null;
let building = false;

function rebuildPayload(): void {
  payload = buildPulsePayload(getAllSeries(), Date.now());
}

/** Regenerates full-day sale aggregates from startTs (must be day-aligned - 1). */
async function ingestSales(startTs: number): Promise<void> {
  const endTs = Math.floor(Date.now() / 1000);
  const [a, b, c] = await Promise.all([
    fetchSales721(startTs, endTs),
    fetchSales1155(startTs, endTs),
    fetchSalesGbm(startTs, endTs),
  ]);
  upsertMetrics(bucketSales([...a, ...b, ...c]));
}

async function backfill(): Promise<void> {
  console.log("[pulse] backfill starting");
  await ingestSales(BACKFILL_START_TS - 1);
  upsertMetrics(await fetchLlamaDaily(BACKFILL_START_TS));
  upsertMetrics(await fetchSnapshots());
  setMeta("backfilled", "1");
  rebuildPayload();
  console.log("[pulse] backfill complete");
}

/** Re-settle the last 3 full days (late GBM claims etc.) + today's snapshots. */
export async function nightlyRefresh(): Promise<void> {
  const today = dayKey(Math.floor(Date.now() / 1000));
  const startTs = dayStartTs(addDays(today, -3)) - 1;
  await ingestSales(startTs);
  upsertMetrics(await fetchLlamaDaily(dayStartTs(addDays(today, -7))));
  upsertMetrics(await fetchSnapshots());
  rebuildPayload();
  console.log("[pulse] nightly refresh complete");
}

/** Boot entry: instant payload from disk when backfilled; else background backfill. */
export function ensureStarted(): void {
  if (payload || building) return;
  if (getMeta("backfilled")) {
    rebuildPayload();
    return;
  }
  building = true;
  backfill()
    .catch((err) => console.error("[pulse] backfill failed:", err))
    .finally(() => {
      building = false;
    });
}

export function getPulse(): { payload: PulsePayload | null; building: boolean } {
  if (!payload && !building) ensureStarted();
  return { payload, building: !payload };
}
