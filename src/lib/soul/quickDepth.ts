/**
 * quickDepth.ts — Client-side "on-chain at-a-glance" soul depth.
 *
 * Computes only the two signals derivable from already-loaded chain data:
 *   • kinshipXp  (0–35 pts): blend of kinship + level-proxied XP
 *   • soulAge    (0–25 pts): sqrt curve on bondedDays derived from createdAt
 *
 * Consistency (0–30 pts) and Memory (0–10 pts) require companion-server
 * activity data and are treated as 0 here.  Maximum possible score is 60.
 *
 * Constants and math mirror server/soul/depth.ts exactly so the badge and
 * the full companion meter are always in the same units.
 */

export interface QuickSoul {
  score: number;
  level: string;
}

// ---------------------------------------------------------------------------
// Constants — must stay in sync with server/soul/depth.ts
// ---------------------------------------------------------------------------

/** Max kinship value that fully saturates the kinship sub-signal. */
export const KINSHIP_CAP = 2000;
/** Max XP value that fully saturates the XP sub-signal. */
export const XP_CAP = 50_000;
/** Soul age (bondedDays) at which the sqrt curve saturates to 1.0. */
export const SOUL_AGE_FULL_DAYS = 365;

// Weight allocations mirroring depth.ts
const W_KINSHIP_XP = 35;
const W_SOUL_AGE = 25;

// ---------------------------------------------------------------------------
// Level bands — thresholds must match server/soul/depth.ts exactly
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
// Signal helpers (same formulas as depth.ts)
// ---------------------------------------------------------------------------

function saturate(value: number, cap: number): number {
  return Math.min(1, Math.max(0, value / cap));
}

function signalKinshipXp(kinship: number, xp: number): number {
  const k = saturate(kinship, KINSHIP_CAP);
  const x = saturate(xp, XP_CAP);
  return ((k + x) / 2) * W_KINSHIP_XP;
}

function signalSoulAge(bondedDays: number): number {
  const norm = Math.min(
    1,
    Math.sqrt(Math.max(0, bondedDays)) / Math.sqrt(SOUL_AGE_FULL_DAYS)
  );
  return norm * W_SOUL_AGE;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a quick soul depth using only on-chain data.
 *
 * @param kinship         On-chain kinship value.
 * @param level           On-chain level (XP proxied as level * 1000, matching
 *                        the soul route's approximation).
 * @param createdAtSeconds Unix timestamp (seconds) when the gotchi was created;
 *                        omit / undefined if unknown.
 * @returns QuickSoul with score in [0, 60] and a level name.
 */
export function quickSoulDepth(
  kinship: number,
  level: number,
  createdAtSeconds?: number
): QuickSoul {
  // Proxy XP from level the same way the soul route does.
  const xp = level * 1000;

  const kinshipXp = signalKinshipXp(kinship, xp);

  let soulAge = 0;
  if (createdAtSeconds !== undefined) {
    const nowSeconds = Date.now() / 1000;
    const bondedDays = Math.max(0, (nowSeconds - createdAtSeconds) / 86_400);
    soulAge = signalSoulAge(bondedDays);
  }

  const raw = kinshipXp + soulAge;
  const score = Math.min(100, Math.max(0, raw));

  return { score, level: levelFor(score) };
}
