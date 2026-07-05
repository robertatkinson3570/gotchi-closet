import type { JudgeVerdict } from "./types";

/**
 * Extract the first JSON object from raw text (tolerates code fences / extra prose).
 */
function extractJson(raw: string): unknown {
  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  // Find the first { ... } block
  const start = stripped.indexOf("{");
  if (start === -1) return null;
  // Walk forward to find the matching closing brace
  let depth = 0;
  let end = -1;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Deterministic fallback: compare total character counts.
 * Winner = side with more total chars; tie → "a".
 * Scores fabricated from lengths (clamped 0–100).
 */
function fallbackVerdict(
  aLines: string[],
  bLines: string[]
): JudgeVerdict {
  const aLen = aLines.reduce((s, l) => s + l.length, 0);
  const bLen = bLines.reduce((s, l) => s + l.length, 0);
  const total = aLen + bLen || 1;
  const aScore = Math.min(100, Math.max(0, Math.round((aLen / total) * 100)));
  const bScore = Math.min(100, Math.max(0, 100 - aScore));
  const winner: "a" | "b" = bLen > aLen ? "b" : "a";
  return {
    winner,
    aScore,
    bScore,
    verdict: "The judge could not be reached. Victory goes to the wordier side.",
  };
}

/**
 * Parse and validate the judge's raw output into a JudgeVerdict.
 * Tolerates code fences, extra prose, and partial JSON.
 * On ANY failure returns a deterministic fallback — never throws.
 */
export function parseVerdict(
  raw: string | null,
  _aName: string,
  _bName: string,
  aLines: string[],
  bLines: string[]
): JudgeVerdict {
  if (!raw) return fallbackVerdict(aLines, bLines);

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return fallbackVerdict(aLines, bLines);
  }

  const obj = parsed as Record<string, unknown>;
  const winner = obj["winner"];
  const aScore = obj["aScore"];
  const bScore = obj["bScore"];
  const verdict = obj["verdict"];

  if (
    (winner !== "a" && winner !== "b") ||
    typeof aScore !== "number" ||
    typeof bScore !== "number" ||
    aScore < 0 ||
    aScore > 100 ||
    bScore < 0 ||
    bScore > 100
  ) {
    return fallbackVerdict(aLines, bLines);
  }

  return {
    winner,
    aScore: Math.round(aScore),
    bScore: Math.round(bScore),
    verdict: typeof verdict === "string" && verdict.length > 0
      ? verdict
      : "The judge has spoken.",
  };
}
