import type { SoulDocument } from "./soulDoc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoulDepth {
  score: number;
  level: string;
  breakdown: {
    kinshipXp: number;    // 0–35 points
    consistency: number;  // 0–30 points
    soulAge: number;      // 0–25 points
    memory: number;       // 0–10 points (hard-capped)
  };
}

// ---------------------------------------------------------------------------
// Constants — documented so tests can import & reference them
// ---------------------------------------------------------------------------

/** Max kinship value that fully saturates the kinship sub-signal (half of full weight). */
export const KINSHIP_CAP = 2000;
/** Max XP value that fully saturates the XP sub-signal (half of full weight). */
export const XP_CAP = 50_000;
/** Soul age (bondedDays) at which the sqrt curve saturates to 1.0. */
export const SOUL_AGE_FULL_DAYS = 365;
/** Maximum number of memories that count toward the memory richness signal. */
export const MEMORY_COUNT_CAP = 20;
/** Minimum weight a memory must have to be counted as "quality". */
export const MEMORY_MIN_WEIGHT = 1;

// Weight allocations (must sum to 100).
const W_KINSHIP_XP = 35;
const W_CONSISTENCY = 30;
const W_SOUL_AGE = 25;
const W_MEMORY = 10;

// ---------------------------------------------------------------------------
// Level bands
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
// Signal helpers
// ---------------------------------------------------------------------------

/** Saturating linear curve clamped to [0, 1]. */
function saturate(value: number, cap: number): number {
  return Math.min(1, Math.max(0, value / cap));
}

/**
 * On-chain kinship & XP signal → 0..W_KINSHIP_XP points.
 *
 * Equal blend of:
 *   - kinship normalised to KINSHIP_CAP
 *   - XP normalised to XP_CAP
 */
function signalKinshipXp(kinship: number, xp: number): number {
  const k = saturate(kinship, KINSHIP_CAP);
  const x = saturate(xp, XP_CAP);
  return ((k + x) / 2) * W_KINSHIP_XP;
}

/**
 * Interaction consistency signal → 0..W_CONSISTENCY points.
 *
 * Equal blend of:
 *   - Streak normalised to a 30-day window (generous but meaningful).
 *   - Average of consistencyHistory fill-ratios (already in [0,1]).
 *
 * When there is no consistency history the streak alone drives the signal,
 * so a brand-new soul with a running streak still accrues points.
 */
function signalConsistency(
  streak: number,
  consistencyHistory: number[]
): number {
  const STREAK_FULL = 30; // consecutive active windows that fully saturates
  const streakNorm = saturate(streak, STREAK_FULL);

  let histNorm = 0;
  if (consistencyHistory.length > 0) {
    const sum = consistencyHistory.reduce((a, b) => a + b, 0);
    histNorm = Math.min(1, sum / consistencyHistory.length);
  } else {
    // No history yet — treat as same as streak component.
    histNorm = streakNorm;
  }

  return ((streakNorm + histNorm) / 2) * W_CONSISTENCY;
}

/**
 * Bonded time / soul age signal → 0..W_SOUL_AGE points.
 *
 * sqrt-style diminishing returns: sqrt(bondedDays) / sqrt(SOUL_AGE_FULL_DAYS).
 * Monotonic — never decreases for a given bondedDays.
 */
function signalSoulAge(bondedDays: number): number {
  const norm = Math.min(1, Math.sqrt(Math.max(0, bondedDays)) / Math.sqrt(SOUL_AGE_FULL_DAYS));
  return norm * W_SOUL_AGE;
}

/**
 * Memory richness signal → 0..W_MEMORY points (hard cap).
 *
 * Quality-gated: only memories with weight >= MEMORY_MIN_WEIGHT count.
 * Count capped at MEMORY_COUNT_CAP so spamming can't inflate.
 */
function signalMemory(memories: SoulDocument["memories"]): number {
  const qualityCount = memories.filter((m) => m.weight >= MEMORY_MIN_WEIGHT).length;
  const capped = Math.min(qualityCount, MEMORY_COUNT_CAP);
  return (capped / MEMORY_COUNT_CAP) * W_MEMORY;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure depth computation.  No I/O, no viem, no side-effects.
 *
 * @param doc   The soul document (bonding, memories, pastLives).
 * @param live  Live on-chain signals fetched from the Aavegotchi diamond.
 */
export function buildDepth(
  doc: SoulDocument,
  live: { kinship: number; xp: number }
): SoulDepth {
  const kinshipXp = signalKinshipXp(live.kinship, live.xp);
  const consistency = signalConsistency(
    doc.bonding.streak,
    doc.bonding.consistencyHistory
  );
  const soulAge = signalSoulAge(doc.bonding.bondedDays);
  const memory = signalMemory(doc.memories);

  const raw = kinshipXp + consistency + soulAge + memory;
  // Clamp to [0, 100] as a safety net for floating-point edge cases.
  const score = Math.min(100, Math.max(0, raw));

  return {
    score,
    level: levelFor(score),
    breakdown: { kinshipXp, consistency, soulAge, memory },
  };
}
