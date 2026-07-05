// src/lib/analytics/api.ts
import { env } from "@/lib/env";
import type { AnalyticsEvent, Sig, VisitorRow, WindowKey } from "./types";

const base = () => env.companionApiUrl || "";

function headers(sig: Sig): HeadersInit {
  return {
    "x-wallet": sig.wallet,
    "x-signed-at": String(sig.signedAt),
    "x-signature": sig.signature,
  };
}

export async function fetchEvents(sig: Sig, window: WindowKey): Promise<AnalyticsEvent[]> {
  const r = await fetch(`${base()}/api/analytics/events?window=${window}`, { headers: headers(sig) });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("failed to load events");
  return (await r.json()).events;
}

export async function fetchVisitors(sig: Sig, window: WindowKey): Promise<VisitorRow[]> {
  const r = await fetch(`${base()}/api/analytics/visitors?window=${window}`, { headers: headers(sig) });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("failed to load visitors");
  return (await r.json()).visitors;
}
