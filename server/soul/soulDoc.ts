import { keccak256, stringToBytes } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Episode {
  ts: number;
  summary: string;
  privacy: "normal" | "sensitive";
  weight: number;
}

export interface Echo {
  eraHint: string;
  fragment: string;
}

export interface SoulDocument {
  version: number;
  tokenId: string;
  origin: { firstBondedAt: number };
  bonding: {
    bondedDays: number;
    lastInteractionTs: number;
    streak: number;
    consistencyHistory: number[];
  };
  memories: Episode[];
  pastLives: Echo[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function newSoulDocument(
  tokenId: string,
  firstBondedAt: number
): SoulDocument {
  return {
    version: 1,
    tokenId,
    origin: { firstBondedAt },
    bonding: {
      bondedDays: 0,
      lastInteractionTs: firstBondedAt,
      streak: 0,
      consistencyHistory: [],
    },
    memories: [],
    pastLives: [],
  };
}

// ---------------------------------------------------------------------------
// Canonical serialization
// Deterministic: sorted keys at every level, fixed number precision.
// ---------------------------------------------------------------------------

function sortedKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortedKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortedKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

function reviveNumbers(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(reviveNumbers);
  }
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = reviveNumbers(v);
    }
    return out;
  }
  if (typeof obj === "number") {
    // Re-apply 4-decimal rounding so floats survive a round-trip through JSON.
    // Integers are unaffected (toFixed(4) on an integer still parses back exact).
    return Number(obj.toFixed(4));
  }
  return obj;
}

/**
 * Produce a deterministic JSON string for a SoulDocument:
 * - All object keys sorted alphabetically at every depth.
 * - All numbers passed through Number(x.toFixed(4)) for stable precision.
 * - Arrays preserve order.
 */
export function canonicalSerialize(doc: SoulDocument): string {
  // Stabilize floating-point numbers first, then sort keys.
  const stabilized = reviveNumbers(doc);
  const sorted = sortedKeys(stabilized);
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

export function deserialize(json: string): SoulDocument {
  return JSON.parse(json) as SoulDocument;
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * keccak256 of the canonical UTF-8 bytes of the document.
 * Returns a 0x-prefixed hex string.
 */
export function soulHash(doc: SoulDocument): string {
  const bytes = stringToBytes(canonicalSerialize(doc));
  return keccak256(bytes);
}
