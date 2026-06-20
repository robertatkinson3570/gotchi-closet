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
import { getFacts, getRecentMessages } from "../companion/db";
import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { quickSoulDepth } from "../../src/lib/soul/quickDepth";
import { archetypeFor, roastSystemPrompt } from "../../src/lib/roast/prompts";
import { soulDepthSnapshot } from "../soul/snapshot";
import { readOnChainSeal, sealConfigured } from "../soul/seal";

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
  wallet?: string
): Promise<{ systemPrompt: string; messages: { role: string; content: string }[] }> {
  const state = await fetchGotchiState(tokenId);
  if (!state) throw new Error(`gotchi ${tokenId} not found`);
  const profile = buildPersonality(state);
  const soul = soulDepthSnapshot(tokenId);
  const systemPrompt = soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt;

  const w = wallet && wallet.startsWith("0x") ? wallet.toLowerCase() : null;
  const messages = assembleMessages({
    facts: w ? getFacts(w, tokenId) : [],
    lore: retrieveLore(message),
    history: w
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
