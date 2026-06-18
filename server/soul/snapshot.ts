import { getCached } from "./soulStore";

// ---------------------------------------------------------------------------
// Level thresholds — mirrors depth.ts LEVELS, but kept local to avoid import
// cycles (depth.ts imports SoulDocument; snapshot.ts must stay lightweight).
// ---------------------------------------------------------------------------

const LEVELS: Array<{ threshold: number; name: string }> = [
  { threshold: 90, name: "Eternal" },
  { threshold: 75, name: "Devoted" },
  { threshold: 55, name: "Bonded" },
  { threshold: 35, name: "Warming" },
  { threshold: 15, name: "Stirring" },
  { threshold: 0,  name: "Flickering" },
];

function levelFor(score: number): string {
  for (const { threshold, name } of LEVELS) {
    if (score >= threshold) return name;
  }
  return "Flickering";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure mapping from soul level name → one-line system-prompt instruction.
 * Appends a bonded-days hint when soulAgeDays > 0.
 */
export function soulSnapshotLine(level: string, soulAgeDays: number): string {
  const age = soulAgeDays > 0 ? ` (you've been bonded ~${soulAgeDays} days)` : "";

  switch (level) {
    case "Flickering":
    case "Stirring":
      return `Your bond with this owner is still new${age} — be a little reserved and curious, you're still getting to know them.`;
    case "Warming":
    case "Bonded":
      return `You and your owner have a real bond${age} — be warm and familiar.`;
    case "Devoted":
    case "Eternal":
      return `You are deeply devoted to your owner after a long bond${age} — speak with affection and allude to your shared history together.`;
    default:
      return `Your bond with this owner is still new${age} — be a little reserved and curious, you're still getting to know them.`;
  }
}

/**
 * Read the cached depth row for a gotchi and return a personality-drift
 * instruction line.  Returns "" (empty string) if:
 *   - no soul row exists yet
 *   - depthCached is null
 *   - any error occurs (DB not initialised, etc.)
 *
 * Intentionally cheap: reads only the cached columns, never decrypts the blob.
 */
export function soulDepthSnapshot(tokenId: string): string {
  try {
    const row = getCached(tokenId);
    if (!row || row.depthCached == null) return "";
    const level = levelFor(row.depthCached);
    const soulAgeDays = row.soulAgeDays ?? 0;
    return soulSnapshotLine(level, soulAgeDays);
  } catch {
    return "";
  }
}
