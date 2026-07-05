// src/components/admin/AnalyticsSummary.tsx
import { useMemo } from "react";
import { summarize } from "@/lib/analytics/summary";
import type { AnalyticsEvent } from "@/lib/analytics/types";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  );
}

function Sparkline({ points }: { points: { t: number; count: number }[] }) {
  if (points.length < 2) return <div className="text-xs opacity-50">not enough data yet</div>;
  const w = 480, h = 60, max = Math.max(...points.map((p) => p.count), 1);
  const dx = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * dx} ${h - (p.count / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none" role="img" aria-label="page views over time">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-sky-400" />
    </svg>
  );
}

export function AnalyticsSummary({ events }: { events: AnalyticsEvent[] }) {
  const s = useMemo(() => summarize(events), [events]);
  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Tile label="Unique visitors" value={String(s.uniqueVisitors)} />
        <Tile label="Page views" value={String(s.pageViews)} />
        <Tile label="Wallet connects" value={String(s.connects)} />
        <Tile label="Returning" value={String(s.returningVisitors)} />
        <Tile label="Connect rate" value={`${Math.round(s.connectRate * 100)}%`} />
      </div>
      <div className="rounded border border-white/10 p-3">
        <div className="text-xs opacity-60 mb-1">Page views over time</div>
        <Sparkline points={s.timeBuckets} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded border border-white/10 p-3">
          <div className="text-xs opacity-60 mb-2">Top pages</div>
          {s.topPages.map((p) => (
            <div key={p.path} className="flex justify-between text-sm py-0.5">
              <span className="truncate font-mono opacity-90">{p.path}</span>
              <span className="tabular-nums opacity-70">{p.count}</span>
            </div>
          ))}
        </div>
        <div className="rounded border border-white/10 p-3">
          <div className="text-xs opacity-60 mb-2">Top visitors</div>
          {s.topVisitors.map((v) => (
            <div key={v.key} className="flex justify-between text-sm py-0.5">
              <span className="truncate font-mono opacity-90">{v.key}</span>
              <span className="tabular-nums opacity-70">{v.count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
