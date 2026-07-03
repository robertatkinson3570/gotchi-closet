/**
 * Pulse orchestration: one-time backfill into SQLite, nightly re-settle +
 * snapshots, and an in-memory payload cache. Quorum-style: /api/pulse serves
 * 202 while the first backfill runs, then always the cached payload.
 */
import {
  addDays, bucketClaims, bucketLendings, bucketProposals, bucketSales, dayKey, dayStartTs, summarizeEngagement,
} from "../../src/lib/pulse/aggregate";
import { buildPulsePayload, type PulsePayload } from "../../src/lib/pulse/payload";
import { getAllSeries, getMeta, setMeta, upsertMetrics } from "./store";
import {
  fetchChanneledCount, fetchClaims, fetchDaoSnapshots, fetchEngagementScan, fetchLendings, fetchLlamaDaily,
  fetchProposalsHistory, fetchSales1155, fetchSales721, fetchSalesGbm, fetchSnapshots,
} from "./sources";

/** Day-aligned start of history. Predates Base Baazaar activity; earlier pages are empty. */
const BACKFILL_START_TS = Math.floor(Date.UTC(2024, 11, 1) / 1000); // 2024-12-01T00:00Z

let payload: PulsePayload | null = null;
let building = false;
/** Set when the store is unusable (e.g. unwritable data dir) — pulse serves 202 forever instead of crashing the API. */
let disabled = false;

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

/** Phase 2 (engagement) backfill: daily summons history. Runs once, additively —
 * existing deployments with a v1 pulse.db pick it up on next boot. */
async function backfillEngagement(): Promise<void> {
  console.log("[pulse] engagement backfill starting");
  const endTs = Math.floor(Date.now() / 1000);
  upsertMetrics(bucketClaims(await fetchClaims(BACKFILL_START_TS - 1, endTs)));
  upsertMetrics(summarizeEngagement(await fetchEngagementScan(), endTs));
  setMeta("backfilled_engagement", "1");
  rebuildPayload();
  console.log("[pulse] engagement backfill complete");
}

/** Phase 3+4 backfill: lending history + DAO proposal turnout. Runs once, additively. */
async function backfillPhase3(): Promise<void> {
  console.log("[pulse] lending/DAO backfill starting");
  const now = Math.floor(Date.now() / 1000);
  upsertMetrics(bucketLendings(await fetchLendings(BACKFILL_START_TS - 1, now)));
  upsertMetrics(bucketProposals(await fetchProposalsHistory(BACKFILL_START_TS - 1)));
  upsertMetrics(await fetchChanneledCount(now));
  upsertMetrics(await fetchDaoSnapshots(now));
  setMeta("backfilled_phase3", "1");
  rebuildPayload();
  console.log("[pulse] lending/DAO backfill complete");
}

/** Run any missing additive backfills (v1 DBs upgrade themselves on boot). */
async function topUpBackfills(): Promise<void> {
  if (!getMeta("backfilled_engagement")) await backfillEngagement();
  if (!getMeta("backfilled_phase3")) await backfillPhase3();
}

/** Re-settle the last 3 full days (late GBM claims etc.) + today's snapshots. */
export async function nightlyRefresh(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const today = dayKey(now);
  const startTs = dayStartTs(addDays(today, -3)) - 1;
  await ingestSales(startTs);
  upsertMetrics(await fetchLlamaDaily(dayStartTs(addDays(today, -7))));
  upsertMetrics(await fetchSnapshots());
  upsertMetrics(bucketClaims(await fetchClaims(startTs, now)));
  upsertMetrics(summarizeEngagement(await fetchEngagementScan(), now));
  upsertMetrics(bucketLendings(await fetchLendings(startTs, now)));
  upsertMetrics(bucketProposals(await fetchProposalsHistory(dayStartTs(addDays(today, -30)))));
  upsertMetrics(await fetchChanneledCount(now));
  upsertMetrics(await fetchDaoSnapshots(now));
  rebuildPayload();
  console.log("[pulse] nightly refresh complete");
}

/** Boot entry: instant payload from disk when backfilled; else background backfill. */
export function ensureStarted(): void {
  if (payload || building || disabled) return;
  try {
    if (getMeta("backfilled")) {
      rebuildPayload();
      // Older DBs lack the newer families — top up in the background, non-blocking.
      topUpBackfills().catch((err) => console.error("[pulse] top-up backfill failed:", err));
      return;
    }
  } catch (err) {
    // Never let pulse storage take the whole API down (e.g. EACCES on ./data).
    disabled = true;
    console.error("[pulse] store unavailable — pulse disabled:", err);
    return;
  }
  building = true;
  backfill()
    .then(() => topUpBackfills())
    .catch((err) => console.error("[pulse] backfill failed:", err))
    .finally(() => {
      building = false;
    });
}

export function getPulse(): { payload: PulsePayload | null; building: boolean } {
  if (!payload && !building) ensureStarted();
  return { payload, building: !payload };
}
