# Gotchi Video Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Remotion video workspace (`video/`) that renders four vertical-video templates (Spotlight, FitReveal, SaleAlert, PulseRecap) from real on-chain Aavegotchi data at $0/video — the Phase 1 "DAO ammo" demo from the spec.

**Architecture:** `video/` is a self-contained nested pnpm package (repo has NO workspace setup — do not create one; root deploy must stay untouched). Compositions are pure functions of a props JSON and import NOTHING from `src/` — all network/data/BRS work happens in `video/prep/*.ts` scripts executed with the root `tsx` (where imports of `src/lib`, `src/graphql`, and `server/aavegotchi` already work, as proven by the dev server). Audio is synthesized WAVs (no licensing, no downloads).

**Visual direction (per user):** match the site's **neon-spectral / phantom-void** aesthetic exactly — dark-mode tokens verbatim from `src/styles/globals.css` (bg `hsl(265 60% 4%)`, spectral `hsl(275 100% 70%)`, ghst-pink `hsl(326 100% 68%)`, cyan `hsl(175 100% 60%)`, ecto `hsl(132 100% 64%)`, gold `hsl(47 100% 64%)`), site fonts (DM Serif Display headings, Inter body, JetBrains Mono numbers), color-matched glows, spectral gradients, aurora-drift background blobs, shimmer on hero text. NOT pixel-font/CRT — the site is sleek neon, not retro.

**Tech Stack:** Remotion 4 + React 18 (video package), tsx + existing repo libs (prep), vitest at root for prep unit tests, pixelmatch for golden frames.

**Spec:** `docs/superpowers/specs/2026-07-03-gotchi-video-engine-design.md` (this plan = spec Phase 1 only; Megaphone is a separate later plan).

---

## File map

```
video/
  package.json            # nested package: remotion, react (own node_modules)
  tsconfig.json
  remotion.config.ts
  src/
    index.ts              # registerRoot
    Root.tsx              # 4 <Composition>s, fixtures as defaultProps, calculateMetadata
    types.ts              # ALL props types (shared by comps + prep)
    theme.ts              # site design tokens, fonts, gradients, glows
    flavor.ts             # trait-keyed flavor-line bank
    audio.ts              # audio file manifest (staticFile paths)
    components/
      Scene.tsx           # phantom-void bg + aurora blobs + vignette
      GradientText.tsx    # spectral-gradient text w/ optional shimmer
      GotchiSprite.tsx    # inline-SVG renderer (float + spectral glow)
      StatCounter.tsx     # spring count-up number (JetBrains Mono)
      TraitChips.tsx      # 6 trait chips, staggered entrance, gold extremes
      EndCard.tsx         # GotchiCloset outro (serif gradient + shimmer)
    compositions/
      Spotlight.tsx
      FitReveal.tsx
      SaleAlert.tsx
      PulseRecap.tsx
  prep/                   # run from REPO ROOT with `pnpm exec tsx`
    lib.ts                # props writer, svg cache, coreQuery, helpers
    shape.ts              # PURE data shaping (unit-tested)
    shape.test.ts
    genAudio.ts           # synthesizes WAVs into video/public/audio/
    spotlight.ts          # CLI: --gotchi <id>
    fitReveal.ts          # CLI: --gotchi <id>
    saleAlert.ts          # CLI: biggest gotchi sale last 7d (or --days N)
    pulseRecap.ts         # CLI: reads PULSE_URL (default prod)
  fixtures/               # checked-in synthetic props (tests + defaultProps)
    spotlight.json  fitReveal.json  saleAlert.json  pulseRecap.json
  scripts/
    golden.mjs            # remotion still per comp -> pixelmatch vs expected/
  golden/expected/        # checked-in golden PNGs
  public/audio/           # generated WAVs (gitignored)
  props/                  # generated props JSONs (gitignored)
  assets-cache/           # cached SVGs (gitignored)
  out/                    # rendered MP4s (gitignored)
```

Root `.gitignore` additions: `video/node_modules/`, `video/out/`, `video/props/`, `video/assets-cache/`, `video/public/audio/`, `video/golden/current/`.

**Conventions used throughout:**
- 1080×1920 @ 30fps.
- Prep commands run from repo root: `pnpm exec tsx video/prep/<script>.ts`.
- Render commands run from `video/`: `pnpm exec remotion render src/index.ts <CompId> out/<name>.mp4 --props=props/<file>.json`.
- Root vitest picks up `video/prep/*.test.ts` automatically (default include, node_modules excluded). Root `tsc` does NOT see `video/` (tsconfig include is `["src","data"]`) — the video package has its own tsconfig.

---

### Task 1: Scaffold the video package + hello render

**Files:**
- Create: `video/package.json`, `video/tsconfig.json`, `video/remotion.config.ts`, `video/src/index.ts`, `video/src/Root.tsx` (placeholder comp)
- Modify: `.gitignore`

- [ ] **Step 1: Create `video/package.json`**

```json
{
  "name": "gotchi-video",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "render": "remotion render src/index.ts",
    "still": "remotion still src/index.ts"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.360",
    "@remotion/google-fonts": "^4.0.360",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "remotion": "^4.0.360"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "pixelmatch": "^6.0.0",
    "pngjs": "^7.0.0",
    "typescript": "^5.6.0"
  }
}
```

