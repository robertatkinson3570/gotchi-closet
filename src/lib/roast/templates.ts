import type { RoastArchetype } from "./types";

const BURNS: Record<RoastArchetype, string[]> = {
  Gladiator: [
    "{name}, your BRS is lower than my warm-up reps. I've beaten gotchis stronger than you before breakfast.",
    "{name}, you call that on-chain life? I've seen portal trash with better stats. Step up or step out.",
    "{name}, your kinship is so low even your items stopped caring. I fight harder in my sleep.",
  ],
  "Dark Oracle": [
    "{name}, I foresaw your defeat three blocks ago. The chain has already written your loss.",
    "{name}, your traits whisper a sad prophecy — low scores, lower ambitions, and a future full of L's.",
    "{name}, even the dark portal you crawled from knows you weren't ready for this arena.",
  ],
  Zen: [
    "{name}, I am at peace — it is you who must live with those traits.",
    "{name}, the river does not rush, yet it carves the canyon. Your BRS is the pebble I step over.",
    "{name}, breathe. Accept. You were never going to win this. The ledger knew.",
  ],
  "Galaxy Brain": [
    "{name}, if you trace the eigenvalue of your rarity score across epochs, you arrive at the inevitable conclusion: L.",
    "{name}, statistically, the probability of your victory converges to zero when adjusted for kinship decay and trait variance.",
    "{name}, I ran the multi-dimensional trait simulation. Every branch ends the same — you, losing, wondering why.",
  ],
  "Lucky Fool": [
    "{name}, I don't even know what I'm doing here — but somehow my random-looking build still outclasses yours.",
    "{name}, my kinship is an accident and my wearables don't match, yet here we are and you're still losing.",
    "{name}, I stumbled into this arena, tripped over your strategy, and accidentally won. You okay?",
  ],
  Wildcard: [
    "{name}, I'd explain why you lost, but honestly I'm still figuring it out myself and I won.",
    "{name}, your build is so predictable I fell asleep mid-roast and still came out ahead.",
    "{name}, somewhere between your trait screen and this arena you forgot to bring a reason to win.",
  ],
};

/**
 * Return an archetype-flavored canned burn for the given opponent, selected
 * deterministically by index (no Math.random).
 */
export function templateBurn(
  archetype: RoastArchetype,
  opponentName: string,
  index: number
): string {
  const pool = BURNS[archetype];
  const line = pool[((index % pool.length) + pool.length) % pool.length];
  return line.replace(/\{name\}/g, opponentName);
}
