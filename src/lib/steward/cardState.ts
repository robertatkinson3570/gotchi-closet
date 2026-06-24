// src/lib/steward/cardState.ts
// Pure UI logic for the Steward page. Keeps the components dumb + testable.
export type CardState = "on-duty" | "soul-idle" | "no-soul";
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }
export interface EnrollmentLite { gotchiId: number; status: string; chores: Chores; }
const KEYS = ["pet", "channel", "claim"] as const;

export function deriveCardState(gotchi: { id: number; hasSoul: boolean }, enrollments: EnrollmentLite[]): CardState {
  const onDuty = enrollments.some((e) => e.gotchiId === gotchi.id && e.status === "active");
  if (onDuty) return "on-duty";
  return gotchi.hasSoul ? "soul-idle" : "no-soul";
}

export function freeChores(enrollments: EnrollmentLite[]): Chores {
  const taken: Chores = { pet: false, channel: false, claim: false };
  for (const e of enrollments) {
    if (e.status !== "active") continue;
    for (const k of KEYS) if (e.chores?.[k]) taken[k] = true;
  }
  return { pet: !taken.pet, channel: !taken.channel, claim: !taken.claim };
}
