import type { RoastArchetype } from "./types";

// Trait indices
const NRG = 0;
const AGG = 1;
const SPK = 2;
const BRN = 3;

/**
 * Derive a roast archetype from a gotchi's trait values.
 * Precedence order (first match wins):
 *   1. AGG >= 75  → Gladiator
 *   2. SPK >= 75  → Dark Oracle
 *   3. AGG <= 25  → Zen
 *   4. BRN >= 75  → Galaxy Brain
 *   5. BRN <= 25  → Lucky Fool
 *   6. else       → Wildcard
 */
export function archetypeFor(traits: number[]): RoastArchetype {
  const agg = traits[AGG] ?? 50;
  const spk = traits[SPK] ?? 50;
  const brn = traits[BRN] ?? 50;

  if (agg >= 75) return "Gladiator";
  if (spk >= 75) return "Dark Oracle";
  if (agg <= 25) return "Zen";
  if (brn >= 75) return "Galaxy Brain";
  if (brn <= 25) return "Lucky Fool";
  return "Wildcard";
}

// Silence unused-variable warning for NRG (included for trait-index clarity)
void NRG;

const ARCHETYPE_VOICE: Record<RoastArchetype, string> = {
  Gladiator:
    "You are a battle-hardened Gladiator. Roast with raw aggression and unflinching confidence, charge straight at your opponent's weaknesses.",
  "Dark Oracle":
    "You are a Dark Oracle. Roast with cryptic, ominous precision, weave eerie prophecy and unsettling insight into each burn.",
  Zen:
    "You are a Zen master. Roast with eerily calm, unhurried devastation, let your opponent's own flaws destroy them while you remain unmoved.",
  "Galaxy Brain":
    "You are a Galaxy Brain. Roast with convoluted but accurate insight, your burns involve multi-step logic that somehow land harder for it.",
  "Lucky Fool":
    "You are a Lucky Fool. Roast with accidental brilliance, stumble into devastatingly accurate observations while seeming oblivious.",
  Wildcard:
    "You are a Wildcard. Roast unpredictably, shift tone mid-burn, subvert expectations, keep your opponent off-balance.",
};

/**
 * System prompt instructing the model to roast AS this gotchi in its archetype style.
 * Guardrails: playful/savage but NEVER slurs, hate, or protected-class attacks.
 * Output: one or two sentences, no asterisk stage directions.
 */
export function roastSystemPrompt(
  name: string,
  archetype: RoastArchetype
): string {
  return (
    `You are ${name}, a gotchi fighting in the Roast Arena. ` +
    ARCHETYPE_VOICE[archetype] +
    ` Roast your opponent's traits, looks, vibes, and on-chain life, be playful and savage but NEVER use slurs, hate speech, or attacks on protected classes. ` +
    `Keep each burn to one or two sentences. Do NOT use asterisk stage directions or emote markers.`
  );
}

/**
 * User-turn content: give the opponent's identity and prior burns to escalate from.
 */
export function roastLineUser(
  opponentName: string,
  opponentArchetype: RoastArchetype,
  priorLines: string[]
): string {
  const priorSection =
    priorLines.length > 0
      ? `\n\nPrior burns in this battle:\n${priorLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nBuild on these, escalate, don't repeat.`
      : "";
  return (
    `Your opponent is ${opponentName} (a ${opponentArchetype}). Deliver your next roast line at them.` +
    priorSection
  );
}

/**
 * System prompt for the impartial judge.
 * Requests strict JSON output with keys: winner, aScore, bScore, verdict.
 */
export function judgeSystemPrompt(): string {
  return (
    `You are an impartial Roast Arena judge. Score two gotchis' roast sets on wit, savagery, and relevance. ` +
    `Pick a winner. ` +
    `Respond with STRICT JSON only, no prose, no code fences, no extra keys, in exactly this shape: ` +
    `{"winner":"a","aScore":0-100,"bScore":0-100,"verdict":"one short line"}. ` +
    `"winner" must be exactly "a" or "b". "aScore" and "bScore" must be integers 0–100. ` +
    `"verdict" must be a single short sentence.`
  );
}

/**
 * User-turn content for the judge: both sides' line sets, labeled.
 */
export function judgeUser(
  aName: string,
  bName: string,
  aLines: string[],
  bLines: string[]
): string {
  const fmt = (lines: string[]) =>
    lines.map((l, i) => `  ${i + 1}. ${l}`).join("\n");
  return (
    `=== Gotchi A: ${aName} ===\n${fmt(aLines)}\n\n` +
    `=== Gotchi B: ${bName} ===\n${fmt(bLines)}\n\n` +
    `Score both sides and pick a winner.`
  );
}
