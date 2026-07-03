import type { TraitTuple } from "./types";

// [lowLine (value < 50), highLine (value >= 50)] per trait index
const LINES: [string, string][] = [
  ["certified couch ghost. zero volts.", "runs on pure voltage. cannot be stopped."],
  ["a gentle bean. wouldn't hurt a fly.", "picks fights with liquidators for fun."],
  ["so cute it should be illegal.", "the stuff of nightmares. respectfully."],
  ["vibes over IQ. every time.", "galaxy brain. plays 4D checkers."],
  ["those eyes have seen nothing yet.", "those eyes have seen every candle."],
  ["standard-issue peepers. classic.", "eyes rarer than a bull market."],
];

export function flavorFor(traits: TraitTuple): string {
  let idx = 0;
  let dist = -1;
  traits.forEach((v, i) => {
    const d = Math.abs(v - 50);
    if (d > dist) {
      dist = d;
      idx = i;
    }
  });
  return LINES[idx][traits[idx] >= 50 ? 1 : 0];
}
