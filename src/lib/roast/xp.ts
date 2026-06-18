import type { RoastOutcome } from "./types";

export const WIN_XP = 100;
export const LOSS_XP = 20;

/** Pure XP calculator for a roast battle result. */
export function xpForResult(outcome: RoastOutcome): number {
  return outcome.result === "win" ? WIN_XP : LOSS_XP;
}