(If `^4.0.360` doesn't resolve, use `pnpm view remotion version` and pin all three `remotion`/`@remotion/*` packages to that same version — they MUST match exactly.)

- [ ] **Step 2: Create `video/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "fixtures", "prep", "scripts"]
}
```

- [ ] **Step 3: Create `video/remotion.config.ts`**

```ts
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
```

- [ ] **Step 4: Create `video/src/index.ts` and placeholder `video/src/Root.tsx`**

```ts
// video/src/index.ts
import { registerRoot } from "remotion";
import { Root } from "./Root";

registerRoot(Root);
```

```tsx
// video/src/Root.tsx
import React from "react";
import { AbsoluteFill, Composition } from "remotion";

const Hello: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "hsl(265, 60%, 4%)",
      color: "hsl(326, 100%, 68%)",
      justifyContent: "center",
      alignItems: "center",
      fontSize: 80,
      fontFamily: "sans-serif",
    }}
  >
    gotchi video engine
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <Composition
    id="Hello"
    component={Hello}
    durationInFrames={60}
    fps={30}
    width={1080}
    height={1920}
  />
);
```

- [ ] **Step 5: Add gitignore entries**

Append to root `.gitignore`:

```
# video workspace (generated)
video/node_modules/
video/out/
video/props/
video/assets-cache/
video/public/audio/
video/golden/current/
```

- [ ] **Step 6: Install and smoke-render**

```bash
cd video && pnpm install
cd video && pnpm exec remotion still src/index.ts Hello out/hello.png
```

Expected: `out/hello.png` exists (Remotion downloads its headless browser on first run — allow a few minutes). Verify by reading the PNG (near-black violet frame with pink text).

- [ ] **Step 7: Commit**

```bash
git add video/package.json video/tsconfig.json video/remotion.config.ts video/src/ video/pnpm-lock.yaml .gitignore
git commit -m "feat(video): scaffold Remotion workspace with hello composition"
```

---

### Task 2: Synthesized audio (SFX + background loop)

**Files:**
- Create: `video/prep/genAudio.ts`, `video/src/audio.ts`

No licensing risk, no downloads: generate synth WAVs. Replaceable later by dropping better CC0 files over the same filenames.

- [ ] **Step 1: Create `video/prep/genAudio.ts`**

```ts
// Generates synth SFX + a background loop as WAV files.
// Run from repo root: pnpm exec tsx video/prep/genAudio.ts
import fs from "node:fs";
import path from "node:path";

const RATE = 44100;
const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "audio");

// Triangle-ish soft synth (site is sleek, not chippy square-wave)
function tone(freq: number, seconds: number, gain = 0.4, decay = 6): Float32Array {
  const n = Math.floor(RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp(-decay * t);
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const sin = Math.sin(2 * Math.PI * freq * t);
    out[i] = (0.6 * sin + 0.4 * tri) * gain * env;
  }
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function writeWav(file: string, samples: Float32Array): void {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 0x7fff, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  console.log(`wrote ${file} (${(samples.length / RATE).toFixed(2)}s)`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// SFX
writeWav(path.join(OUT_DIR, "sfx-blip.wav"), tone(880, 0.1, 0.5, 16));
writeWav(path.join(OUT_DIR, "sfx-tick.wav"), tone(1320, 0.06, 0.35, 28));
writeWav(
  path.join(OUT_DIR, "sfx-chaching.wav"),
  concat([tone(660, 0.12, 0.5, 10), tone(990, 0.26, 0.5, 7)]),
);

// Background loop: Am–F–C–G arpeggios, dreamy synth, 8 bars @ 120bpm (~8s)
const CHORDS: number[][] = [
  [220, 261.63, 329.63], // Am
  [174.61, 220, 261.63], // F
  [130.81, 164.81, 196], // C
  [196, 246.94, 293.66], // G
];
const EIGHTH = 0.25; // 120bpm
const bars: Float32Array[] = [];
for (let rep = 0; rep < 2; rep++) {
  for (const chord of CHORDS) {
    const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((idx) =>
      tone(chord[idx] * 2, EIGHTH, 0.15, 2.5),
    );
    const bass = tone(chord[0] / 2, EIGHTH * 8, 0.12, 0.4);
    bars.push(mix(concat(arp), bass));
  }
}
writeWav(path.join(OUT_DIR, "loop-spectral.wav"), concat(bars));
```

- [ ] **Step 2: Create the manifest `video/src/audio.ts`**

```ts
import { staticFile } from "remotion";

export const AUDIO = {
  loop: staticFile("audio/loop-spectral.wav"),
  blip: staticFile("audio/sfx-blip.wav"),
  tick: staticFile("audio/sfx-tick.wav"),
  chaching: staticFile("audio/sfx-chaching.wav"),
} as const;
```

- [ ] **Step 3: Generate and verify**

```bash
pnpm exec tsx video/prep/genAudio.ts
ls video/public/audio
```

Expected: four `.wav` files; loop ~8s, sfx well under 1s (durations printed by the script).

- [ ] **Step 4: Commit**

```bash
git add video/prep/genAudio.ts video/src/audio.ts
git commit -m "feat(video): synthesized SFX + spectral background loop"
```

---

### Task 3: Types, theme (site tokens), flavor bank, shared components

**Files:**
- Create: `video/src/types.ts`, `video/src/theme.ts`, `video/src/flavor.ts`, `video/src/components/Scene.tsx`, `video/src/components/GradientText.tsx`, `video/src/components/GotchiSprite.tsx`, `video/src/components/StatCounter.tsx`, `video/src/components/TraitChips.tsx`, `video/src/components/EndCard.tsx`

- [ ] **Step 1: Create `video/src/types.ts`** — the single source of truth for props shapes (prep imports these too)

```ts
export type TraitTuple = [number, number, number, number, number, number];

export type SpotlightProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  svg: string;
  traits: TraitTuple;
  brs: number;
  kinship: number;
  level: number;
  ageDays: number;
  setName: string | null;
  ownerShort: string;
  flavor: string;
};

export type FitStep = {
  svg: string;
  wearableId: number;
  wearableName: string;
  slotLabel: string;
  brs: number;
};

export type FitRevealProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  nakedSvg: string;
  nakedBrs: number;
  steps: FitStep[];
  finalBrs: number;
  setName: string | null;
  setBonusBrs: number;
};

export type SaleAlertProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  svg: string;
  priceGhst: number;
  priceUsd: number | null;
  traits: TraitTuple;
  brs: number;
  buyerShort: string;
  sellerShort: string;
  whenText: string;
};

export type PulseStat = {
  label: string;
  value: number;
  unit: string;
  wow: number | null; // week-over-week fraction, e.g. 0.12 = +12%
};

export type PulseCameo = { svg: string; name: string; caption: string };

export type PulseRecapProps = {
  videoId: string;
  weekLabel: string;
  stats: PulseStat[];
  cameos: PulseCameo[];
  greens: number;
  reds: number;
};
```

- [ ] **Step 2: Create `video/src/theme.ts`** — dark-mode tokens VERBATIM from `src/styles/globals.css` (`.dark` block) + site fonts from `tailwind.config.ts`

```ts
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
```

- [ ] **Step 3: Create `video/src/flavor.ts`** — deterministic flavor lines (spec §2: no LLM)

```ts
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
```

- [ ] **Step 4: Create `video/src/components/Scene.tsx`** — phantom void + drifting aurora blobs + vignette (the site's `animate-aurora` translated to frame-driven motion)

```tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

const Blob: React.FC<{
  color: string;
  x: number;
  y: number;
  size: number;
  speed: number;
  phase?: number;
}> = ({ color, x, y, size, speed, phase = 0 }) => {
  const frame = useCurrentFrame();
  const dx = Math.sin(frame / speed + phase) * 60;
  const dy = Math.cos(frame / (speed * 1.3) + phase) * 80;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity: 0.32,
        filter: "blur(130px)",
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    />
  );
};

export const Scene: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: theme.bg, fontFamily: theme.fontSans, color: theme.text }}>
    <Blob color={theme.spectral} x={-200} y={-100} size={900} speed={55} />
    <Blob color={theme.pink} x={480} y={1250} size={850} speed={70} phase={2} />
    <Blob color={theme.cyan} x={300} y={520} size={520} speed={90} phase={4} />
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 45%, transparent 55%, hsl(265, 60%, 4%, 0.9) 100%)",
      }}
    />
  </AbsoluteFill>
);
```

- [ ] **Step 5: Create `video/src/components/GradientText.tsx`** — spectral gradient + shimmer (site's `bg-gradient-spectral` + `animate-shimmer`)

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const GradientText: React.FC<{
  children: React.ReactNode;
  fontSize: number;
  gradient?: string;
  shimmer?: boolean;
  fontFamily?: string;
  style?: React.CSSProperties;
}> = ({ children, fontSize, gradient = theme.gradientSpectral, shimmer = true, fontFamily = theme.fontHeading, style }) => {
  const frame = useCurrentFrame();
  const pos = shimmer ? `${((frame * 1.2) % 200) - 100}% 0%` : "0% 0%";
  return (
    <div
      style={{
        fontSize,
        fontFamily,
        backgroundImage: gradient,
        backgroundSize: "200% 100%",
        backgroundPosition: pos,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: `drop-shadow(0 0 22px hsl(275, 100%, 70%, 0.45))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
```

- [ ] **Step 6: Create `video/src/components/GotchiSprite.tsx`**

```tsx
import React from "react";
import { useCurrentFrame } from "remotion";

// Renders a raw gotchi SVG string. Forces the svg to fill its box; gotchi
// SVGs ship a viewBox, so width/height attributes are safe to inject.
// Pixel-art crispness + the site's color-matched spectral glow.
export const GotchiSprite: React.FC<{
  svg: string;
  size: number;
  float?: boolean;
  style?: React.CSSProperties;
}> = ({ svg, size, float = true, style }) => {
  const frame = useCurrentFrame();
  const dy = float ? Math.sin(frame / 14) * 12 : 0;
  const html = svg.replace(/<svg /, '<svg width="100%" height="100%" ');
  return (
    <div
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        transform: `translateY(${dy}px)`,
        filter:
          "drop-shadow(0 0 28px hsl(275, 100%, 70%, 0.55)) drop-shadow(0 0 90px hsl(326, 100%, 68%, 0.3))",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
```

- [ ] **Step 7: Create `video/src/components/StatCounter.tsx`** — numbers in JetBrains Mono (site's stat idiom)

```tsx
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const StatCounter: React.FC<{
  label: string;
  value: number;
  delay?: number;
  color?: string;
  suffix?: string;
  decimals?: number;
  fontSize?: number;
}> = ({ label, value, delay = 0, color = theme.cyan, suffix = "", decimals = 0, fontSize = 84 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 45 });
  const shown = (value * p).toFixed(decimals);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...theme.label, marginBottom: 18 }}>{label}</div>
      <div style={{ fontSize, color, fontFamily: theme.fontMono, fontWeight: 500, ...theme.glow(color, 16) }}>
        {Number(shown).toLocaleString("en-US", { maximumFractionDigits: decimals })}
        {suffix}
      </div>
    </div>
  );
};
```

- [ ] **Step 8: Create `video/src/components/TraitChips.tsx`**

```tsx
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TRAIT_LABELS, theme } from "../theme";
import type { TraitTuple } from "../types";

export const TraitChips: React.FC<{ traits: TraitTuple; delay?: number }> = ({
  traits,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
      {traits.map((v, i) => {
        const p = spring({ frame: frame - delay - i * 6, fps, config: { damping: 14 } });
        const extreme = Math.abs(v - 50) >= 40;
        return (
          <div
            key={TRAIT_LABELS[i]}
            style={{
              ...theme.panel,
              padding: "20px 28px",
              transform: `scale(${p})`,
              ...(extreme
                ? {
                    border: `2px solid hsl(47, 100%, 64%, 0.7)`,
                    boxShadow: "0 0 24px hsl(47, 100%, 64%, 0.35)",
                  }
                : null),
            }}
          >
            <span style={{ fontSize: 24, color: theme.muted, letterSpacing: 4 }}>
              {TRAIT_LABELS[i]}{" "}
            </span>
            <span
              style={{
                fontSize: 36,
                fontFamily: theme.fontMono,
                color: extreme ? theme.gold : theme.text,
              }}
            >
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 9: Create `video/src/components/EndCard.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText } from "./GradientText";
import { theme } from "../theme";

export const EndCard: React.FC<{ line?: string }> = ({
  line = "free. self-funded. community-built.",
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 48, opacity, background: "hsl(265, 60%, 4%, 0.72)" }}>
      <GradientText fontSize={110}>GotchiCloset</GradientText>
      <div style={{ fontSize: 34, color: theme.cyan, fontFamily: theme.fontMono }}>
        gotchicloset.com
      </div>
      <div style={{ ...theme.label, fontSize: 22 }}>{line}</div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 10: Typecheck the video package**

```bash
cd video && pnpm exec tsc --noEmit
```

Expected: clean. (If `@remotion/google-fonts/DMSerifDisplay` errors, the correct subpath is listed by `ls video/node_modules/@remotion/google-fonts | grep -i serif` — adjust the import.)

- [ ] **Step 11: Commit**

```bash
git add video/src/types.ts video/src/theme.ts video/src/flavor.ts video/src/components/
git commit -m "feat(video): site-token theme, aurora scene, gradient text, shared components"
```

---

### Task 4: Spotlight composition + fixture + Root registration

**Files:**
- Create: `video/src/compositions/Spotlight.tsx`, `video/fixtures/spotlight.json`
- Modify: `video/src/Root.tsx` (replace Hello)

- [ ] **Step 1: Create `video/fixtures/spotlight.json`** (synthetic — a hand-drawn stand-in ghost so tests never need network)

```json
{
  "videoId": "fixture-spotlight",
  "gotchiId": "0",
  "name": "TEST GHOST",
  "svg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
  "traits": [99, 12, 50, 44, 10, 91],
  "brs": 542,
  "kinship": 1204,
  "level": 14,
  "ageDays": 1610,
  "setName": "Aagent",
  "ownerShort": "0xAB12…9F03",
  "flavor": "runs on pure voltage. cannot be stopped."
}
```

- [ ] **Step 2: Create `video/src/compositions/Spotlight.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { TraitChips } from "../components/TraitChips";
import { theme } from "../theme";
import type { SpotlightProps } from "../types";

export const SPOTLIGHT_DURATION = 24 * 30; // 24s

export const Spotlight: React.FC<SpotlightProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const flavorChars = Math.floor(Math.max(0, frame - 330) * 0.8);
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      <Sequence from={20} durationInFrames={10}>
        <Audio src={AUDIO.blip} volume={0.6} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 44 }}>
        <div style={{ ...theme.label, marginTop: 48 }}>Gotchi Spotlight</div>
        <div style={{ opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }) }}>
          <GradientText fontSize={96} style={{ textAlign: "center" }}>
            {p.name || `Gotchi #${p.gotchiId}`}
          </GradientText>
        </div>
        <div style={{ transform: `scale(${enter})` }}>
          <GotchiSprite svg={p.svg} size={640} />
        </div>
        <Sequence from={90} layout="none">
          <TraitChips traits={p.traits} />
        </Sequence>
        <Sequence from={180} layout="none">
          <div style={{ display: "flex", gap: 60, marginTop: 20 }}>
            <StatCounter label="BRS" value={p.brs} color={theme.cyan} fontSize={72} />
            <StatCounter label="Kinship" value={p.kinship} delay={15} color={theme.pink} fontSize={72} />
            <StatCounter label="Level" value={p.level} delay={30} color={theme.gold} fontSize={72} />
            <StatCounter label="Age · days" value={p.ageDays} delay={45} color={theme.ecto} fontSize={72} />
          </div>
        </Sequence>
        {p.setName ? (
          <Sequence from={270} layout="none">
            <div style={{ ...theme.panel, padding: "22px 36px", fontSize: 30, color: theme.gold, fontFamily: theme.fontMono, border: "2px solid hsl(47, 100%, 64%, 0.5)", boxShadow: "0 0 24px hsl(47, 100%, 64%, 0.3)" }}>
              SET · {p.setName.toUpperCase()}
            </div>
          </Sequence>
        ) : null}
        <Sequence from={330} layout="none">
          <div style={{ fontSize: 32, color: theme.cyan, fontFamily: theme.fontMono, textAlign: "center", lineHeight: 1.8, maxWidth: 880 }}>
            {p.flavor.slice(0, flavorChars)}
          </div>
        </Sequence>
        <div style={{ position: "absolute", bottom: 260, ...theme.label, fontSize: 20 }}>
          owner {p.ownerShort}
        </div>
      </AbsoluteFill>
      <Sequence from={SPOTLIGHT_DURATION - 130}>
        <EndCard />
      </Sequence>
    </Scene>
  );
};
```

- [ ] **Step 3: Replace `video/src/Root.tsx`** (registers Spotlight; later tasks append the other three)

```tsx
import React from "react";
import { Composition } from "remotion";
import spotlightFixture from "../fixtures/spotlight.json";
import { SPOTLIGHT_DURATION, Spotlight } from "./compositions/Spotlight";
import { theme } from "./theme";
import type { SpotlightProps } from "./types";

const size = { fps: theme.fps, width: theme.width, height: theme.height } as const;

export const Root: React.FC = () => (
  <>
    <Composition
      id="Spotlight"
      component={Spotlight}
      durationInFrames={SPOTLIGHT_DURATION}
      {...size}
      defaultProps={spotlightFixture as SpotlightProps}
    />
  </>
);
```

- [ ] **Step 4: Render a still + verify visually**

```bash
pnpm exec tsx video/prep/genAudio.ts
cd video && pnpm exec remotion still src/index.ts Spotlight out/spotlight-f400.png --frame=400
```

Expected: PNG renders. READ the image and judge it against the site aesthetic: phantom-void bg with visible aurora glow blobs, serif gradient name with shimmer, glowing sprite, mono numbers, gold-highlighted extreme traits, soft vignette. Iterate on spacing/glow intensity here until it genuinely looks like a gotchicloset.com screen — this frame IS the style contract for all four templates.

- [ ] **Step 5: Render the fixture MP4 end-to-end**

```bash
cd video && pnpm exec remotion render src/index.ts Spotlight out/spotlight-fixture.mp4
```

Expected: 24s 1080×1920 MP4 with audio. Check file exists and is >200KB.

- [ ] **Step 6: Commit**

```bash
git add video/src/compositions/Spotlight.tsx video/src/Root.tsx video/fixtures/spotlight.json
git commit -m "feat(video): Spotlight composition renders from fixture"
```

---

### Task 5: Prep infrastructure (lib + shape) with tests

**Files:**
- Create: `video/prep/lib.ts`, `video/prep/shape.ts`
- Test: `video/prep/shape.test.ts`

Prep scripts run from repo root under `tsx` — imports into `src/` and `server/` work exactly as they do for the dev server. `import.meta.env` guards in `src/lib/env.ts` degrade to defaults under tsx (documented in that file).

- [ ] **Step 1: Write the failing test `video/prep/shape.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { cumulativeSlotArrays, equipOrder, sumLastDays, weekLabel } from "./shape";

describe("equipOrder", () => {
  it("returns worn slots in slot order, skipping empties", () => {
    const equipped = [10, 0, 22, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(equipOrder(equipped)).toEqual([
      { slot: 0, id: 10 },
      { slot: 2, id: 22 },
      { slot: 5, id: 7 },
    ]);
  });
});

describe("cumulativeSlotArrays", () => {
  it("builds one 16-slot array per step, each adding one wearable", () => {
    const order = [
      { slot: 0, id: 10 },
      { slot: 2, id: 22 },
    ];
    const arrays = cumulativeSlotArrays(order);
    expect(arrays).toHaveLength(2);
    expect(arrays[0][0]).toBe(10);
    expect(arrays[0][2]).toBe(0);
    expect(arrays[1][0]).toBe(10);
    expect(arrays[1][2]).toBe(22);
    expect(arrays[1]).toHaveLength(16);
  });
});

describe("sumLastDays", () => {
  it("sums the trailing N points of a series", () => {
    const series = [
      { day: "2026-06-25", value: 1 },
      { day: "2026-06-26", value: 2 },
      { day: "2026-06-27", value: 3 },
    ];
    expect(sumLastDays(series, 2)).toBe(5);
    expect(sumLastDays(series, 10)).toBe(6);
    expect(sumLastDays(undefined, 7)).toBe(0);
  });
});

describe("weekLabel", () => {
  it("formats a 7-day window ending at the given ms timestamp", () => {
    expect(weekLabel(Date.UTC(2026, 6, 3))).toBe("JUN 27 – JUL 3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run video/prep/shape.test.ts
```

Expected: FAIL — cannot find module `./shape`.

- [ ] **Step 3: Create `video/prep/shape.ts`** (pure functions only — no network)

```ts
// Pure data-shaping helpers for prep scripts. No I/O in this file.

export type SeriesPoint = { day: string; value: number };

export function equipOrder(equipped: number[]): { slot: number; id: number }[] {
  return equipped
    .map((id, slot) => ({ slot, id }))
    .filter((e) => e.id > 0);
}

export function cumulativeSlotArrays(order: { slot: number; id: number }[]): number[][] {
  const out: number[][] = [];
  const current = new Array<number>(16).fill(0);
  for (const { slot, id } of order) {
    current[slot] = id;
    out.push([...current]);
  }
  return out;
}

export function sumLastDays(series: SeriesPoint[] | undefined, days: number): number {
  if (!series || series.length === 0) return 0;
  return series.slice(-days).reduce((s, p) => s + p.value, 0);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function weekLabel(endMs: number): string {
  const end = new Date(endMs);
  const start = new Date(endMs - 6 * 86_400_000);
  const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ghstFromWei(wei: string): number {
  return Number(BigInt(wei) / 10n ** 14n) / 10_000;
}

// Base mainnet ~2s blocks
export function blocksToDays(blocks: number): number {
  return Math.round((blocks * 2) / 86_400);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run video/prep/shape.test.ts
```

Expected: PASS (all 4 suites).

- [ ] **Step 5: Create `video/prep/lib.ts`** (the I/O layer: props writer, SVG cache, subgraph query)

```ts
// I/O helpers for prep scripts. Run from repo root via: pnpm exec tsx video/prep/<x>.ts
import fs from "node:fs";
import path from "node:path";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "../../src/lib/subgraph";

const VIDEO_DIR = path.resolve(import.meta.dirname, "..");
const PROPS_DIR = path.join(VIDEO_DIR, "props");
const CACHE_DIR = path.join(VIDEO_DIR, "assets-cache");

export function writeProps(name: string, data: unknown): string {
  fs.mkdirSync(PROPS_DIR, { recursive: true });
  const file = path.join(PROPS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`props -> ${file}`);
  return file;
}

export async function cachedSvg(key: string, fetcher: () => Promise<string>): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}.svg`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const svg = await fetcher();
  if (!svg || !svg.includes("<svg")) {
    throw new Error(`fetcher for ${key} did not return an SVG`);
  }
  fs.writeFileSync(file, svg);
  return svg;
}

export async function coreQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) {
    throw new Error(`subgraph error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export type GotchiRow = {
  id: string;
  gotchiId: string;
  name: string;
  numericTraits: number[];
  modifiedNumericTraits: number[];
  withSetsNumericTraits: number[] | null;
  equippedWearables: number[];
  baseRarityScore: string;
  kinship: string;
  level: string;
  hauntId: string;
  collateral: string;
  createdAt: string;
};

export async function fetchGotchi(tokenId: string): Promise<{ gotchi: GotchiRow; currentBlock: number }> {
  const data = await coreQuery<{ aavegotchis: GotchiRow[]; _meta: { block: { number: number } } }>(
    `query ($id: BigInt!) {
      aavegotchis(where: { gotchiId: $id, status: 3 }) {
        id gotchiId name numericTraits modifiedNumericTraits withSetsNumericTraits
        equippedWearables baseRarityScore kinship level hauntId collateral createdAt
      }
      _meta { block { number } }
    }`,
    { id: tokenId },
  );
  const gotchi = data.aavegotchis[0];
  if (!gotchi) throw new Error(`gotchi ${tokenId} not found (status 3)`);
  return { gotchi, currentBlock: data._meta.block.number };
}

export function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
```

- [ ] **Step 6: Smoke the I/O layer against the live subgraph**

```bash
pnpm exec tsx -e "import('./video/prep/lib.ts').then(async (m) => { const { gotchi } = await m.fetchGotchi('4285'); console.log(gotchi.name, gotchi.numericTraits, gotchi.equippedWearables.filter(Boolean).length + ' wearables'); })"
```

Expected: prints a real gotchi name + traits. (Any summoned gotchi ID works; 4285 is arbitrary — if it errors "not found", try another ID like 1484.)

- [ ] **Step 7: Commit**

```bash
git add video/prep/lib.ts video/prep/shape.ts video/prep/shape.test.ts
git commit -m "feat(video): prep I/O + pure shaping helpers with tests"
```

---

### Task 6: Spotlight prep script → first real video

**Files:**
- Create: `video/prep/spotlight.ts`

- [ ] **Step 1: Create `video/prep/spotlight.ts`**

```ts
// Usage (from repo root): pnpm exec tsx video/prep/spotlight.ts --gotchi 4285
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import { flavorFor } from "../src/flavor";
import type { SpotlightProps, TraitTuple } from "../src/types";
import { arg, cachedSvg, fetchGotchi, writeProps } from "./lib";
import { blocksToDays } from "./shape";

async function main() {
  const tokenId = arg("--gotchi");
  if (!tokenId) throw new Error("usage: --gotchi <tokenId>");

  const { gotchi, currentBlock } = await fetchGotchi(tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));

  const svg = await cachedSvg(`gotchi-${tokenId}`, () => getGotchiSvg(tokenId));
  const equippedIds = gotchi.equippedWearables.filter((id) => id > 0);
  const breakdown = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    modifiedNumericTraits: gotchi.modifiedNumericTraits,
    withSetsNumericTraits: gotchi.withSetsNumericTraits ?? undefined,
    equippedWearables: equippedIds,
    wearablesById,
  });

  const props: SpotlightProps = {
    videoId: `spotlight-${tokenId}`,
    gotchiId: tokenId,
    name: gotchi.name || `Gotchi #${tokenId}`,
    svg,
    traits: gotchi.modifiedNumericTraits.slice(0, 6) as TraitTuple,
    brs: breakdown.totalBrs,
    kinship: Number(gotchi.kinship),
    level: Number(gotchi.level),
    ageDays: blocksToDays(currentBlock - Number(gotchi.createdAt)),
    setName: breakdown.bestSet?.name ?? null,
    ownerShort: `#${tokenId}`,
    flavor: flavorFor(gotchi.numericTraits.slice(0, 6) as TraitTuple),
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Note for the implementer: `computeBRSBreakdown`'s exact param/return names are in `src/lib/rarity.ts` — verify the call matches the real signature before running (scout report says params `{ baseTraits, modifiedNumericTraits?, withSetsNumericTraits?, equippedWearables, wearablesById, blocksElapsed?, ageBrsOverride? }`, returns `{ totalBrs, bestSet, setFlatBrs, ... }`). Adjust field access if they differ.

- [ ] **Step 2: Run prep against a real gotchi**

```bash
pnpm exec tsx video/prep/spotlight.ts --gotchi 4285
```

Expected: `props -> video/props/spotlight-4285.json`. Inspect it: real name, real SVG (thousands of chars), plausible BRS (300–800), kinship > 0. If `getGotchiSvg` fails on env, check what `server/api/_env` needs — the dev server runs without extra setup, so defaults should hold; set the missing var in `.env` if not.

- [ ] **Step 3: Render the real video**

```bash
cd video && pnpm exec remotion render src/index.ts Spotlight out/spotlight-4285.mp4 --props=props/spotlight-4285.json
```

Expected: MP4 renders. Extract a frame and READ it to verify the real gotchi art renders correctly over the aurora background (not a black box — this validates the inline-SVG approach against real on-chain SVGs, the riskiest assumption in this plan):

```bash
cd video && pnpm exec remotion still src/index.ts Spotlight out/check-4285.png --frame=400 --props=props/spotlight-4285.json
```

- [ ] **Step 4: Commit**

```bash
git add video/prep/spotlight.ts
git commit -m "feat(video): spotlight prep script renders real gotchis"
```

---

### Task 7: FitReveal (composition + prep)

**Files:**
- Create: `video/src/compositions/FitReveal.tsx`, `video/fixtures/fitReveal.json`, `video/prep/fitReveal.ts`
- Modify: `video/src/Root.tsx`

- [ ] **Step 1: Create `video/fixtures/fitReveal.json`**

```json
{
  "videoId": "fixture-fitreveal",
  "gotchiId": "0",
  "name": "TEST GHOST",
  "nakedSvg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
  "nakedBrs": 480,
  "steps": [
    {
      "svg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><rect x=\"20\" y=\"12\" width=\"24\" height=\"8\" fill=\"#ffd747\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
      "wearableId": 1,
      "wearableName": "Test Hat",
      "slotLabel": "HEAD",
      "brs": 495
    },
    {
      "svg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><rect x=\"20\" y=\"12\" width=\"24\" height=\"8\" fill=\"#ffd747\"/><rect x=\"22\" y=\"34\" width=\"20\" height=\"12\" fill=\"#47ffea\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
      "wearableId": 2,
      "wearableName": "Test Shirt",
      "slotLabel": "BODY",
      "brs": 512
    }
  ],
  "finalBrs": 542,
  "setName": "Test Set",
  "setBonusBrs": 5
}
```

- [ ] **Step 2: Create `video/src/compositions/FitReveal.tsx`**

Timing model: 90-frame intro (naked + BRS), 75 frames per step, 90-frame set stinger (only when `setName`), 130-frame EndCard.

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { theme } from "../theme";
import type { FitRevealProps } from "../types";

const INTRO = 90;
const PER_STEP = 75;
const STINGER = 90;
const OUTRO = 130;

export function fitRevealDuration(steps: number, hasSet: boolean): number {
  return INTRO + steps * PER_STEP + (hasSet ? STINGER : 0) + OUTRO;
}

const Brs: React.FC<{ value: number }> = ({ value }) => (
  <div style={{ fontSize: 66, color: theme.cyan, fontFamily: theme.fontMono, ...theme.glow(theme.cyan, 16) }}>
    BRS {value.toLocaleString("en-US")}
  </div>
);

export const FitReveal: React.FC<FitRevealProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepIdx = Math.min(
    p.steps.length - 1,
    Math.max(-1, Math.floor((frame - INTRO) / PER_STEP)),
  );
  const active = frame < INTRO ? null : p.steps[stepIdx];
  const svg = active ? active.svg : p.nakedSvg;
  const brs = active ? active.brs : p.nakedBrs;
  const stingerAt = INTRO + p.steps.length * PER_STEP;
  const inStinger = p.setName && frame >= stingerAt && frame < stingerAt + STINGER;
  const pop = spring({
    frame: (frame - INTRO) % PER_STEP,
    fps,
    config: { damping: 12 },
  });
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      {p.steps.map((_, i) => (
        <Sequence key={i} from={INTRO + i * PER_STEP} durationInFrames={10}>
          <Audio src={AUDIO.blip} volume={0.65} />
        </Sequence>
      ))}
      {p.setName ? (
        <Sequence from={stingerAt} durationInFrames={20}>
          <Audio src={AUDIO.chaching} volume={0.7} />
        </Sequence>
      ) : null}
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 50 }}>
        <div style={{ ...theme.label, marginTop: 48 }}>Fit Check</div>
        <GradientText fontSize={84} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <GotchiSprite svg={svg} size={680} />
        <Brs value={brs} />
        {active && !inStinger ? (
          <div
            style={{
              ...theme.panel,
              padding: "24px 38px",
              transform: `scale(${pop})`,
              textAlign: "center",
            }}
          >
            <div style={{ ...theme.label, fontSize: 20, marginBottom: 12 }}>
              + {active.slotLabel}
            </div>
            <div style={{ fontSize: 34, color: theme.gold, fontFamily: theme.fontMono }}>
              {active.wearableName}
            </div>
          </div>
        ) : null}
        {inStinger ? (
          <div
            style={{
              ...theme.panel,
              border: "2px solid hsl(47, 100%, 64%, 0.6)",
              boxShadow: "0 0 36px hsl(47, 100%, 64%, 0.4)",
              padding: "30px 46px",
              textAlign: "center",
              transform: `scale(${spring({ frame: frame - stingerAt, fps, config: { damping: 10 } })})`,
            }}
          >
            <div style={{ fontSize: 30, color: theme.gold, fontFamily: theme.fontMono, marginBottom: 14 }}>
              ✦ SET BONUS · {p.setName!.toUpperCase()} ✦
            </div>
            <div style={{ fontSize: 46, color: theme.cyan, fontFamily: theme.fontMono }}>
              FINAL BRS {p.finalBrs.toLocaleString("en-US")}
            </div>
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            bottom: 260,
            ...theme.label,
            fontSize: 20,
            opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          dressed with gotchicloset.com
        </div>
      </AbsoluteFill>
      <Sequence from={stingerAt + (p.setName ? STINGER : 0)}>
        <EndCard />
      </Sequence>
    </Scene>
  );
};
```

- [ ] **Step 3: Register in `video/src/Root.tsx`** — add imports and a `<Composition>` with `calculateMetadata` (dynamic duration):

```tsx
import fitRevealFixture from "../fixtures/fitReveal.json";
import { FitReveal, fitRevealDuration } from "./compositions/FitReveal";
import type { FitRevealProps } from "./types";
```

```tsx
    <Composition
      id="FitReveal"
      component={FitReveal}
      durationInFrames={600}
      {...size}
      defaultProps={fitRevealFixture as FitRevealProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: fitRevealDuration(props.steps.length, Boolean(props.setName)),
      })}
    />
```

- [ ] **Step 4: Fixture render smoke**

```bash
cd video && pnpm exec remotion still src/index.ts FitReveal out/fitreveal-f120.png --frame=120
```

Expected: renders; READ the PNG — fixture ghost wearing the gold "hat" rect, "+ HEAD / Test Hat" panel visible, aurora bg.

- [ ] **Step 5: Create `video/prep/fitReveal.ts`**

```ts
// Usage: pnpm exec tsx video/prep/fitReveal.ts --gotchi 4285
import { previewGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import type { FitRevealProps, FitStep } from "../src/types";
import { arg, cachedSvg, fetchGotchi, writeProps } from "./lib";
import { cumulativeSlotArrays, equipOrder } from "./shape";

const SLOT_LABELS: Record<number, string> = {
  0: "BODY", 1: "FACE", 2: "EYES", 3: "HEAD",
  4: "L HAND", 5: "R HAND", 6: "PET", 7: "BG",
};

async function main() {
  const tokenId = arg("--gotchi");
  if (!tokenId) throw new Error("usage: --gotchi <tokenId>");

  const { gotchi } = await fetchGotchi(tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));

  const order = equipOrder(gotchi.equippedWearables);
  if (order.length === 0) throw new Error(`gotchi ${tokenId} has no wearables equipped`);
  const slotArrays = cumulativeSlotArrays(order);

  const previewBase = {
    tokenId,
    hauntId: Number(gotchi.hauntId),
    collateral: gotchi.collateral,
    numericTraits: gotchi.numericTraits,
  };
  const nakedSvg = await cachedSvg(`naked-${tokenId}`, () =>
    previewGotchiSvg({ ...previewBase, wearableIds: new Array(16).fill(0) }),
  );
  const nakedBrs = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: [],
    wearablesById,
  }).totalBrs;

  const steps: FitStep[] = [];
  for (let i = 0; i < order.length; i++) {
    const idsSoFar = order.slice(0, i + 1).map((o) => o.id);
    const svg = await cachedSvg(`fit-${tokenId}-step${i}`, () =>
      previewGotchiSvg({ ...previewBase, wearableIds: slotArrays[i] }),
    );
    const brs = computeBRSBreakdown({
      baseTraits: gotchi.numericTraits,
      equippedWearables: idsSoFar,
      wearablesById,
    }).totalBrs;
    steps.push({
      svg,
      wearableId: order[i].id,
      wearableName: wearablesById.get(order[i].id)?.name ?? `#${order[i].id}`,
      slotLabel: SLOT_LABELS[order[i].slot] ?? `SLOT ${order[i].slot}`,
      brs,
    });
  }

  const finalBreakdown = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: order.map((o) => o.id),
    wearablesById,
  });

  const props: FitRevealProps = {
    videoId: `fitreveal-${tokenId}`,
    gotchiId: tokenId,
    name: gotchi.name || `Gotchi #${tokenId}`,
    nakedSvg,
    nakedBrs,
    steps,
    finalBrs: finalBreakdown.totalBrs,
    setName: finalBreakdown.bestSet?.name ?? null,
    setBonusBrs: finalBreakdown.setFlatBrs ?? 0,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

(Same signature caveat as Task 6: check `computeBRSBreakdown`'s real return fields — `bestSet` and `setFlatBrs` per the scout report — and adjust field access if they differ.)

- [ ] **Step 6: Prep + render a real FitReveal**

```bash
pnpm exec tsx video/prep/fitReveal.ts --gotchi 4285
cd video && pnpm exec remotion render src/index.ts FitReveal out/fitreveal-4285.mp4 --props=props/fitreveal-4285.json
```

Expected: duration scales with wearable count; BRS increases across steps; set stinger if the gotchi wears a full set. Extract and READ a mid-video still to verify real art.

- [ ] **Step 7: Run all video tests still green**

```bash
pnpm exec vitest run video/prep
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add video/src/compositions/FitReveal.tsx video/fixtures/fitReveal.json video/prep/fitReveal.ts video/src/Root.tsx
git commit -m "feat(video): FitReveal composition + prep with per-step BRS"
```

---

### Task 8: SaleAlert (composition + prep)

**Files:**
- Create: `video/src/compositions/SaleAlert.tsx`, `video/fixtures/saleAlert.json`, `video/prep/saleAlert.ts`
- Modify: `video/src/Root.tsx`

- [ ] **Step 1: Create `video/fixtures/saleAlert.json`**

```json
{
  "videoId": "fixture-salealert",
  "gotchiId": "0",
  "name": "TEST GHOST",
  "svg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
  "priceGhst": 12500,
  "priceUsd": 8125.5,
  "traits": [99, 12, 50, 44, 10, 91],
  "brs": 542,
  "buyerShort": "0xBEEF…1234",
  "sellerShort": "0xCAFE…5678",
  "whenText": "TODAY"
}
```

- [ ] **Step 2: Create `video/src/compositions/SaleAlert.tsx`** (15s = 450 frames)

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { TraitChips } from "../components/TraitChips";
import { theme } from "../theme";
import type { SaleAlertProps } from "../types";

export const SALE_ALERT_DURATION = 450;

export const SaleAlert: React.FC<SaleAlertProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({ frame: frame - 8, fps, config: { damping: 9 } });
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      <Sequence from={70} durationInFrames={25}>
        <Audio src={AUDIO.chaching} volume={0.75} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 46 }}>
        <div
          style={{
            marginTop: 60,
            fontSize: 78,
            fontFamily: theme.fontHeading,
            color: theme.pink,
            border: `4px solid hsl(326, 100%, 68%, 0.8)`,
            borderRadius: 20,
            padding: "18px 44px",
            transform: `scale(${stamp}) rotate(-6deg)`,
            boxShadow: "0 0 48px hsl(326, 100%, 68%, 0.5)",
            ...theme.glow(theme.pink, 20),
          }}
        >
          SOLD
        </div>
        <GotchiSprite svg={p.svg} size={560} />
        <GradientText fontSize={72} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <Sequence from={70} layout="none">
          <StatCounter label="Price" value={p.priceGhst} suffix=" GHST" color={theme.gold} fontSize={96} />
          {p.priceUsd ? (
            <div style={{ fontSize: 30, color: theme.muted, fontFamily: theme.fontMono, textAlign: "center" }}>
              ≈ ${p.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          ) : null}
        </Sequence>
        <Sequence from={150} layout="none">
          <TraitChips traits={p.traits} />
        </Sequence>
        <Sequence from={210} layout="none">
          <div style={{ fontSize: 26, color: theme.muted, fontFamily: theme.fontMono, textAlign: "center", lineHeight: 2 }}>
            BRS {p.brs} · {p.whenText}
            <br />
            {p.sellerShort} → {p.buyerShort}
          </div>
        </Sequence>
      </AbsoluteFill>
      <Sequence from={SALE_ALERT_DURATION - 110}>
        <EndCard line="every big sale, on the baazaar pulse" />
      </Sequence>
    </Scene>
  );
};
```

- [ ] **Step 3: Register in Root** (same pattern as before):

```tsx
import saleAlertFixture from "../fixtures/saleAlert.json";
import { SALE_ALERT_DURATION, SaleAlert } from "./compositions/SaleAlert";
import type { SaleAlertProps } from "./types";
```

```tsx
    <Composition
      id="SaleAlert"
      component={SaleAlert}
      durationInFrames={SALE_ALERT_DURATION}
      {...size}
      defaultProps={saleAlertFixture as SaleAlertProps}
    />
```

- [ ] **Step 4: Fixture still smoke** — `cd video && pnpm exec remotion still src/index.ts SaleAlert out/salealert-f100.png --frame=100`. READ the PNG: pink SOLD stamp + ghost + gold price counter over aurora.

- [ ] **Step 5: Create `video/prep/saleAlert.ts`**

```ts
// Usage: pnpm exec tsx video/prep/saleAlert.ts [--days 7]
// Finds the biggest gotchi (category 3) baazaar sale in the window and preps props.
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import type { SaleAlertProps, TraitTuple } from "../src/types";
import { arg, cachedSvg, coreQuery, fetchGotchi, writeProps } from "./lib";
import { ghstFromWei, shortAddr } from "./shape";

type ListingRow = {
  tokenId: string;
  priceInWei: string;
  seller: string;
  buyer: string | null;
  recipient: string;
  timePurchased: string;
};

async function main() {
  const days = Number(arg("--days") ?? 7);
  const since = Math.floor(Date.now() / 1000) - days * 86_400;

  const data = await coreQuery<{ erc721Listings: ListingRow[] }>(
    `query ($since: BigInt!) {
      erc721Listings(
        first: 5
        where: { timePurchased_gt: $since, category: 3 }
        orderBy: priceInWei
        orderDirection: desc
      ) { tokenId priceInWei seller buyer recipient timePurchased }
    }`,
    { since: String(since) },
  );
  const sale = data.erc721Listings[0];
  if (!sale) throw new Error(`no gotchi sales in the last ${days} days`);

  const { gotchi } = await fetchGotchi(sale.tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));
  const svg = await cachedSvg(`gotchi-${sale.tokenId}`, () => getGotchiSvg(sale.tokenId));
  const brs = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: gotchi.equippedWearables.filter((id) => id > 0),
    wearablesById,
  }).totalBrs;

  // optional USD via prod pulse
  let priceUsd: number | null = null;
  try {
    const pulse = (await (await fetch(process.env.PULSE_URL ?? "https://www.gotchicloset.com/api/pulse")).json()) as {
      latest?: Record<string, number>;
    };
    const ghstUsd = pulse.latest?.ghst_price_usd;
    if (ghstUsd) priceUsd = ghstFromWei(sale.priceInWei) * ghstUsd;
  } catch {
    priceUsd = null;
  }

  const soldAgoDays = Math.floor((Date.now() / 1000 - Number(sale.timePurchased)) / 86_400);
  const props: SaleAlertProps = {
    videoId: `salealert-${sale.tokenId}-${sale.timePurchased}`,
    gotchiId: sale.tokenId,
    name: gotchi.name || `Gotchi #${sale.tokenId}`,
    svg,
    priceGhst: ghstFromWei(sale.priceInWei),
    priceUsd,
    traits: gotchi.modifiedNumericTraits.slice(0, 6) as TraitTuple,
    brs,
    buyerShort: shortAddr(sale.buyer ?? sale.recipient),
    sellerShort: shortAddr(sale.seller),
    whenText: soldAgoDays === 0 ? "TODAY" : `${soldAgoDays}D AGO`,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Prep + render real** — run the prep, then render with the emitted props file name (printed by the script):

```bash
pnpm exec tsx video/prep/saleAlert.ts --days 7
cd video && pnpm exec remotion render src/index.ts SaleAlert out/salealert-latest.mp4 --props=props/<printed-name>.json
```

If the pulse `latest` map has no `ghst_price_usd` key, USD just shows nothing — acceptable (field is nullable by design). Extract + READ a still.

- [ ] **Step 7: Commit**

```bash
git add video/src/compositions/SaleAlert.tsx video/fixtures/saleAlert.json video/prep/saleAlert.ts video/src/Root.tsx
git commit -m "feat(video): SaleAlert composition + biggest-sale prep"
```

---

### Task 9: PulseRecap (composition + prep)

**Files:**
- Create: `video/src/compositions/PulseRecap.tsx`, `video/fixtures/pulseRecap.json`, `video/prep/pulseRecap.ts`
- Modify: `video/src/Root.tsx`

- [ ] **Step 1: Create `video/fixtures/pulseRecap.json`**

```json
{
  "videoId": "fixture-pulserecap",
  "weekLabel": "JUN 27 – JUL 3",
  "stats": [
    { "label": "GHST TRADED", "value": 48210, "unit": " GHST", "wow": 0.12 },
    { "label": "SALES", "value": 412, "unit": "", "wow": -0.05 },
    { "label": "UNIQUE BUYERS", "value": 96, "unit": "", "wow": 0.3 },
    { "label": "NEW RENTALS", "value": 233, "unit": "", "wow": null }
  ],
  "cameos": [
    {
      "svg": "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 56 V24 a16 16 0 0 1 32 0 V56 l-6-5 -5 5 -5-5 -5 5 -5-5 z\" fill=\"#e6e6fa\" stroke=\"#b847ff\" stroke-width=\"2\"/><circle cx=\"26\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/><circle cx=\"38\" cy=\"26\" r=\"3\" fill=\"#150b2e\"/></svg>",
      "name": "TEST GHOST",
      "caption": "sold for 12,500 GHST"
    }
  ],
  "greens": 4,
  "reds": 2
}
```

- [ ] **Step 2: Create `video/src/compositions/PulseRecap.tsx`**

Timing: 120 intro, 90 per stat, 90 per cameo, 100 verdict, 130 outro.

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { theme } from "../theme";
import type { PulseRecapProps } from "../types";

const INTRO = 120;
const PER_STAT = 90;
const PER_CAMEO = 90;
const VERDICT = 100;
const OUTRO = 130;

export function pulseRecapDuration(stats: number, cameos: number): number {
  return INTRO + stats * PER_STAT + cameos * PER_CAMEO + VERDICT + OUTRO;
}

const Wow: React.FC<{ wow: number | null }> = ({ wow }) => {
  if (wow === null) return null;
  const up = wow >= 0;
  const color = up ? theme.ecto : theme.red;
  return (
    <div style={{ fontSize: 34, color, fontFamily: theme.fontMono, marginTop: 26, ...theme.glow(color, 12) }}>
      {up ? "▲" : "▼"} {Math.abs(wow * 100).toFixed(0)}% vs last week
    </div>
  );
};

export const PulseRecap: React.FC<PulseRecapProps> = (p) => {
  const frame = useCurrentFrame();
  const cameosAt = INTRO + p.stats.length * PER_STAT;
  const verdictAt = cameosAt + p.cameos.length * PER_CAMEO;
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      {p.stats.map((_, i) => (
        <Sequence key={`t${i}`} from={INTRO + i * PER_STAT} durationInFrames={8}>
          <Audio src={AUDIO.tick} volume={0.5} />
        </Sequence>
      ))}
      <Sequence durationInFrames={INTRO}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 44 }}>
          <GradientText fontSize={92} style={{ textAlign: "center", lineHeight: 1.3 }}>
            Aavegotchi
          </GradientText>
          <GradientText fontSize={92} style={{ textAlign: "center" }}>
            Weekly Pulse
          </GradientText>
          <div style={{ fontSize: 32, color: theme.text, fontFamily: theme.fontMono }}>{p.weekLabel}</div>
          <div
            style={{
              fontSize: 90,
              color: theme.pink,
              opacity: interpolate(frame % 30, [0, 15, 30], [1, 0.4, 1]),
              ...theme.glow(theme.pink, 26),
            }}
          >
            ♥
          </div>
        </AbsoluteFill>
      </Sequence>
      {p.stats.map((s, i) => (
        <Sequence key={s.label} from={INTRO + i * PER_STAT} durationInFrames={PER_STAT}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <StatCounter label={s.label} value={s.value} suffix={s.unit} fontSize={104} />
            <Wow wow={s.wow} />
          </AbsoluteFill>
        </Sequence>
      ))}
      {p.cameos.map((c, i) => (
        <Sequence key={c.name + i} from={cameosAt + i * PER_CAMEO} durationInFrames={PER_CAMEO}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
            <div style={theme.label}>Star of the Week</div>
            <GotchiSprite svg={c.svg} size={520} />
            <GradientText fontSize={64}>{c.name}</GradientText>
            <div style={{ fontSize: 30, color: theme.gold, fontFamily: theme.fontMono }}>{c.caption}</div>
          </AbsoluteFill>
        </Sequence>
      ))}
      <Sequence from={verdictAt} durationInFrames={VERDICT}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 48 }}>
          <div style={theme.label}>Protocol Health</div>
          <div style={{ display: "flex", gap: 70, fontFamily: theme.fontMono }}>
            <div style={{ fontSize: 64, color: theme.ecto, ...theme.glow(theme.ecto, 16) }}>{p.greens} ●</div>
            <div style={{ fontSize: 64, color: theme.red, ...theme.glow(theme.red, 16) }}>{p.reds} ●</div>
          </div>
          <div style={{ fontSize: 26, color: theme.muted, fontFamily: theme.fontMono }}>
            full breakdown → gotchicloset.com/pulse
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={verdictAt + VERDICT}>
        <EndCard line="the weekly pulse, every week, automated" />
      </Sequence>
    </Scene>
  );
};
```

- [ ] **Step 3: Register in Root** with `calculateMetadata`:

```tsx
import pulseRecapFixture from "../fixtures/pulseRecap.json";
import { PulseRecap, pulseRecapDuration } from "./compositions/PulseRecap";
import type { PulseRecapProps } from "./types";
```

```tsx
    <Composition
      id="PulseRecap"
      component={PulseRecap}
      durationInFrames={900}
      {...size}
      defaultProps={pulseRecapFixture as PulseRecapProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: pulseRecapDuration(props.stats.length, props.cameos.length),
      })}
    />
