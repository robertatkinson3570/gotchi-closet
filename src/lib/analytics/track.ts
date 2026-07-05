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
    // text/plain is a CORS-safelisted content type, so this posts cross-origin as a
    // "simple" request with no preflight. sendBeacon with application/json is dropped
    // by some browsers (preflight it won't send), which silently loses every event.
    // If sendBeacon is missing OR declines to queue (returns false), fall back to a
    // keepalive fetch so the event still lands. The server parses the JSON string.
    const sent = typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
    if (!sent) {
      void fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body, keepalive: true });
    }
  } catch {
    /* analytics must never break the app */
  }
}
