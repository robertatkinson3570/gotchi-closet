// Wisp MCP — tool handlers.
//
// INVARIANT: this module makes NO LLM calls. Generation is the MCP client's job
// (bring-your-own-model). Every export below is deterministic assembly + cached
// reads, reusing the existing engine. Do NOT import server/companion/llmProvider
// or call complete() here — that would put LLM cost back on the operator.
//
// Purely additive: this imports existing functions read-only and never modifies
// the live companion/chat path.

import { fetchGotchiState } from "../companion/gotchiState";
import { getFacts, getRecentMessages, isClientTag } from "../companion/db";
import { proxyKeeperStanding } from "../companion/keeperProxy";
import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { quickSoulDepth } from "../../src/lib/soul/quickDepth";
import { archetypeFor, roastSystemPrompt } from "../../src/lib/roast/prompts";
import { soulDepthSnapshot } from "../soul/snapshot";
import { readOnChainSeal, sealConfigured } from "../soul/seal";
import { listEnrollments, getLog } from "../steward/db";
import { previewOwner } from "../steward/service";
import { snapshotFor } from "../steward/chain";
import { runAllDue } from "../steward/cron";

export type SealStatus = "unconfigured" | "unsealed" | "sealed";

/** Effective traits for archetype/roast: with-sets > modified > base. First 4 are NRG/AGG/SPK/BRN. */
function effectiveTraits(s: {
  numericTraits: number[];
  modifiedNumericTraits?: number[];
  withSetsNumericTraits?: number[];
}): number[] {
  return s.withSetsNumericTraits ?? s.modifiedNumericTraits ?? s.numericTraits;
}

/** The embodiment context a client's model loads to speak AS the gotchi. No LLM. */
export async function getPersona(tokenId: string): Promise<{ systemPrompt: string }> {
  const state = await fetchGotchiState(tokenId);
  if (!state) throw new Error(`gotchi ${tokenId} not found`);
  const profile = buildPersonality(state);
  const soul = soulDepthSnapshot(tokenId);
  const systemPrompt = soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt;
  return { systemPrompt };
}

/**
 * Build a ready-to-generate chat turn: { systemPrompt, messages }. The client
 * feeds this to its OWN model. Mirrors the live /chat assembly minus the LLM call.
 * Without a wallet, history/facts are empty (anonymous, stateless).
 */
export async function buildChatContext(
  tokenId: string,
  message: string,
  wallet?: string,
  opts: { facts?: boolean; history?: boolean } = {}
): Promise<{ systemPrompt: string; messages: { role: string; content: string }[] }> {
  const state = await fetchGotchiState(tokenId);
  if (!state) throw new Error(`gotchi ${tokenId} not found`);
  const profile = buildPersonality(state);
  const soul = soulDepthSnapshot(tokenId);
  const systemPrompt = soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt;

  const w = wallet && wallet.startsWith("0x") ? wallet.toLowerCase() : null;
  const messages = assembleMessages({
    facts: w && opts.facts !== false ? getFacts(w, tokenId) : [],
    lore: retrieveLore(message),
    history: w && opts.history !== false
      ? getRecentMessages(w, tokenId, 20).map((m) => ({ role: m.role, content: m.content }))
      : [],
    userMessage: message,
  });
  return { systemPrompt, messages };
}

/** A cheap soul summary (off-chain depth + on-chain seal status). */
export async function getSoul(tokenId: string): Promise<{
  tokenId: string;
  name: string;
  depth: number;
  level: string;
  kinship: number;
  sealStatus: SealStatus;
  onChain: Awaited<ReturnType<typeof readOnChainSeal>>;
}> {
  const state = await fetchGotchiState(tokenId);
  if (!state) throw new Error(`gotchi ${tokenId} not found`);
  const qs = quickSoulDepth(state.kinship ?? 0, state.level ?? 0, state.createdAt);
  const configured = sealConfigured();
  const onChain = configured ? await readOnChainSeal(tokenId) : null;
  const sealStatus: SealStatus = !configured ? "unconfigured" : onChain ? "sealed" : "unsealed";
  return {
    tokenId: String(tokenId),
    name: state.name,
    depth: qs.score,
    level: qs.level,
    kinship: state.kinship ?? 0,
    sealStatus,
    onChain,
  };
}

/** Roast battle scaffold for two gotchis. The client's model writes the burns. */
export async function getRoastSetup(
  tokenIdA: string,
  tokenIdB: string
): Promise<{
  a: { tokenId: string; name: string; archetype: string; systemPrompt: string; traits: number[] };
  b: { tokenId: string; name: string; archetype: string; systemPrompt: string; traits: number[] };
  rules: string;
}> {
  const [sa, sb] = await Promise.all([fetchGotchiState(tokenIdA), fetchGotchiState(tokenIdB)]);
  if (!sa) throw new Error(`gotchi ${tokenIdA} not found`);
  if (!sb) throw new Error(`gotchi ${tokenIdB} not found`);
  const ta = effectiveTraits(sa);
  const tb = effectiveTraits(sb);
  const archA = archetypeFor(ta);
  const archB = archetypeFor(tb);
  return {
    a: { tokenId: String(tokenIdA), name: sa.name, archetype: archA, systemPrompt: roastSystemPrompt(sa.name, archA), traits: ta.slice(0, 4) },
    b: { tokenId: String(tokenIdB), name: sb.name, archetype: archB, systemPrompt: roastSystemPrompt(sb.name, archB), traits: tb.slice(0, 4) },
    rules:
      "Each gotchi delivers one or two-sentence burns in its archetype voice — playful and savage, never slurs, hate speech, or protected-class attacks; no asterisk stage directions. " +
      "The integrator's own model generates the burns; score wit, savagery, and relevance with a deterministic or model judge to pick a winner.",
  };
}

