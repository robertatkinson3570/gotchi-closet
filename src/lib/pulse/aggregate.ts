/**
 * Pure day-bucketing + trend math for the Pulse (state-of-the-Aavegotchiverse)
 * pipeline. No I/O — the server half (server/pulse/) feeds and stores this.
 */

export type PulsePoint = { day: string; value: number };
export type MetricRow = { day: string; metric: string; value: number };
export type SaleCat = "gotchis" | "parcels" | "wearables" | "other";
export type SaleRow = { t: number; ghst: number; cat: SaleCat; buyer: string; seller: string };

/** UTC calendar day of a unix-seconds timestamp, as YYYY-MM-DD. */
export function dayKey(tSeconds: number): string {
  return new Date(tSeconds * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Unix seconds at 00:00:00 UTC of the given day. */
export function dayStartTs(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

/** Folds raw sales into per-UTC-day metric rows (see canonical metric keys). */
export function bucketSales(rows: SaleRow[]): MetricRow[] {
  type Agg = {
    volume: number; count: number;
    buyers: Set<string>; sellers: Set<string>;
    byCat: Record<SaleCat, number>;
  };
  const days = new Map<string, Agg>();
  for (const r of rows) {
    if (!(r.ghst > 0)) continue;
    const day = dayKey(r.t);
    let a = days.get(day);
    if (!a) {
      a = { volume: 0, count: 0, buyers: new Set(), sellers: new Set(), byCat: { gotchis: 0, parcels: 0, wearables: 0, other: 0 } };
      days.set(day, a);
    }
    a.volume += r.ghst;
    a.count += 1;
    if (r.buyer) a.buyers.add(r.buyer.toLowerCase());
    if (r.seller) a.sellers.add(r.seller.toLowerCase());
    a.byCat[r.cat] += r.ghst;
  }
  const out: MetricRow[] = [];
  for (const [day, a] of [...days.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    out.push({ day, metric: "sales_volume_ghst", value: a.volume });
    out.push({ day, metric: "sales_count", value: a.count });
    out.push({ day, metric: "sales_buyers", value: a.buyers.size });
    out.push({ day, metric: "sales_sellers", value: a.sellers.size });
    out.push({ day, metric: "sales_ghst_gotchis", value: a.byCat.gotchis });
    out.push({ day, metric: "sales_ghst_parcels", value: a.byCat.parcels });
    out.push({ day, metric: "sales_ghst_wearables", value: a.byCat.wearables });
    out.push({ day, metric: "sales_ghst_other", value: a.byCat.other });
  }
  return out;
}

export function pctChange(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

/** Sum of points with fromDay <= day < toDayExcl. Series must be day-keyed. */
export function sumRange(series: PulsePoint[], fromDay: string, toDayExcl: string): number {
  let s = 0;
  for (const p of series) if (p.day >= fromDay && p.day < toDayExcl) s += p.value;
  return s;
}

/** Last value at or before `day` (gap-tolerant); null if series starts later. */
export function levelAt(series: PulsePoint[], day: string): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (p.day <= day) v = p.value;
    else break;
  }
  return v;
}

/**
 * Percent change over a trailing window ending at endDay (exclusive — a
 * partial "today" never pollutes the math).
 *  - flow: sum of last `days` vs the prior `days`
 *  - level: value at endDay vs value `days` earlier
 * Returns null when the series doesn't reach back far enough.
 */
export function computeDelta(
  series: PulsePoint[],
  mode: "flow" | "level",
  days: number,
  endDay: string
): number | null {
  if (series.length === 0) return null;
  const first = series[0].day;
  if (mode === "flow") {
    const midDay = addDays(endDay, -days);
    const startDay = addDays(endDay, -2 * days);
    if (first > startDay) return null;
    return pctChange(sumRange(series, midDay, endDay), sumRange(series, startDay, midDay));
  }
  const prevDay = addDays(endDay, -days);
  if (first > prevDay) return null;
  const cur = levelAt(series, endDay);
  const prev = levelAt(series, prevDay);
  if (cur == null || prev == null) return null;
  return pctChange(cur, prev);
}
