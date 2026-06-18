import type { Pole, Intensity } from "./types";

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
