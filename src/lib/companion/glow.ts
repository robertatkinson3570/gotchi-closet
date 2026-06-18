import type { PersonalityInput } from "./types";
import { resolveEquippedTraits } from "./personality";

// Returns an rgba glow tuned to the dominant trait: high SPK → violet,
// high NRG → cyan, high AGG → red, else soft fuchsia.
export function glowColor(input: PersonalityInput): string {
  const t = resolveEquippedTraits(input);
  const spk = t[2] ?? 50, nrg = t[0] ?? 50, agg = t[1] ?? 50;
  const dom = Math.max(spk, nrg, agg);
  if (dom === spk && spk >= 65) return "rgba(168,85,247,0.55)";   // violet
  if (dom === nrg && nrg >= 65) return "rgba(34,211,238,0.55)";   // cyan
  if (dom === agg && agg >= 65) return "rgba(244,63,94,0.5)";     // red
  return "rgba(217,70,239,0.45)";                                  // fuchsia
}
