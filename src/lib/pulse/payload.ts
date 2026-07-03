/**
 * Assembles the /api/pulse response from stored daily series: derived series
 * (USD volume, average sale, approx mcap), latest values, WoW/MoM deltas,
 * 30d window sums, verdicts, and tracking-since dates. Pure — tested.
 */
import { addDays, computeDelta, dayKey, levelAt, sumRange, type PulsePoint } from "./aggregate";
import { evaluateVerdicts, type PulseVerdict, type SeriesMap } from "./verdicts";

export type PulseDelta = { wow: number | null; mom: number | null };
export type PulsePayload = {
  updatedAt: number;
  series: SeriesMap;
  latest: Record<string, number>;
  deltas: Record<string, PulseDelta>;
  windows: Record<string, number>;
  verdicts: PulseVerdict[];
  trackingSince: Record<string, string>;
};

const FLOW_METRICS = new Set([
  "sales_volume_ghst", "sales_volume_usd", "sales_count", "sales_buyers", "sales_sellers",
  "sales_ghst_gotchis", "sales_ghst_parcels", "sales_ghst_wearables", "sales_ghst_other",
  "gotchis_summoned",
]);

/**
 * Flow series store rows only for days with activity; a chart would interpolate
 * across the holes. Zero means zero — fill every missing day through the last
 * complete day (yesterday relative to endDay) so quiet spells render honestly.
 */
function zeroFillDaily(s: PulsePoint[], endDay: string): PulsePoint[] {
  if (s.length === 0) return s;
  const lastComplete = addDays(endDay, -1);
  const lastDay = s[s.length - 1].day > lastComplete ? s[s.length - 1].day : lastComplete;
  const byDay = new Map(s.map((p) => [p.day, p.value]));
  const out: PulsePoint[] = [];
  for (let d = s[0].day; d <= lastDay; d = addDays(d, 1)) {
    out.push({ day: d, value: byDay.get(d) ?? 0 });
  }
  return out;
}

export function buildPulsePayload(stored: SeriesMap, updatedAt: number): PulsePayload {
  const endDayForFill = dayKey(Math.floor(updatedAt / 1000));
  const series: SeriesMap = { ...stored };
  for (const key of Object.keys(series)) {
    if (FLOW_METRICS.has(key)) series[key] = zeroFillDaily(series[key], endDayForFill);
  }
  const price = stored.ghst_price_usd ?? [];
  const vol = series.sales_volume_ghst ?? [];

  // Derived series. Historical USD uses that day's stored price, never spot.
  series.sales_volume_usd = vol.map((p) => ({ day: p.day, value: p.value * (levelAt(price, p.day) ?? 0) }));
  const countByDay = new Map((stored.sales_count ?? []).map((p) => [p.day, p.value]));
  series.sales_avg_ghst = vol.map((p) => {
    const c = countByDay.get(p.day) ?? 0;
    return { day: p.day, value: c > 0 ? p.value / c : 0 };
  });
  const supply = lastValue(stored.ghst_supply);
  if (supply != null) {
    // Approximate: today's supply applied across history (supply snapshots only accrue forward).
    series.ghst_mcap_usd = price.map((p) => ({ day: p.day, value: p.value * supply }));
  }

  const endDay = dayKey(Math.floor(updatedAt / 1000));
  const latest: Record<string, number> = {};
  const deltas: Record<string, PulseDelta> = {};
  const trackingSince: Record<string, string> = {};
  for (const [key, s] of Object.entries(series)) {
    if (s.length === 0) continue;
    latest[key] = s[s.length - 1].value;
    trackingSince[key] = s[0].day;
    const mode = FLOW_METRICS.has(key) ? ("flow" as const) : ("level" as const);
    deltas[key] = {
      wow: computeDelta(s, mode, 7, endDay),
      mom: computeDelta(s, mode, 30, endDay),
    };
  }

  const from30 = addDays(endDay, -30);
  const windows: Record<string, number> = {
    sales_volume_ghst_30d: sumRange(series.sales_volume_ghst ?? [], from30, endDay),
    sales_volume_usd_30d: sumRange(series.sales_volume_usd ?? [], from30, endDay),
    sales_count_30d: sumRange(series.sales_count ?? [], from30, endDay),
    sales_buyers_30d: sumRange(series.sales_buyers ?? [], from30, endDay),
    gotchis_summoned_30d: sumRange(series.gotchis_summoned ?? [], from30, endDay),
  };

  return { updatedAt, series, latest, deltas, windows, verdicts: evaluateVerdicts(series, endDay), trackingSince };
}

function lastValue(s: PulsePoint[] | undefined): number | null {
  return s && s.length ? s[s.length - 1].value : null;
}