```

- [ ] **Step 4: Fixture still smoke** — `cd video && pnpm exec remotion still src/index.ts PulseRecap out/pulse-f200.png --frame=200`. READ it: full-screen mono stat counter + green/red wow arrow over aurora.

- [ ] **Step 5: Create `video/prep/pulseRecap.ts`**

```ts
// Usage: pnpm exec tsx video/prep/pulseRecap.ts
// PULSE_URL env overrides the prod endpoint (e.g. http://localhost:8787/api/pulse).
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import type { PulseCameo, PulseRecapProps, PulseStat } from "../src/types";
import { cachedSvg, coreQuery, fetchGotchi, writeProps } from "./lib";
import { ghstFromWei, sumLastDays, weekLabel, type SeriesPoint } from "./shape";

type PulsePayloadLite = {
  updatedAt: number;
  series: Record<string, SeriesPoint[]>;
  deltas: Record<string, { wow: number | null; mom: number | null }>;
  verdicts: { verdict: string }[];
};

async function main() {
  const url = process.env.PULSE_URL ?? "https://www.gotchicloset.com/api/pulse";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pulse fetch ${res.status}`);
  const pulse = (await res.json()) as PulsePayloadLite;

  const stat = (key: string, label: string, unit: string): PulseStat => ({
    label,
    value: Math.round(sumLastDays(pulse.series[key], 7)),
    unit,
    wow: pulse.deltas[key]?.wow ?? null,
  });
  const stats = [
    stat("sales_volume_ghst", "GHST TRADED", " GHST"),
    stat("sales_count", "SALES", ""),
    stat("sales_buyers", "UNIQUE BUYERS", ""),
    stat("lendings_agreed", "NEW RENTALS", ""),
  ];

  // top sale of the week as the cameo
  const since = Math.floor(Date.now() / 1000) - 7 * 86_400;
  const sales = await coreQuery<{ erc721Listings: { tokenId: string; priceInWei: string }[] }>(
    `query ($since: BigInt!) {
      erc721Listings(first: 3, where: { timePurchased_gt: $since, category: 3 },
        orderBy: priceInWei, orderDirection: desc) { tokenId priceInWei }
    }`,
    { since: String(since) },
  );
  const cameos: PulseCameo[] = [];
  for (const s of sales.erc721Listings.slice(0, 1)) {
    try {
      const { gotchi } = await fetchGotchi(s.tokenId);
      const svg = await cachedSvg(`gotchi-${s.tokenId}`, () => getGotchiSvg(s.tokenId));
      cameos.push({
        svg,
        name: gotchi.name || `Gotchi #${s.tokenId}`,
        caption: `sold for ${ghstFromWei(s.priceInWei).toLocaleString("en-US")} GHST`,
      });
    } catch (e) {
      console.warn(`cameo skipped for ${s.tokenId}:`, e);
    }
  }

  const greens = pulse.verdicts.filter((v) => v.verdict === "green").length;
  const reds = pulse.verdicts.filter((v) => v.verdict === "red").length;

  const props: PulseRecapProps = {
    videoId: `pulserecap-${new Date(pulse.updatedAt).toISOString().slice(0, 10)}`,
    weekLabel: weekLabel(pulse.updatedAt),
    stats,
    cameos,
    greens,
    reds,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Prep + render real**

```bash
pnpm exec tsx video/prep/pulseRecap.ts
cd video && pnpm exec remotion render src/index.ts PulseRecap out/pulserecap-latest.mp4 --props=props/<printed-name>.json
```

Expected: ~30–35s MP4 with 4 stat scenes + 1 cameo. Note: `pulse.updatedAt` — check whether it's ms or seconds if the weekLabel looks wrong (if the label shows 1970, multiply by 1000).

- [ ] **Step 7: Commit**

```bash
git add video/src/compositions/PulseRecap.tsx video/fixtures/pulseRecap.json video/prep/pulseRecap.ts video/src/Root.tsx
git commit -m "feat(video): PulseRecap composition + prod pulse prep"
```

---

### Task 10: Golden frames + README + demo batch

**Files:**
- Create: `video/scripts/golden.mjs`, `video/README.md`, `video/golden/expected/*.png` (bootstrapped)

- [ ] **Step 1: Create `video/scripts/golden.mjs`**

```js
// Golden-frame regression check. Run from video/: node scripts/golden.mjs [--update]
// Renders one still per composition from fixture defaultProps and compares
// against golden/expected/. Bootstrap or accept changes with --update.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const CASES = [
  { comp: "Spotlight", frame: 400 },
  { comp: "FitReveal", frame: 120 },
  { comp: "SaleAlert", frame: 100 },
  { comp: "PulseRecap", frame: 200 },
];
const update = process.argv.includes("--update");
const expectedDir = "golden/expected";
const currentDir = "golden/current";
fs.mkdirSync(expectedDir, { recursive: true });
fs.mkdirSync(currentDir, { recursive: true });

let failed = 0;
for (const { comp, frame } of CASES) {
  const current = path.join(currentDir, `${comp}.png`);
  execSync(
    `pnpm exec remotion still src/index.ts ${comp} ${current} --frame=${frame}`,
    { stdio: "inherit" },
  );
  const expected = path.join(expectedDir, `${comp}.png`);
  if (!fs.existsSync(expected) || update) {
    fs.copyFileSync(current, expected);
    console.log(`[golden] ${comp}: baseline written`);
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(expected));
  const b = PNG.sync.read(fs.readFileSync(current));
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  const pct = (diff / (a.width * a.height)) * 100;
  if (pct > 0.5) {
    console.error(`[golden] ${comp}: FAIL — ${pct.toFixed(2)}% pixels differ`);
    failed++;
  } else {
    console.log(`[golden] ${comp}: ok (${pct.toFixed(2)}%)`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Bootstrap goldens and verify stability**

```bash
cd video && node scripts/golden.mjs   # writes baselines
cd video && node scripts/golden.mjs   # second run must pass
```

Expected: second run prints 4× `ok`. (If a comp is nondeterministic, that's a bug — nothing in the templates should depend on time or randomness; all motion is frame-driven.)

- [ ] **Step 3: Create `video/README.md`**

```markdown
# gotchi video engine

Programmatic vertical videos (1080×1920) from live Aavegotchi data. Remotion.
Style = the site's neon-spectral dark mode (tokens in `src/theme.ts`, kept in
sync with `src/styles/globals.css` `.dark`).
Spec: `docs/superpowers/specs/2026-07-03-gotchi-video-engine-design.md`.

