// src/lib/analytics/types.ts
export type EventType = "pageview" | "connect";

export interface AnalyticsEvent {
  id: number;
  visitor_id: string;
  wallet: string | null;
  ip: string | null;
  path: string | null;
  event_type: EventType;
  user_agent: string | null;
  created_at: number; // epoch ms
}

export interface VisitorRow {
  visitor_id: string;
  wallet: string | null;   // most recent wallet seen for this visitor
  ip: string | null;       // most recent IP
  events: number;
  first_seen: number;
  last_seen: number;
}

export interface Sig {
  wallet: string;
  signature: string;
  signedAt: number;
}

export type WindowKey = "24h" | "7d" | "30d";

export function windowMs(w: WindowKey): number {
  return w === "24h" ? 86_400_000 : w === "7d" ? 604_800_000 : 2_592_000_000;
}