/** On-chain seal status (configured + the latest seal record, or null). */
export async function verifySoul(tokenId: string): Promise<{
  configured: boolean;
  onChain: Awaited<ReturnType<typeof readOnChainSeal>>;
}> {
  return { configured: sealConfigured(), onChain: await readOnChainSeal(tokenId) };
}

// --- KEEPER GOTCHI (08-wisp-chat.md §8.2): the two read-only tools ---------
// Still zero LLM calls: the shared log is a table read, the keeper report is
// GVR's stored nightly report (facts and cites, never the voiced text).

export const HISTORY_LIMIT_MAX = 100;

/** The shared companion log for a gotchi + owner, every client's turns
 *  (Closet, GVR, keyed apps), newest-last; `client` filters to one writer. */
export function getHistory(tokenId: string, wallet: string, limit = 30, client?: string): {
  tokenId: string; wallet: string; messages: { role: string; content: string; ts: number; client: string }[];
} {
  const w = wallet.startsWith("0x") ? wallet.toLowerCase() : "";
  if (!w) throw new Error("wallet must be a 0x address");
  const n = Math.max(1, Math.min(HISTORY_LIMIT_MAX, Math.floor(limit) || 30));
  const filter = client && client !== "all" ? client : undefined;
  if (filter && !isClientTag(filter)) throw new Error("client must be closet, gvr, wsp_<first8> or all");
  return { tokenId: String(tokenId), wallet: w, messages: getRecentMessages(w, tokenId, n, filter).map((m) => ({ role: m.role, content: m.content, ts: m.ts, client: m.client })) };
}

/** The holder's latest standing report from GVR (06-standing-questions.md),
 *  facts only: each line's key, severity, template text, facts and cites.
 *  The voiced prose, the raw metric rows and the change bookkeeping are
 *  not returned. The wallet proves itself the way the Keeper tab does: the
 *  holder signs keeperReadMessage(wallet, signedAt) and GVR verifies it;
 *  Closet forwards and never re-checks (keeperProxy.ts). */
export async function getKeeperReport(wallet: string, tokenId: string, signedAt: string | number, signature: string): Promise<{
  wallet: string; tokenId: string; asOfBlock: string | null; at: number | null;
  lines: { key: string; severity: string; text: string; facts: unknown[]; cites: unknown[] }[];
  actions: unknown[];
}> {
  const r = await proxyKeeperStanding(String(tokenId), String(wallet), { signedAt: String(signedAt), signature: String(signature) });
  if (r.status !== 200) throw new Error(`GVR answered ${r.status}: ${r.body?.error ?? "no report"}`);
  const report = (r.body?.report ?? {}) as { lines?: Record<string, unknown>[] };
  const lines = Array.isArray(report.lines) ? report.lines : [];
  return {
    wallet: String(r.body.wallet ?? wallet).toLowerCase(), tokenId: String(r.body.tokenId ?? tokenId), asOfBlock: r.body.asOfBlock ?? null, at: typeof r.body.at === "number" ? r.body.at : null,
    lines: lines.map((l) => ({
      key: String(l.key ?? ""), severity: String(l.severity ?? ""), text: String(l.text ?? ""),
      facts: Array.isArray(l.facts) ? l.facts : [], cites: Array.isArray(l.cites) ? l.cites : [],
    })),
    actions: Array.isArray(r.body.actions) ? r.body.actions : [],
  };
}

// --- Steward dogfood handlers ---
// Expose the estate-automation surface (pet/channel/claim) to MCP clients, so an external
// Base agent can read/preview/trigger an owner's stewards. Same logic the web app uses.
// status/log are pure DB reads; preview/run perform on-chain reads (and run submits via the
// session key), so they are network-bound by design.

/** Active/paused/revoked steward enrollments for an owner. */
export function stewardStatus(owner: string) {
  return listEnrollments(owner);
}

/** Recent steward action log (runs + errors) for an owner. */
export function stewardLog(owner: string) {
  return getLog(owner);
}

/** Preview what each active steward WOULD do right now — no transaction is submitted. */
export async function stewardPreview(owner: string) {
  const now = Math.floor(Date.now() / 1000);
  return previewOwner(owner, { snapshotFor }, now);
}

/** Force a run cycle for this owner's due stewards (runEnrollment still enforces intervals). */
export async function stewardRunNow(owner: string) {
  await runAllDue();
  return getLog(owner).slice(0, 5);
}
