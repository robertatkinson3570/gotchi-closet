import { staticFile } from "remotion";

export const AUDIO = {
  loop: staticFile("audio/loop-spectral.wav"),
  blip: staticFile("audio/sfx-blip.wav"),
  tick: staticFile("audio/sfx-tick.wav"),
  chaching: staticFile("audio/sfx-chaching.wav"),
} as const;
