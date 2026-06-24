// server/steward/soulStats.ts
// SINGLE SOURCE of soul level/xp/memories for a gotchi. Both the companion chat and the
// Steward dashboard read through here so the number is identical on both surfaces.
//
// It reuses the SAME cached soul-depth the chat persona reads (server/soul/soulStore
// getCached, the value soulDepthSnapshot drives the chat's personality from) and the SAME
// companion facts store the chat injects as memories. No depth math is duplicated — the
// score is the cached buildDepth() output; only the UI mapping lives here.
import { getCached } from "../soul/soulStore";
import { getFacts } from "../companion/db";

export interface SoulStats { level: string; xpPct: number; memories: number; }

// Level bands mirror server/soul/depth.ts LEVELS (kept local to stay off the depth import
// graph, exactly as server/soul/snapshot.ts does for the same reason).
const LEVELS: Array<{ threshold: number; name: string }> = [
  { threshold: 90, name: "Eternal" },
  { threshold: 75, name: "Devoted" },
  { threshold: 55, name: "Bonded" },
  { threshold: 35, name: "Warming" },
  { threshold: 15, name: "Stirring" },
  { threshold: 0, name: "Flickering" },
];
function levelFor(score: number): string {
  for (const { threshold, name } of LEVELS) if (score >= threshold) return name;
  return "Flickering";
}

export function soulStatsFor(owner: string, gotchiId: number): SoulStats {
  const cached = getCached(String(gotchiId));
  const depth = cached?.depthCached ?? 0;
  const xpPct = Math.max(0, Math.min(100, Math.round(depth)));
  return { level: levelFor(depth), xpPct, memories: getFacts(owner, String(gotchiId)).length };
}
