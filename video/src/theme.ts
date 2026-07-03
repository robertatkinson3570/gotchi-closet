import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const serif = loadSerif();
const inter = loadInter();
const mono = loadMono();

// "Phantom void with neon accents" — the site's signature dark mode.
// HSL values copied from src/styles/globals.css .dark {} — keep in sync.
export const theme = {
  width: 1080,
  height: 1920,
  fps: 30,

  bg: "hsl(265, 60%, 4%)",
  surface: "hsl(265, 50%, 7%)",
  surface2: "hsl(265, 45%, 11%)",
  text: "hsl(265, 30%, 96%)",
  muted: "hsl(265, 18%, 70%)",

  spectral: "hsl(275, 100%, 70%)",
  pink: "hsl(326, 100%, 68%)",
  cyan: "hsl(175, 100%, 60%)",
  ecto: "hsl(132, 100%, 64%)",
  gold: "hsl(47, 100%, 64%)",
  red: "hsl(350, 90%, 60%)",

  fontHeading: `${serif.fontFamily}, serif`,
  fontSans: `${inter.fontFamily}, sans-serif`,
  fontMono: `${mono.fontFamily}, monospace`,

  // tailwind bg-gradient-spectral / bg-gradient-gold, verbatim stops
  gradientSpectral:
    "linear-gradient(120deg, hsl(275, 100%, 70%) 0%, hsl(326, 100%, 68%) 50%, hsl(175, 100%, 60%) 100%)",
  gradientGold:
    "linear-gradient(120deg, hsl(47, 100%, 64%) 0%, hsl(326, 100%, 68%) 100%)",

  panel: {
    background: "hsl(265, 50%, 7%, 0.82)",
    border: "2px solid hsl(275, 50%, 34%, 0.5)",
    borderRadius: 24,
    boxShadow: "0 0 24px hsl(275, 100%, 70%, 0.28)", // --shadow-glow-md
  } as const,

  glow: (color: string, px = 24) =>
    ({ textShadow: `0 0 ${px}px ${color}, 0 0 ${px * 3}px ${color}` }) as const,

  label: {
    fontSize: 26,
    letterSpacing: 10,
    textTransform: "uppercase" as const,
    color: "hsl(265, 18%, 70%)",
  } as const,
} as const;

export const TRAIT_LABELS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"] as const;
