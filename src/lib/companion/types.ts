export type Pole = "low" | "high";
export type Intensity = "slightly" | "fairly" | "very" | "extremely";
export type Tier = "free" | "premium";

export interface PersonalityInput {
  name: string;
  numericTraits: number[];               // base traits (length 6)
  modifiedNumericTraits?: number[];      // wearable-modified
  withSetsNumericTraits?: number[];      // set-modified (most-equipped-aware)
  kinship?: number;
  level?: number;
  createdAt?: number;                    // unix SECONDS (matches Gotchi.createdAt)
}

export interface TraitLine {
  emoji: string;
  label: string;   // e.g. "Galaxy-brained"
  reason: string;  // e.g. "BRN 96"
}

export interface PersonalityProfile {
  archetype: string;
  toneWords: string[];
  traitLines: TraitLine[];
  systemPrompt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
