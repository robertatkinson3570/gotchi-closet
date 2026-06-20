import type { Episode, Echo } from "./soulDoc";
import {
  getSoulDoc,
  saveSoulDoc,
  getCached,
  wasTransferProcessed,
  markTransferProcessed,
} from "./soulStore";
import { buildDepth } from "./depth";
import { fetchGotchiState } from "../companion/gotchiState";
import { complete } from "../companion/llmProvider";
import { screenOutbound } from "../../src/lib/companion/contentFilter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of past-life echoes kept on the document. */
const MAX_ECHOES = 12;

/** Bounded concurrency for the per-memory LLM depersonalize step (cost-safety). */
const DEPERSONALIZE_BATCH = 4;

/** Generic fallback fragment used when the LLM returns nothing. */
const FALLBACK_FRAGMENT = "a past keeper once walked these halls…";

/** Merged fragment used when oldest echoes are blurred together. */
const BLUR_FRAGMENT = "many keepers ago, lives blur into legend…";

// ---------------------------------------------------------------------------
// Layer 1 — heuristic PII strip
// ---------------------------------------------------------------------------

/**
 * Remove/replace known PII patterns in `text` with neutral placeholders.
 * - 0x… wallet addresses (40 hex chars)
 * - Long digit runs (6+ consecutive digits — phone-like, token IDs, etc.)
 * - @handles
 * - Capitalized proper-name tokens (TitleCase words)
 *
 * This is intentionally aggressive / best-effort.
 */
function heuristicStrip(text: string): string {
  return text
    // 0x hex addresses (case-insensitive, 40 hex chars minimum)
    .replace(/0x[0-9a-fA-F]{6,}/g, "[address]")
    // Long runs of digits (6 or more)
    .replace(/\b\d{6,}\b/g, "[number]")
    // @handles
    .replace(/@\w+/g, "[handle]")
    // Capitalized proper-name tokens: TitleCase words preceded by a word boundary
    // (start-of-string, space, or punctuation). We replace ALL occurrences because
    // any TitleCase token could be a personal name — best-effort, aggressive.
    .replace(/\b[A-Z][a-z]{1,}\b/g, "[name]");
}

// ---------------------------------------------------------------------------
// Layer 2 — LLM depersonalization
// ---------------------------------------------------------------------------

const DEPERSONALIZE_SYSTEM =
  'Rewrite this memory as a vague, spooky, THIRD-PERSON past-life fragment about "a past keeper" — ' +
  "no names, numbers, wallets, or specifics; one short eerie sentence.";

async function llmDepersonalize(scrubbed: string): Promise<string> {
  const result = await complete(
    DEPERSONALIZE_SYSTEM,
    [{ role: "user", content: scrubbed }],
    "free"
  );
  return result && result.trim() ? result.trim() : FALLBACK_FRAGMENT;
}

// ---------------------------------------------------------------------------
// Public: distillToEchoes
// ---------------------------------------------------------------------------

/**
 * Privacy core (§5 step 2).
 *
 * 1. Drop `sensitive` episodes entirely.
 * 2. Layer 1 — heuristic PII strip.
 * 3. Layer 2 — LLM depersonalize (fallback to generic fragment on failure).
 * 4. Layer 3 — screenOutbound content filter.
 * 5. Cap total echoes at MAX_ECHOES; oldest overflow is blurred into one echo.
 */
