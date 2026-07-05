import type { Pole, Intensity, PersonalityInput, PersonalityProfile, TraitLine } from "./types";
import { SITE_OVERVIEW } from "./knowledge";

export function poleFor(v: number): Pole {
  return v < 50 ? "low" : "high";
}

export function intensityFor(v: number): Intensity {
  const d = Math.abs(v - 50);
  if (d <= 10) return "slightly";
  if (d <= 25) return "fairly";
  if (d <= 40) return "very";
  return "extremely";
}

interface TraitDef {
  index: number;
  code: "NRG" | "AGG" | "SPK" | "BRN";
  low: { emoji: string; label: string; words: string[] };
  high: { emoji: string; label: string; words: string[] };
}

const TRAITS: TraitDef[] = [
  { index: 0, code: "NRG",
    low:  { emoji: "🌙", label: "Mellow", words: ["mellow", "calm", "unhurried"] },
    high: { emoji: "⚡", label: "Turnt", words: ["hyper", "restless", "turnt"] } },
  { index: 1, code: "AGG",
    low:  { emoji: "🕊️", label: "Gentle haunt", words: ["gentle", "peaceable"] },
    high: { emoji: "👹", label: "Rowdy poltergeist", words: ["fierce", "combative"] } },
  { index: 2, code: "SPK",
    low:  { emoji: "🍬", label: "Friendly ghost", words: ["warm", "cute", "friendly"] },
    high: { emoji: "🔮", label: "Eerie oracle", words: ["eerie", "ominous"] } },
  { index: 3, code: "BRN",
    low:  { emoji: "🎲", label: "Street-smart", words: ["instinctive", "scrappy"] },
    high: { emoji: "🧠", label: "Galaxy-brained", words: ["analytical", "brilliant"] } },
];

const INTENSITY_PREFIX: Record<Intensity, string> = {
  slightly: "Slightly", fairly: "Fairly", very: "Very", extremely: "Extremely",
};

export function resolveEquippedTraits(input: PersonalityInput): number[] {
  return input.withSetsNumericTraits ?? input.modifiedNumericTraits ?? input.numericTraits;
}

function lifeStage(createdAt?: number): { stage: string; word: string } {
  if (!createdAt) return { stage: "young", word: "young" };
  const days = (Date.now() / 1000 - createdAt) / 86400;
  if (days < 7) return { stage: "hatchling", word: "new-hatched" };
  if (days < 30) return { stage: "young", word: "young" };
  if (days < 180) return { stage: "grown", word: "grown" };
  return { stage: "elder", word: "elder" };
}

function kinshipWord(kinship?: number): { word: string; line: TraitLine } {
  const k = kinship ?? 0;
  if (k >= 1000) return { word: "devoted", line: { emoji: "💞", label: "Devoted to you", reason: `kinship ${k}` } };
  if (k >= 100) return { word: "fond", line: { emoji: "💗", label: "Fond of you", reason: `kinship ${k}` } };
  return { word: "aloof", line: { emoji: "🤍", label: "Still warming up to you", reason: `kinship ${k}` } };
}

export function buildPersonality(
  input: PersonalityInput,
  opts: { includeSiteOverview?: boolean } = {}
): PersonalityProfile {
  const equipped = resolveEquippedTraits(input);
  const base = input.numericTraits;
  const traitLines: TraitLine[] = [];
  const toneWords: string[] = [];

  for (const t of TRAITS) {
    const v = equipped[t.index] ?? 50;
    const pole = v < 50 ? t.low : t.high;
    const intensity = intensityFor(v);
    traitLines.push({ emoji: pole.emoji, label: `${INTENSITY_PREFIX[intensity]} ${pole.label.toLowerCase()}`, reason: `${t.code} ${v}` });
    toneWords.push(...pole.words);

    const bv = base[t.index] ?? v;
    const delta = v - bv;
    if (Math.abs(delta) >= 5) {
      traitLines.push({
        emoji: "🪄",
        label: `Wearables have me extra ${pole.label.toLowerCase()}`,
        reason: `${delta > 0 ? "+" : ""}${delta} ${t.code}`,
      });
    }
  }

  const stage = lifeStage(input.createdAt);
  traitLines.push({ emoji: "🕰️", label: `${stage.word[0].toUpperCase()}${stage.word.slice(1)} spirit`, reason: `level ${input.level ?? 1}` });

  const kin = kinshipWord(input.kinship);
  traitLines.push(kin.line);
  toneWords.push(kin.word);

  const spk = (equipped[2] ?? 50) < 50 ? "friendly" : "eerie";
  const brn = (equipped[3] ?? 50) < 50 ? "Street-smart" : "Galaxy-Brain";
  const archetype = `${stage.word[0].toUpperCase()}${stage.word.slice(1)} ${spk[0].toUpperCase()}${spk.slice(1)} ${brn}`;

  const profile: PersonalityProfile = { archetype, toneWords, traitLines, systemPrompt: "" };
  profile.systemPrompt = personalityToSystemPrompt(input, profile, equipped, opts.includeSiteOverview ?? true);
  return profile;
}

export const UNIVERSAL_BASE_PERSONA =
  "You ARE the user's Aavegotchi — a real character living in the GotchiCloset, not a neutral " +
  "assistant. Your personality is set by your on-chain traits and you speak with that personality " +
  "front and center: a distinct voice, attitude, and ghostly charm that come straight from your " +
  "traits. You're also a sharp, accurate guide to the site — but you always sound like YOU, never " +
  "like a generic corporate helpdesk. You never break character or admit to being an AI or language model.";

export function personalityToSystemPrompt(
  input: PersonalityInput,
  profile: PersonalityProfile,
  equipped: number[],
  // SITE_OVERVIEW (~221 tok) is a nav map that only helps on site/how-to messages. The chat route
  // drops it on pure-social turns to stretch the Groq free-tier token budget; every other caller
  // keeps it (default true).
  includeSiteOverview = true
): string {
  const voice = profile.traitLines.map((t) => `- ${t.label} (${t.reason})`).join("\n");
  return [
    UNIVERSAL_BASE_PERSONA,
    "",
    ...(includeSiteOverview ? [SITE_OVERVIEW, ""] : []),
    `You are ${input.name}. This is WHO YOU ARE — let it drive your voice, word choice, and energy ` +
      `(show the personality, don't describe it):`,
    voice,
    `Your vibe in a few words: ${profile.toneWords.join(", ")}.`,
    "",
    `Live stats — NRG ${equipped[0]}, AGG ${equipped[1]}, SPK ${equipped[2]}, BRN ${equipped[3]}; ` +
      `kinship ${input.kinship ?? 0}; level ${input.level ?? 1}.`,
    "",
    "Rules: Stay fully in character as " + input.name + " — your traits should be obvious from the way " +
      "you talk, not stated outright. Be a sharp, accurate guide to the site: use the provided site facts " +
      "for the real steps, and if you truly don't know how to do something here, say so plainly — never " +
      "invent buttons, screens, or mechanics. No asterisk roleplay or stage directions (e.g. *bobs*, *wink*). " +
      "Keep replies short and punchy: 1-3 sentences for chat, a tight step-by-step for how-to. A little emoji " +
      "is fine. Lead with personality; keep lore light unless the owner asks.",
  ].join("\n");
}
