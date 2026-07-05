// src/components/admin/EventGrid.tsx
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AnalyticsEvent } from "@/lib/analytics/types";

type SortKey = "created_at" | "visitor" | "ip" | "event_type" | "path";
type Dir = "asc" | "desc";

function visitorLabel(e: AnalyticsEvent): string {
  return e.wallet ? e.wallet : `anon:${e.visitor_id.slice(0, 6)}`;
}
function browserLabel(ua: string | null): string {
  if (!ua) return "unknown";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Edg/i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "other";
}

export function EventGrid({
  events,
  filter,
  eventType,
  connectedOnly,
}: {
  events: AnalyticsEvent[];
  filter: string;
  eventType: "all" | "pageview" | "connect";
  connectedOnly: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<Dir>("desc");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = events.filter((e) => {
      if (eventType !== "all" && e.event_type !== eventType) return false;
      if (connectedOnly && !e.wallet) return false;
      if (!q) return true;
      return (
        (e.wallet ?? "").toLowerCase().includes(q) ||
        (e.ip ?? "").toLowerCase().includes(q) ||
        (e.path ?? "").toLowerCase().includes(q) ||
        e.visitor_id.toLowerCase().includes(q)
      );
    });
    const cmp = (a: AnalyticsEvent, b: AnalyticsEvent): number => {
      switch (sort) {
        case "created_at": return a.created_at - b.created_at;
        case "visitor": return visitorLabel(a).localeCompare(visitorLabel(b));
        case "ip": return (a.ip ?? "").localeCompare(b.ip ?? "");
        case "event_type": return a.event_type.localeCompare(b.event_type);
        case "path": return (a.path ?? "").localeCompare(b.path ?? "");
      }
    };
    out = [...out].sort((a, b) => (dir === "asc" ? cmp(a, b) : -cmp(a, b)));
    return out;
  }, [events, filter, eventType, connectedOnly, sort, dir]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      className="text-left font-semibold hover:underline"
      onClick={() => {
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else { setSort(key); setDir(key === "created_at" ? "desc" : "asc"); }
      }}
    >
      {label}{sort === key ? (dir === "asc" ? " up" : " down") : ""}
    </button>
  );

  return (
    <div className="rounded border border-white/10">
      <div className="grid grid-cols-[150px_360px_130px_90px_1fr_90px] gap-2 px-3 py-2 text-xs border-b border-white/10 bg-white/5">
        {header("created_at", "Time")}
        {header("visitor", "Visitor")}
        {header("ip", "IP")}
        {header("event_type", "Event")}
        {header("path", "Path")}
        <span className="font-semibold">Browser</span>
      </div>
      <div ref={parentRef} className="max-h-[55vh] overflow-auto">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => {
            const e = rows[vi.index];
            return (
              <div
                key={e.id}
                className="grid grid-cols-[150px_360px_130px_90px_1fr_90px] gap-2 px-3 items-center text-xs border-b border-white/5"
                style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, transform: `translateY(${vi.start}px)` }}
              >
                <span className="tabular-nums opacity-80">{new Date(e.created_at).toLocaleString()}</span>
                <span className="font-mono whitespace-nowrap" title={visitorLabel(e)}>{visitorLabel(e)}</span>
                <span className="font-mono opacity-80">{e.ip ?? ""}</span>
                <span>{e.event_type}</span>
                <span className="truncate opacity-90">{e.path ?? ""}</span>
                <span className="opacity-70">{browserLabel(e.user_agent)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-3 py-2 text-xs opacity-60">{rows.length} rows</div>
    </div>
  );
}