export async function distillToEchoes(memories: Episode[]): Promise<Echo[]> {
  // Step 1 — drop sensitive episodes.
  const eligible = memories.filter((m) => m.privacy !== "sensitive");

  // Only the newest (MAX_ECHOES - 1) memories survive as individual echoes; older
  // ones collapse into a single blur. So LLM-process ONLY the survivors — never one
  // call per memory regardless of how many a soul accumulated — and run them in
  // bounded batches so a transfer never fans out an unbounded burst of LLM calls.
  const hasOverflow = eligible.length > MAX_ECHOES;
  const survivors = hasOverflow
    ? eligible.slice(eligible.length - (MAX_ECHOES - 1))
    : eligible;

  // Steps 2–4 — process survivors in bounded batches (not one giant Promise.all).
  const fragments: string[] = [];
  for (let i = 0; i < survivors.length; i += DEPERSONALIZE_BATCH) {
    const batch = survivors.slice(i, i + DEPERSONALIZE_BATCH);
    const out = await Promise.all(
      batch.map(async (m) => {
        const scrubbed = heuristicStrip(m.summary);
        const depersonalized = await llmDepersonalize(scrubbed);
        const filtered = screenOutbound(depersonalized);
        return filtered || FALLBACK_FRAGMENT;
      })
    );
    fragments.push(...out);
  }

  const echoes: Echo[] = fragments.map((fragment) => ({
    eraHint: "a past life",
    fragment,
  }));

  // Step 5 — older memories beyond the cap collapse into one blur echo (no LLM).
  if (!hasOverflow) return echoes;
  return [{ eraHint: "many keepers ago", fragment: BLUR_FRAGMENT }, ...echoes];
}

// ---------------------------------------------------------------------------
// Public: onTransfer
// ---------------------------------------------------------------------------

/**
 * Handle an ERC-721 transfer for a custodied gotchi (§5 steps 1, 3, 4).
 *
 * Idempotent: keyed by (tokenId, newOwner, blockNumber).
 * Returns null if already processed; { distilled: 0 } for soulless gotchis;
 * { distilled: N } for a full distillation.
 */
export async function onTransfer(
  tokenId: string,
  newOwner: string,
  blockNumber: number
): Promise<{ distilled: number } | null> {
  const owner = newOwner.toLowerCase();

  // Idempotency check.
  if (wasTransferProcessed(tokenId, owner, blockNumber)) return null;

  const doc = getSoulDoc(tokenId);
  if (!doc) {
    // Soulless gotchi — nothing to distill; mark processed and return.
    markTransferProcessed(tokenId, owner, blockNumber);
    return { distilled: 0 };
  }

  // Distill current memories into echoes.
  const newEchoes = await distillToEchoes(doc.memories);

  // Carry forward: merge new echoes into existing pastLives, then cap.
  const combined = [...doc.pastLives, ...newEchoes];
  if (combined.length > MAX_ECHOES) {
    const overflow = combined.slice(0, combined.length - (MAX_ECHOES - 1));
    const kept = combined.slice(combined.length - (MAX_ECHOES - 1));
    const blurEcho: Echo = {
      eraHint: "many keepers ago",
      fragment: overflow.length === 1
        ? (overflow[0]?.fragment ?? BLUR_FRAGMENT)
        : BLUR_FRAGMENT,
    };
    doc.pastLives = [blurEcho, ...kept];
  } else {
    doc.pastLives = combined;
  }

  // Clear live-bond state — pedigree (firstBondedAt, bondedDays) is preserved.
  doc.memories = [];
  doc.bonding.streak = 0;
  doc.bonding.consistencyHistory = [];
  doc.bonding.lastInteractionTs = 0;

  // Persist under the new owner.
  saveSoulDoc(tokenId, owner, doc, {
    depth: buildDepth(doc, { kinship: 0, xp: 0 }).score,
    soulAgeDays: doc.bonding.bondedDays,
    pastLivesCount: doc.pastLives.length,
  });

  markTransferProcessed(tokenId, owner, blockNumber);

  return { distilled: newEchoes.length };
}

// ---------------------------------------------------------------------------
// Public: reconcileSoul
// ---------------------------------------------------------------------------

/**
 * Lazy reconcile (§10): compare the stored ownerWallet against the live
 * on-chain owner. If they differ the gotchi was transferred while the server
 * was down — trigger onTransfer now so the soul distills on the next read.
 *
 * Returns true if a transfer was processed; false otherwise.
 */
export async function reconcileSoul(tokenId: string): Promise<boolean> {
  const cached = getCached(tokenId);
  if (!cached) return false; // No soul row at all.

  const state = await fetchGotchiState(tokenId);
  if (
    state?.owner &&
    cached.ownerWallet &&
    state.owner.toLowerCase() !== cached.ownerWallet.toLowerCase()
  ) {
    // Owners differ — process a missed transfer (blockNumber 0 = unknown/lazy).
    await onTransfer(tokenId, state.owner, 0);
    return true;
  }
  return false;
}
