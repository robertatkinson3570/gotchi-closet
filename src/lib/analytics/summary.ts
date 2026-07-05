// src/lib/analytics/summary.ts
// Pure aggregation over a filtered event array. Drives the summary strip so it
// always describes exactly what the grid is currently showing.
import type { AnalyticsEvent } from "./types";

export interface Summary {
  uniqueVisitors: number;
  pageViews: number;
  connects: number;
  returningVisitors: number;
  connectRate: number; // connects / uniqueVisitors, 0..1
  topPages: { path: string; count: number }[];
  topVisitors: { key: string; count: number }[];
  timeBuckets: { t: number; count: number }[]; // pageviews per bucket, ascending
}

function dayIndex(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

export function summarize(events: AnalyticsEvent[], bucketMs = 3_600_000): Summary {
  const visitors = new Set<string>();
  const daysByVisitor = new Map<string, Set<number>>();
  const pageCounts = new Map<string, number>();
  const visitorCounts = new Map<string, number>();
  const buckets = new Map<number, number>();
  let pageViews = 0;
  let connects = 0;

  for (const e of events) {
    visitors.add(e.visitor_id);
    const days = daysByVisitor.get(e.visitor_id) ?? new Set<number>();
    days.add(dayIndex(e.created_at));
    daysByVisitor.set(e.visitor_id, days);

    const vkey = e.wallet ?? `anon:${e.visitor_id.slice(0, 6)}`;
    visitorCounts.set(vkey, (visitorCounts.get(vkey) ?? 0) + 1);

    if (e.event_type === "connect") connects++;
    if (e.event_type === "pageview") {
      pageViews++;
      if (e.path) pageCounts.set(e.path, (pageCounts.get(e.path) ?? 0) + 1);
      const b = Math.floor(e.created_at / bucketMs) * bucketMs;
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
  }

  let returningVisitors = 0;
  for (const days of daysByVisitor.values()) if (days.size > 1) returningVisitors++;

  const top = (m: Map<string, number>, keyName: "path" | "key") =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, count]) => ({ [keyName]: k, count })) as any[];

  return {
    uniqueVisitors: visitors.size,
    pageViews,
    connects,
    returningVisitors,
    connectRate: visitors.size ? connects / visitors.size : 0,
    topPages: top(pageCounts, "path"),
    topVisitors: top(visitorCounts, "key"),
    timeBuckets: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ t, count })),
  };
}
