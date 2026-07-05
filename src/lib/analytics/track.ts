// src/lib/analytics/track.ts
// Fire-and-forget visitor beacon. Never awaited, never throws into the UI.
import { env } from "@/lib/env";
import type { EventType } from "./types";

const KEY = "gc_visitor_id";

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked: use a per-tab volatile id.
    return "nostore";
  }
}

const base = () => env.companionApiUrl || "";

export function track(eventType: EventType, path: string, wallet?: string): void {
  try {
    const body = JSON.stringify({ visitorId: getVisitorId(), eventType, path, wallet: wallet ?? null });
    const url = `${base()}/api/analytics/track`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch {
    /* analytics must never break the app */
  }
}
