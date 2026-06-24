// src/lib/steward/logSummary.ts
// Pure: roll the Steward's log into a glanceable "this week" summary for the dashboard.
import type { LogEntry } from "./api";

export interface WeekSummary { runs: number; pet: number; channel: number; claim: number; lastRunTs: number | null; }

// A run's detail looks like "pet:2 channel:1 claim:0".
function parseDetail(detail: string): { pet: number; channel: number; claim: number } {
  const num = (k: string) => {
    const m = detail.match(new RegExp(`${k}:(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  return { pet: num("pet"), channel: num("channel"), claim: num("claim") };
}

export function summarizeWeek(log: LogEntry[], now: number): WeekSummary {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  let runs = 0, pet = 0, channel = 0, claim = 0;
  let lastRunTs: number | null = null;
  for (const e of log) {
    if (e.action !== "run") continue;
    if (lastRunTs === null || e.ts > lastRunTs) lastRunTs = e.ts;
    if (e.ts < weekAgo) continue;
    runs++;
    const d = parseDetail(e.detail);
    pet += d.pet; channel += d.channel; claim += d.claim;
  }
  return { runs, pet, channel, claim, lastRunTs };
}
