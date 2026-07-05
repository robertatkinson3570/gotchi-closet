// src/lib/analytics/summary.test.ts
import { describe, expect, it } from "vitest";
import { summarize } from "./summary";
import type { AnalyticsEvent } from "./types";

function ev(p: Partial<AnalyticsEvent>): AnalyticsEvent {
  return {
    id: 1, visitor_id: "v1", wallet: null, ip: "1.1.1.1",
    path: "/explorer", event_type: "pageview", user_agent: "UA",
    created_at: 0, ...p,
  };
}

describe("summarize", () => {
  it("counts unique visitors, page views, and connects", () => {
    const s = summarize([
      ev({ visitor_id: "v1", event_type: "pageview" }),
      ev({ visitor_id: "v1", event_type: "connect", wallet: "0xabc" }),
      ev({ visitor_id: "v2", event_type: "pageview" }),
    ]);
    expect(s.uniqueVisitors).toBe(2);
    expect(s.pageViews).toBe(2);
    expect(s.connects).toBe(1);
  });

  it("ranks top pages by pageview count", () => {
    const s = summarize([
      ev({ path: "/a" }), ev({ path: "/a" }), ev({ path: "/b" }),
    ]);
    expect(s.topPages[0]).toEqual({ path: "/a", count: 2 });
    expect(s.topPages[1]).toEqual({ path: "/b", count: 1 });
  });

  it("counts a visitor as returning when seen on more than one calendar day", () => {
    const day = 86_400_000;
    const s = summarize([
      ev({ visitor_id: "v1", created_at: 0 }),
      ev({ visitor_id: "v1", created_at: day * 2 }),
      ev({ visitor_id: "v2", created_at: 0 }),
    ]);
    expect(s.returningVisitors).toBe(1);
  });
});