## One-time setup
```bash
cd video && pnpm install
pnpm exec tsx video/prep/genAudio.ts   # from repo root: synthesizes the audio
```

## Make a video (all prep from REPO ROOT, all renders from video/)
```bash
# Spotlight / FitReveal for any gotchi
pnpm exec tsx video/prep/spotlight.ts --gotchi 4285
pnpm exec tsx video/prep/fitReveal.ts --gotchi 4285
# Biggest sale of the week
pnpm exec tsx video/prep/saleAlert.ts --days 7
# Weekly pulse recap (PULSE_URL env to override prod)
pnpm exec tsx video/prep/pulseRecap.ts

cd video
pnpm exec remotion render src/index.ts Spotlight out/spotlight-4285.mp4 --props=props/spotlight-4285.json
```

## Dev / preview
```bash
cd video && pnpm studio
```

## Tests
```bash
pnpm exec vitest run video/prep     # prep shaping units (repo root)
cd video && node scripts/golden.mjs # golden frames (--update to accept)
```

Audio is synthesized (`prep/genAudio.ts`). To upgrade, drop replacement CC0
files over `video/public/audio/*.wav` — same names, no code change.
```

- [ ] **Step 4: Demo batch — render the DAO-ammo set**

Pick 2–3 well-known gotchis (high-BRS leaderboard names read well; any IDs work) and render the full set:

```bash
pnpm exec tsx video/prep/spotlight.ts --gotchi <id1>
pnpm exec tsx video/prep/fitReveal.ts --gotchi <id1>
pnpm exec tsx video/prep/saleAlert.ts
pnpm exec tsx video/prep/pulseRecap.ts
cd video
pnpm exec remotion render src/index.ts Spotlight out/demo-spotlight.mp4 --props=props/spotlight-<id1>.json
pnpm exec remotion render src/index.ts FitReveal out/demo-fitreveal.mp4 --props=props/fitreveal-<id1>.json
pnpm exec remotion render src/index.ts SaleAlert out/demo-salealert.mp4 --props=props/<sale-file>.json
pnpm exec remotion render src/index.ts PulseRecap out/demo-pulserecap.mp4 --props=props/<pulse-file>.json
```

Verify each: file exists, duration sane (`SaleAlert` 15s, `Spotlight` 24s, others variable), extract + READ one still from each to confirm real art + readable text + the site look.

- [ ] **Step 5: Full test sweep**

```bash
pnpm exec vitest run video/prep
cd video && pnpm exec tsc --noEmit
pnpm typecheck
```

Expected: all clean (last one confirms no accidental root damage — video/ is outside root tsconfig include).

- [ ] **Step 6: Commit**

```bash
git add video/scripts/golden.mjs video/golden/expected/ video/README.md
git commit -m "feat(video): golden-frame checks, README, demo renders"
```

---

## Self-review (done at write time)

- **Spec coverage:** engine ✔ (Tasks 1–3), 4 templates ✔ (4, 7, 8, 9), determinism boundary ✔ (prep-only I/O, Task 5), theme-as-style ✔ (Task 3 — real site tokens, not invented ones), synthesized audio in place of CC0 pool ✔ (Task 2 — deliberate improvement: zero external assets; swap-compatible), golden frames + prep tests + fixtures ✔ (Tasks 5, 10), Phase 1 demo renders ✔ (Task 10). Megaphone/cron/self-serve = later plans per spec phases.
- **Style contract:** all tokens/gradients/fonts traced to `src/styles/globals.css` `.dark` + `tailwind.config.ts`; Task 4 Step 4 is the explicit look-review gate before the style propagates to the other three templates.
- **Known verify-points flagged inline:** `computeBRSBreakdown` exact signature (Tasks 6/7), `pulse.updatedAt` ms-vs-s (Task 9), Remotion version pinning (Task 1), google-fonts subpath name (Task 3), gotchi ID existence (Task 5).
- **Type consistency:** props types defined once in `video/src/types.ts`, imported by comps and prep; duration helpers exported from their composition files and used in Root.
