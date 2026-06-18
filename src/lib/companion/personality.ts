import type { Pole, Intensity, PersonalityInput, PersonalityProfile, TraitLine } from "./types";

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

export function buildPersonality(input: PersonalityInput): PersonalityProfile {
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
  profile.systemPrompt = personalityToSystemPrompt(input, profile, equipped);
  return profile;
}

export function personalityToSystemPrompt(_i: PersonalityInput, _p: PersonalityProfile, _e: number[]): string { return ""; }
