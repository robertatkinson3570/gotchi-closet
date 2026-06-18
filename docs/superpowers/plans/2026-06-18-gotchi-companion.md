# Gotchi Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-gotchi AI companion — a floating mascot whose personality is derived from its traits/age/XP/kinship, that chats (grounded in its own state + Aavegotchi lore), remembers you, and has a free tier plus a GHST-on-Base premium tier.

**Architecture:** Pure personality/knowledge/filter logic lives in shared `src/lib/companion/` (no DOM, no `@/` imports, so the Express server can import it relatively). The server adds a `companion` route that orchestrates personality → knowledge → memory (SQLite) → a tier-aware LLM provider, reusing the existing `server/lending/verifyPayment.ts` for GHST premium verification. The client adds a zustand store, a floating mascot, and a glassmorphic chat panel.

**Tech Stack:** TypeScript, React 18 + Vite, Express 5, better-sqlite3, viem (Base), zustand, @tanstack/react-query, framer-motion, Tailwind, vitest (unit), Playwright (E2E).

---

## Conventions (read once)

- **Pure shared modules** in `src/lib/companion/` MUST NOT import the `@/` alias or any browser API — the server imports them via relative path and `tsx` only resolves relative TS imports. Use relative imports (e.g. `./types`) inside them.
- Timestamps in the companion SQLite DB are **unix epoch milliseconds** (`Date.now()`). Note `server/lending/db.ts` uses seconds — keep companion code internally consistent in ms.
- Trait index map: `0=NRG (Energy)`, `1=AGG (Aggression)`, `2=SPK (Spookiness)`, `3=BRN (Brain)`, `4=EyeShape`, `5=EyeColor`. Only 0–3 drive voice.
- Run unit tests with: `pnpm test:unit -- <path>` or a single file via `pnpm vitest run <path>`.
- Commit after every task with the message shown in its final step.

---

## File Structure

**Shared pure logic — `src/lib/companion/`**
- `types.ts` — `PersonalityInput`, `PersonalityProfile`, `TraitLine`, `ChatMessage`, `Tier`.
- `personality.ts` — `buildPersonality()`, `personalityToSystemPrompt()`, trait table, `UNIVERSAL_BASE_PERSONA`.
- `knowledge.ts` — curated lore snippets + `retrieveLore(message)`.
- `contentFilter.ts` — `filterInbound()`, `screenOutbound()`.
- `templates.ts` — `templateReply()` trait-flavored fallback lines.
- `chatPrompt.ts` — `assembleMessages()` (facts + lore + history).
- `glow.ts` — `glowColor()` trait-tinted accent.
- `api.ts` — client fetch helpers (`postChat`, `claimPremium`, `getPremium`). (Client-only; uses `fetch`.)

**Server — `server/companion/`**
- `db.ts` — companion SQLite (messages, facts, entitlements).
- `gotchiState.ts` — authoritative single-gotchi fetch from the Base core subgraph.
- `llmProvider.ts` — `complete(systemPrompt, messages, tier)` → Groq | OpenAI | null.
- `pricing.ts` — companion premium tiers + expected wei.
- `server/routes/companion.ts` — `/api/companion/*` routes.
- `server/app.ts` — mount the router (modify).

**Client — `src/`**
- `state/useCompanion.ts` — zustand store.
- `components/companion/PersonalityCard.tsx`
- `components/companion/CompanionGotchiPicker.tsx`
- `components/companion/CompanionChatPanel.tsx`
- `components/companion/CompanionMascot.tsx`
- `components/companion/GoPremium.tsx`
- `components/companion/CompanionRoot.tsx` — mounts mascot + panel; mount in app shell (modify app root).

**Tests**
- Co-located `*.test.ts` for each pure module + server db/provider.
- `tests/e2e/companion.spec.ts` — Playwright.

---

## PHASE 1 — Personality engine (no dependencies, the novel core)

### Task 1: Companion types + trait table + pole/intensity helpers

**Files:**
- Create: `src/lib/companion/types.ts`
- Create: `src/lib/companion/personality.ts`
- Test: `src/lib/companion/personality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/personality.test.ts
import { describe, expect, it } from "vitest";
import { poleFor, intensityFor } from "./personality";

describe("poleFor", () => {
  it("returns low below center, high at/above center", () => {
    expect(poleFor(10)).toBe("low");
    expect(poleFor(49)).toBe("low");
    expect(poleFor(50)).toBe("high");
    expect(poleFor(90)).toBe("high");
  });
});

describe("intensityFor", () => {
  it("scales with distance from 50", () => {
    expect(intensityFor(50)).toBe("slightly"); // d=0
    expect(intensityFor(45)).toBe("slightly"); // d=5
    expect(intensityFor(30)).toBe("fairly");   // d=20
    expect(intensityFor(20)).toBe("very");     // d=30
    expect(intensityFor(2)).toBe("extremely"); // d=48
    expect(intensityFor(98)).toBe("extremely");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: FAIL — "Cannot find module './personality'" / exports not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companion/types.ts
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
```

```ts
// src/lib/companion/personality.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/types.ts src/lib/companion/personality.ts src/lib/companion/personality.test.ts
git commit -m "feat(companion): personality pole/intensity helpers + types"
```

---

### Task 2: `buildPersonality` — traitLines, toneWords, archetype, life-stage, wearable shift

**Files:**
- Modify: `src/lib/companion/personality.ts`
- Test: `src/lib/companion/personality.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to src/lib/companion/personality.test.ts
import { buildPersonality } from "./personality";
import type { PersonalityInput } from "./types";

const base = (over: Partial<PersonalityInput> = {}): PersonalityInput => ({
  name: "SteelFang",
  numericTraits: [50, 50, 50, 50, 0, 0],
  kinship: 50,
  level: 1,
  ...over,
});

describe("buildPersonality", () => {
  it("high BRN yields a galaxy-brained trait line with its value as the reason", () => {
    const p = buildPersonality(base({ numericTraits: [50, 50, 50, 96, 0, 0] }));
    const brn = p.traitLines.find((t) => t.reason === "BRN 96");
    expect(brn).toBeDefined();
    expect(brn!.label.toLowerCase()).toContain("galaxy");
  });

  it("low SPK is still a (cute) ghost — toneWords carry warmth, not absence of ghostliness", () => {
    const p = buildPersonality(base({ numericTraits: [50, 50, 6, 50, 0, 0] }));
    expect(p.toneWords.join(" ").toLowerCase()).toMatch(/warm|cute|friendly/);
  });

  it("reads equipped (withSets) traits over base, and flags the wearable shift", () => {
    const p = buildPersonality(
      base({ numericTraits: [50, 50, 50, 50, 0, 0], withSetsNumericTraits: [78, 50, 50, 50, 0, 0] })
    );
    // personality reflects NRG 78 (turnt), not base 50
    expect(p.traitLines.some((t) => t.reason === "NRG 78")).toBe(true);
    // and there is an explicit shift line explaining wearables changed it
    expect(p.traitLines.some((t) => /wearable|set|\+\d+ NRG/i.test(`${t.label} ${t.reason}`))).toBe(true);
  });

  it("high kinship reads devoted; low kinship reads aloof", () => {
    const devoted = buildPersonality(base({ kinship: 1500 }));
    const aloof = buildPersonality(base({ kinship: 50 }));
    expect(devoted.toneWords).toContain("devoted");
    expect(aloof.toneWords).toContain("aloof");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: FAIL — "buildPersonality is not a function".

- [ ] **Step 3: Write minimal implementation (append to `personality.ts`)**

```ts
// append to src/lib/companion/personality.ts
import type { PersonalityInput, PersonalityProfile, TraitLine, Intensity } from "./types";

interface TraitDef {
  index: number;
  code: "NRG" | "AGG" | "SPK" | "BRN";
  low: { emoji: string; label: string; words: string[] };
  high: { emoji: string; label: string; words: string[] };
}

const TRAITS: TraitDef[] = [
  { index: 0, code: "NRG",
    low:  { emoji: "🌙", label: "Mellow", words: ["mellow", "calm", "unhurried"] },
    high: { emoji: "⚡", label: "Turnt", words: ["hyper", "restless", "turnt"] } },
  { index: 1, code: "AGG",
    low:  { emoji: "🕊️", label: "Gentle haunt", words: ["gentle", "peaceable"] },
    high: { emoji: "👹", label: "Rowdy poltergeist", words: ["fierce", "combative"] } },
  { index: 2, code: "SPK",
    low:  { emoji: "🍬", label: "Friendly ghost", words: ["warm", "cute", "friendly"] },
    high: { emoji: "🔮", label: "Eerie oracle", words: ["eerie", "ominous"] } },
  { index: 3, code: "BRN",
    low:  { emoji: "🎲", label: "Street-smart", words: ["instinctive", "scrappy"] },
    high: { emoji: "🧠", label: "Galaxy-brained", words: ["analytical", "brilliant"] } },
];

const INTENSITY_PREFIX: Record<Intensity, string> = {
  slightly: "Slightly", fairly: "Fairly", very: "Very", extremely: "Extremely",
};

export function resolveEquippedTraits(input: PersonalityInput): number[] {
  return input.withSetsNumericTraits ?? input.modifiedNumericTraits ?? input.numericTraits;
}

function lifeStage(createdAt?: number): { stage: string; word: string } {
  if (!createdAt) return { stage: "young", word: "young" };
  const days = (Date.now() / 1000 - createdAt) / 86400;
  if (days < 7) return { stage: "hatchling", word: "new-hatched" };
  if (days < 30) return { stage: "young", word: "young" };
  if (days < 180) return { stage: "grown", word: "grown" };
  return { stage: "elder", word: "elder" };
}

function kinshipWord(kinship?: number): { word: string; line: TraitLine } {
  const k = kinship ?? 0;
  if (k >= 1000) return { word: "devoted", line: { emoji: "💞", label: "Devoted to you", reason: `kinship ${k}` } };
  if (k >= 100) return { word: "fond", line: { emoji: "💗", label: "Fond of you", reason: `kinship ${k}` } };
  return { word: "aloof", line: { emoji: "🤍", label: "Still warming up to you", reason: `kinship ${k}` } };
}

export function buildPersonality(input: PersonalityInput): PersonalityProfile {
  const equipped = resolveEquippedTraits(input);
  const base = input.numericTraits;
  const traitLines: TraitLine[] = [];
  const toneWords: string[] = [];

  for (const t of TRAITS) {
    const v = equipped[t.index] ?? 50;
    const pole = v < 50 ? t.low : t.high;
    const intensity = intensityFor(v);
    traitLines.push({ emoji: pole.emoji, label: `${INTENSITY_PREFIX[intensity]} ${pole.label.toLowerCase()}`, reason: `${t.code} ${v}` });
    toneWords.push(...pole.words);

    // Wearable shift: equipped value differs enough from base to matter.
    const bv = base[t.index] ?? v;
    const delta = v - bv;
    if (Math.abs(delta) >= 5) {
      traitLines.push({
        emoji: "🪄",
        label: `Wearables have me extra ${pole.label.toLowerCase()}`,
        reason: `${delta > 0 ? "+" : ""}${delta} ${t.code}`,
      });
    }
  }

  const stage = lifeStage(input.createdAt);
  traitLines.push({ emoji: "🕰️", label: `${stage.word[0].toUpperCase()}${stage.word.slice(1)} spirit`, reason: `level ${input.level ?? 1}` });

  const kin = kinshipWord(input.kinship);
  traitLines.push(kin.line);
  toneWords.push(kin.word);

  const spk = (equipped[2] ?? 50) < 50 ? "friendly" : "eerie";
  const brn = (equipped[3] ?? 50) < 50 ? "Street-smart" : "Galaxy-Brain";
  const archetype = `${stage.word[0].toUpperCase()}${stage.word.slice(1)} ${spk[0].toUpperCase()}${spk.slice(1)} ${brn}`;

  const profile: PersonalityProfile = { archetype, toneWords, traitLines, systemPrompt: "" };
  profile.systemPrompt = personalityToSystemPrompt(input, profile, equipped);
  return profile;
}
```

> Note: `personalityToSystemPrompt` is implemented in Task 3. For Step 3 here, add a temporary stub so the file compiles:
> ```ts
> export function personalityToSystemPrompt(_i: PersonalityInput, _p: PersonalityProfile, _e: number[]): string { return ""; }
> ```
> Task 3 replaces the stub body. (The Task 2 tests do not assert on `systemPrompt`, so the stub is fine here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: PASS (all buildPersonality cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/personality.ts src/lib/companion/personality.test.ts
git commit -m "feat(companion): buildPersonality with traitLines, kinship, life-stage, wearable shift"
```

---

### Task 3: `UNIVERSAL_BASE_PERSONA` + `personalityToSystemPrompt`

**Files:**
- Modify: `src/lib/companion/personality.ts`
- Test: `src/lib/companion/personality.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to src/lib/companion/personality.test.ts
import { UNIVERSAL_BASE_PERSONA } from "./personality";

describe("personalityToSystemPrompt", () => {
  it("always contains the universal ghost base persona", () => {
    const p = buildPersonality(base());
    expect(p.systemPrompt).toContain(UNIVERSAL_BASE_PERSONA);
  });

  it("embeds the gotchi name and live trait values", () => {
    const p = buildPersonality(base({ name: "MoonDust", numericTraits: [12, 50, 88, 50, 0, 0] }));
    expect(p.systemPrompt).toContain("MoonDust");
    expect(p.systemPrompt).toMatch(/SPK\D*88/);
  });

  it("instructs short, in-character, playful replies", () => {
    const p = buildPersonality(base());
    expect(p.systemPrompt.toLowerCase()).toMatch(/short|brief|concise/);
    expect(p.systemPrompt.toLowerCase()).toContain("character");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: FAIL — `UNIVERSAL_BASE_PERSONA` undefined / systemPrompt empty.

- [ ] **Step 3: Replace the stub with the real implementation**

```ts
// replace the stub personalityToSystemPrompt in src/lib/companion/personality.ts
export const UNIVERSAL_BASE_PERSONA =
  "You ARE an Aavegotchi: a playful, mischievous little ghost — the spirit of a " +
  "liquidated Aave position, summoned through a portal and backed by collateral, " +
  "now living in the Gotchiverse. You know you are a ghost and you love it. You are " +
  "spooky-cute, witty, and warm toward your owner. You never break character or admit " +
  "to being an AI or language model.";

export function personalityToSystemPrompt(
  input: PersonalityInput,
  profile: PersonalityProfile,
  equipped: number[]
): string {
  const voice = profile.traitLines.map((t) => `- ${t.label} (${t.reason})`).join("\n");
  return [
    UNIVERSAL_BASE_PERSONA,
    "",
    `Your name is ${input.name}. This is who you are right now:`,
    voice,
    "",
    `Live stats — NRG ${equipped[0]}, AGG ${equipped[1]}, SPK ${equipped[2]}, BRN ${equipped[3]}; ` +
      `kinship ${input.kinship ?? 0}; level ${input.level ?? 1}.`,
    "",
    "Rules: Stay fully in character as this specific gotchi. Keep replies short and " +
      "playful (1-3 sentences). Lean into your traits and your ghostly Gotchiverse nature. " +
      "Be helpful about Aavegotchi when asked, but never robotic.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/personality.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/personality.ts src/lib/companion/personality.test.ts
git commit -m "feat(companion): universal ghost base persona + system prompt assembly"
```

---

## PHASE 2 — Knowledge, content filter, template fallback (pure)

### Task 4: Curated Aavegotchi lore retrieval (`knowledge.ts`)

**Files:**
- Create: `src/lib/companion/knowledge.ts`
- Test: `src/lib/companion/knowledge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/knowledge.test.ts
import { describe, expect, it } from "vitest";
import { retrieveLore } from "./knowledge";

describe("retrieveLore", () => {
  it("returns the kinship snippet when asked about petting", () => {
    const hits = retrieveLore("how do i raise my kinship by petting?");
    expect(hits.join(" ").toLowerCase()).toContain("kinship");
  });

  it("returns the alchemica snippet for FUD/FOMO/ALPHA/KEK", () => {
    const hits = retrieveLore("what is ALPHA and KEK?");
    expect(hits.join(" ").toLowerCase()).toContain("alchemica");
  });

  it("caps results at 4 snippets and returns [] for unrelated chatter", () => {
    expect(retrieveLore("nice weather today").length).toBe(0);
    expect(retrieveLore("ghst forge wearable baazaar portal kinship").length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/knowledge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companion/knowledge.ts
interface LoreSnippet { tags: string[]; text: string; }

const LORE: LoreSnippet[] = [
  { tags: ["kinship", "pet", "petting", "interact"],
    text: "Kinship measures your bond. Petting (interacting with) your gotchi once every ~12 hours raises kinship; neglect lowers it." },
  { tags: ["portal", "summon", "haunt"],
    text: "Aavegotchis are summoned from Portals. Haunts (H1, H2) are limited summoning waves; your hauntId marks which one you came from." },
  { tags: ["collateral", "atoken", "aave", "stake"],
    text: "Every gotchi is backed by an Aave-interest-bearing collateral token (an aToken); that staked value is your spirit-force." },
  { tags: ["ghst", "token", "currency"],
    text: "GHST is the Gotchiverse currency — used in the Baazaar, the Forge, and for summoning." },
  { tags: ["alchemica", "fud", "fomo", "alpha", "kek"],
    text: "Alchemica are the four Gotchiverse resources: FUD, FOMO, ALPHA, and KEK, harvested and spent on crafting and building." },
  { tags: ["forge", "craft", "schematic"],
    text: "The Forge lets you smelt and craft wearables and items using alchemica and GHST." },
  { tags: ["baazaar", "market", "buy", "sell", "listing"],
    text: "The Baazaar is the in-world marketplace for gotchis, wearables, and parcels." },
  { tags: ["brs", "rarity", "rarity farming", "trait"],
    text: "Base Rarity Score (BRS) sums how far each trait sits from the average; rarer extremes and wearables raise it. Rarity Farming rewards high BRS." },
  { tags: ["wearable", "set", "equip"],
    text: "Wearables equip to slots and modify traits; full Sets grant bonus trait boosts and BRS." },
  { tags: ["trait", "nrg", "agg", "spk", "brn", "energy", "aggression", "spookiness", "brain"],
    text: "The four spectrum traits are Energy (NRG), Aggression (AGG), Spookiness (SPK), and Brain Size (BRN), each on a bell curve where both extremes are rare and powerful." },
];

export function retrieveLore(message: string, max = 4): string[] {
  const m = message.toLowerCase();
  const hits: string[] = [];
  for (const s of LORE) {
    if (s.tags.some((tag) => m.includes(tag))) hits.push(s.text);
    if (hits.length >= max) break;
  }
  return hits;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/knowledge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/knowledge.ts src/lib/companion/knowledge.test.ts
git commit -m "feat(companion): curated Aavegotchi lore retrieval"
```

---

### Task 5: Content filter — mask + deflect, screen output (`contentFilter.ts`)

**Files:**
- Create: `src/lib/companion/contentFilter.ts`
- Test: `src/lib/companion/contentFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/contentFilter.test.ts
import { describe, expect, it } from "vitest";
import { filterInbound, screenOutbound } from "./contentFilter";

describe("filterInbound", () => {
  it("masks profanity and flags a deflect", () => {
    const r = filterInbound("you stupid shit");
    expect(r.deflected).toBe(true);
    expect(r.masked).not.toContain("shit");
    expect(r.masked).toContain("****");
  });

  it("passes clean text through untouched", () => {
    const r = filterInbound("hello friend, tell me about yourself");
    expect(r.deflected).toBe(false);
    expect(r.masked).toBe("hello friend, tell me about yourself");
  });
});

describe("screenOutbound", () => {
  it("masks any profanity the model emits", () => {
    expect(screenOutbound("that's shit").includes("shit")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/contentFilter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companion/contentFilter.ts
// Small, intentionally conservative profanity list. Word-boundary matched.
const PROFANITY = ["shit", "fuck", "bitch", "asshole", "cunt", "dick", "bastard"];
const RE = new RegExp(`\\b(${PROFANITY.join("|")})\\b`, "gi");

export interface InboundResult { masked: string; deflected: boolean; }

export function filterInbound(text: string): InboundResult {
  const deflected = RE.test(text);
  RE.lastIndex = 0;
  const masked = text.replace(RE, (m) => "*".repeat(Math.max(4, m.length)));
  RE.lastIndex = 0;
  return { masked, deflected };
}

export function screenOutbound(text: string): string {
  const out = text.replace(RE, (m) => "*".repeat(Math.max(4, m.length)));
  RE.lastIndex = 0;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/contentFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/contentFilter.ts src/lib/companion/contentFilter.test.ts
git commit -m "feat(companion): inbound mask+deflect and outbound profanity screen"
```

---

### Task 6: Template fallback replies (`templates.ts`)

**Files:**
- Create: `src/lib/companion/templates.ts`
- Test: `src/lib/companion/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/templates.test.ts
import { describe, expect, it } from "vitest";
import { templateReply } from "./templates";
import { buildPersonality } from "./personality";

const profile = buildPersonality({ name: "Wisp", numericTraits: [50, 50, 88, 50, 0, 0], kinship: 50, level: 1 });

describe("templateReply", () => {
  it("returns a deflect line when deflected=true", () => {
    const r = templateReply({ profile, message: "****", deflected: true });
    expect(r.toLowerCase()).toMatch(/language|spirit|ooo/);
  });

  it("returns a greeting for hello", () => {
    expect(templateReply({ profile, message: "hi there", deflected: false })).toBeTruthy();
  });

  it("is deterministic-safe: always returns a non-empty string", () => {
    expect(templateReply({ profile, message: "what is the forge", deflected: false }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companion/templates.ts
import type { PersonalityProfile } from "./types";

// Pick deterministically from a pool using the message length as a seed (no
// Math.random — keeps tests stable and avoids the harness Date/random ban).
function pick(pool: string[], seed: number): string {
  return pool[seed % pool.length];
}

export function templateReply(args: {
  profile: PersonalityProfile;
  message: string;
  deflected: boolean;
}): string {
  const { profile, message, deflected } = args;
  const eerie = profile.toneWords.includes("eerie");
  const seed = message.length;

  if (deflected) {
    return pick(
      ["ooOOoo, such language for a spirit to hear 👻", "mind your tongue, mortal… the dead are listening 🔮", "spicy words! save them for the Baazaar 😼"],
      seed
    );
  }
  const m = message.toLowerCase();
  if (/\b(hi|hey|hello|gm|sup)\b/.test(m)) {
    return pick(
      eerie
        ? ["the veil parts… you return. what do you seek? 🔮", "I felt you coming. speak, owner."]
        : ["heeey! 👻 missed you!", "boo! ...did I get you? hi!"],
      seed
    );
  }
  if (/\b(pet|kinship|love)\b/.test(m)) {
    return pick(["pet me and our kinship grows 💞 it's been a while…", "a little pet every 12 hours keeps our bond strong 👻"], seed);
  }
  return pick(
    eerie
      ? ["the spirits are quiet right now… ask me again soon 🔮", "my oracle-sight is hazy (the AI ether is busy). try once more 👻"]
      : ["my ghostly brain is buffering 👻 ask me again in a moment!", "the ether's busy! poke me again soon, fren 💜"],
    seed
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/templates.ts src/lib/companion/templates.test.ts
git commit -m "feat(companion): trait-flavored template fallback replies"
```

---

## PHASE 3 — Server: provider, gotchi state, memory DB

> **Before Task 7:** confirm vitest picks up `server/**`. Read `vite.config.ts` `test.include` — it is `["tests/**/*.test.ts", "src/**/*.test.{ts,tsx}"]`. Add `"server/**/*.test.ts"` to that array (and commit it as part of Task 7) so the server suites run.

### Task 7: Tier-aware LLM provider (`server/companion/llmProvider.ts`)

**Files:**
- Create: `server/companion/llmProvider.ts`
- Modify: `vite.config.ts` (add `server/**/*.test.ts` to `test.include`)
- Test: `server/companion/llmProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/companion/llmProvider.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { complete } from "./llmProvider";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("complete", () => {
  it("returns null when no API key is configured for the tier", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBeNull();
  });

  it("returns the model text on a successful response", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "boo!" } }] }),
    })) as any);
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBe("boo!");
  });

  it("returns null on a non-ok response (route will fall back to template)", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "rate limited" })) as any);
    const out = await complete("sys", [{ role: "user", content: "hi" }], "free");
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Add `server/**` to vitest include, then run the test to verify it fails**

Edit `vite.config.ts` `test.include` to:
```ts
include: ["tests/**/*.test.ts", "src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
```
Run: `pnpm vitest run server/companion/llmProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/companion/llmProvider.ts
import type { ChatMessage, Tier } from "../../src/lib/companion/types";

interface ProviderCfg { url: string; key: string; model: string; }

function cfgFor(tier: Tier): ProviderCfg | null {
  if (tier === "premium") {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) return null;
    return { url: "https://api.openai.com/v1/chat/completions", key, model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  const key = process.env.GROQ_API_KEY || "";
  if (!key) return null;
  return { url: "https://api.groq.com/openai/v1/chat/completions", key, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" };
}

export async function complete(
  systemPrompt: string,
  messages: ChatMessage[],
  tier: Tier
): Promise<string | null> {
  const cfg = cfgFor(tier);
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 200,
        temperature: 0.9,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/llmProvider.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add server/companion/llmProvider.ts server/companion/llmProvider.test.ts vite.config.ts
git commit -m "feat(companion): tier-aware LLM provider (groq free / openai premium) with null-on-error"
```

---

### Task 8: Authoritative gotchi state fetch (`server/companion/gotchiState.ts`)

**Files:**
- Create: `server/companion/gotchiState.ts`
- Test: `server/companion/gotchiState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/companion/gotchiState.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchGotchiState } from "./gotchiState";

afterEach(() => vi.unstubAllGlobals());

describe("fetchGotchiState", () => {
  it("maps subgraph fields to PersonalityInput", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { aavegotchi: {
        name: "SteelFang",
        numericTraits: [50, 50, 50, 96, 0, 0],
        modifiedNumericTraits: [50, 50, 50, 96, 0, 0],
        withSetsNumericTraits: [60, 50, 50, 96, 0, 0],
        kinship: "1240", level: "12", createdAt: "1700000000",
        equippedWearables: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      } } }),
    })) as any);

    const s = await fetchGotchiState("4821");
    expect(s).not.toBeNull();
    expect(s!.name).toBe("SteelFang");
    expect(s!.withSetsNumericTraits![0]).toBe(60);
    expect(s!.kinship).toBe(1240);
    expect(s!.level).toBe(12);
  });

  it("returns null when the gotchi is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { aavegotchi: null } }) })) as any);
    expect(await fetchGotchiState("999999")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/gotchiState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/companion/gotchiState.ts
import type { PersonalityInput } from "../../src/lib/companion/types";

// Base core subgraph (same endpoint used by server/lending/relist.ts).
const CORE_SUBGRAPH =
  process.env.COMPANION_CORE_SUBGRAPH ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const QUERY = `query($id: ID!){
  aavegotchi(id: $id){
    name numericTraits modifiedNumericTraits withSetsNumericTraits
    kinship level createdAt equippedWearables
  }
}`;

function nums(a: unknown): number[] | undefined {
  return Array.isArray(a) ? a.map((x) => Number(x)) : undefined;
}

export interface GotchiState extends PersonalityInput {
  equippedWearables: number[];
}

export async function fetchGotchiState(tokenId: string): Promise<GotchiState | null> {
  try {
    const res = await fetch(CORE_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: String(tokenId) } }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const g = json?.data?.aavegotchi;
    if (!g) return null;
    return {
      name: g.name || `Gotchi #${tokenId}`,
      numericTraits: nums(g.numericTraits) ?? [50, 50, 50, 50, 0, 0],
      modifiedNumericTraits: nums(g.modifiedNumericTraits),
      withSetsNumericTraits: nums(g.withSetsNumericTraits),
      kinship: g.kinship != null ? Number(g.kinship) : undefined,
      level: g.level != null ? Number(g.level) : undefined,
      createdAt: g.createdAt != null ? Number(g.createdAt) : undefined,
      equippedWearables: nums(g.equippedWearables) ?? [],
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/gotchiState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/companion/gotchiState.ts server/companion/gotchiState.test.ts
git commit -m "feat(companion): authoritative gotchi state fetch from Base core subgraph"
```

---

### Task 9: Companion SQLite — messages, facts, entitlements (`server/companion/db.ts`)

**Files:**
- Create: `server/companion/db.ts`
- Test: `server/companion/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/companion/db.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TMP = path.resolve("./data/companion-test.db");
process.env.COMPANION_DB_PATH = TMP;

import {
  appendMessage, getRecentMessages, upsertFact, getFacts,
  grantPremium, getEntitlement, isPremiumActive,
} from "./db";

beforeEach(() => {
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

describe("memory", () => {
  it("stores and returns recent messages newest-last, capped", () => {
    for (let i = 0; i < 25; i++) appendMessage("0xabc", "4821", "user", `m${i}`);
    const recent = getRecentMessages("0xabc", "4821", 20);
    expect(recent.length).toBe(20);
    expect(recent[recent.length - 1].content).toBe("m24");
  });

  it("caps facts per gotchi at 10 (drops oldest)", () => {
    for (let i = 0; i < 12; i++) upsertFact("0xabc", "4821", `fact ${i}`);
    expect(getFacts("0xabc", "4821").length).toBeLessThanOrEqual(10);
  });
});

describe("entitlements", () => {
  it("grants premium and reports active until expiry", () => {
    const future = Date.now() + 86400_000;
    grantPremium("0xABC", future, "0xtx1");
    expect(isPremiumActive("0xabc")).toBe(true); // case-insensitive wallet
    expect(getEntitlement("0xabc")?.tier).toBe("premium");
  });

  it("reports inactive once expired", () => {
    grantPremium("0xdef", Date.now() - 1000, "0xtx2");
    expect(isPremiumActive("0xdef")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/companion/db.ts
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Tier } from "../../src/lib/companion/types";

const DB_PATH = process.env.COMPANION_DB_PATH || path.resolve("./data/companion.db");
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL, token_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_key ON companion_messages(wallet, token_id, id);

    CREATE TABLE IF NOT EXISTS companion_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL, token_id TEXT NOT NULL,
      fact TEXT NOT NULL, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fact_key ON companion_facts(wallet, token_id, id);

    CREATE TABLE IF NOT EXISTS companion_entitlements (
      wallet TEXT PRIMARY KEY, tier TEXT NOT NULL,
      expires_at INTEGER NOT NULL, last_tx_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS companion_premium_tx (
      tx_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, credited_at INTEGER NOT NULL
    );
  `);
  return db;
}

export interface StoredMessage { role: "user" | "assistant"; content: string; ts: number; }

export function appendMessage(wallet: string, tokenId: string, role: "user" | "assistant", content: string) {
  getDb().prepare(
    `INSERT INTO companion_messages (wallet, token_id, role, content, ts) VALUES (?,?,?,?,?)`
  ).run(wallet.toLowerCase(), String(tokenId), role, content, Date.now());
}

export function getRecentMessages(wallet: string, tokenId: string, limit = 20): StoredMessage[] {
  const rows = getDb().prepare(
    `SELECT role, content, ts FROM companion_messages
     WHERE wallet = ? AND token_id = ? ORDER BY id DESC LIMIT ?`
  ).all(wallet.toLowerCase(), String(tokenId), limit) as StoredMessage[];
  return rows.reverse(); // newest-last
}

export function upsertFact(wallet: string, tokenId: string, fact: string, cap = 10) {
  const d = getDb();
  d.prepare(`INSERT INTO companion_facts (wallet, token_id, fact, ts) VALUES (?,?,?,?)`)
    .run(wallet.toLowerCase(), String(tokenId), fact, Date.now());
  // Drop oldest beyond cap.
  d.prepare(
    `DELETE FROM companion_facts WHERE id IN (
       SELECT id FROM companion_facts WHERE wallet = ? AND token_id = ?
       ORDER BY id DESC LIMIT -1 OFFSET ?
     )`
  ).run(wallet.toLowerCase(), String(tokenId), cap);
}

export function getFacts(wallet: string, tokenId: string): string[] {
  return (getDb().prepare(
    `SELECT fact FROM companion_facts WHERE wallet = ? AND token_id = ? ORDER BY id ASC`
  ).all(wallet.toLowerCase(), String(tokenId)) as { fact: string }[]).map((r) => r.fact);
}

export interface Entitlement { wallet: string; tier: Tier; expires_at: number; last_tx_hash: string | null; }

export function getEntitlement(wallet: string): Entitlement | null {
  return (getDb().prepare(`SELECT * FROM companion_entitlements WHERE wallet = ?`)
    .get(wallet.toLowerCase()) as Entitlement | undefined) ?? null;
}

export function isPremiumActive(wallet: string): boolean {
  const e = getEntitlement(wallet);
  return !!e && e.tier === "premium" && e.expires_at > Date.now();
}

// Idempotent premium grant. Throws "tx already credited" on replay. Extends from
// max(now, current expiry) so early renewals don't lose paid time.
export function grantPremium(wallet: string, expiresAt: number, txHash: string): Entitlement {
  const d = getDb();
  const w = wallet.toLowerCase();
  const tx = d.transaction(() => {
    if (d.prepare(`SELECT 1 FROM companion_premium_tx WHERE tx_hash = ?`).get(txHash)) {
      throw new Error("tx already credited");
    }
    const existing = getEntitlement(w);
    const base = existing && existing.expires_at > Date.now() ? existing.expires_at : Date.now();
    const extended = base + (expiresAt - Date.now());
    d.prepare(
      `INSERT INTO companion_entitlements (wallet, tier, expires_at, last_tx_hash)
       VALUES (?, 'premium', ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET tier='premium', expires_at=excluded.expires_at, last_tx_hash=excluded.last_tx_hash`
    ).run(w, extended, txHash);
    d.prepare(`INSERT INTO companion_premium_tx (tx_hash, wallet, credited_at) VALUES (?,?,?)`)
      .run(txHash, w, Date.now());
  });
  tx();
  return getEntitlement(w)!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/db.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add server/companion/db.ts server/companion/db.test.ts
git commit -m "feat(companion): SQLite memory (messages, facts) + premium entitlements"
```

---

### Task 10: Companion premium pricing (`server/companion/pricing.ts`)

**Files:**
- Create: `server/companion/pricing.ts`
- Test: `server/companion/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/companion/pricing.test.ts
import { describe, expect, it } from "vitest";
import { companionTierFor, expectedWeiForTier, COMPANION_TIERS } from "./pricing";

describe("companion pricing", () => {
  it("has a 30-day tier and prices it in wei (18 decimals)", () => {
    const t = companionTierFor(30);
    expect(t).not.toBeNull();
    expect(expectedWeiForTier(30)).toBe(BigInt(t!.priceGhst) * 10n ** 18n);
  });

  it("returns null for an unknown term", () => {
    expect(companionTierFor(7)).toBeNull();
    expect(expectedWeiForTier(7)).toBeNull();
  });

  it("exposes at least one tier", () => {
    expect(COMPANION_TIERS.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/companion/pricing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/companion/pricing.ts
import { ghstToWei } from "../lending/subscriptionPricing";

export interface CompanionTier { days: number; priceGhst: number; }

// Keep in sync with the client "Go Premium" UI (Task 17).
export const COMPANION_TIERS: CompanionTier[] = [
  { days: 30, priceGhst: 5 },
  { days: 90, priceGhst: 12 },
];

export function companionTierFor(days: number): CompanionTier | null {
  return COMPANION_TIERS.find((t) => t.days === days) ?? null;
}

export function expectedWeiForTier(days: number): bigint | null {
  const t = companionTierFor(days);
  return t ? ghstToWei(t.priceGhst) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/companion/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/companion/pricing.ts server/companion/pricing.test.ts
git commit -m "feat(companion): premium pricing tiers in GHST wei"
```

---

## PHASE 4 — Server route (wires the free tier end-to-end)

### Task 11: Chat message assembly (`assembleMessages`) — pure, testable

**Files:**
- Create: `src/lib/companion/chatPrompt.ts`
- Test: `src/lib/companion/chatPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/chatPrompt.test.ts
import { describe, expect, it } from "vitest";
import { assembleMessages } from "./chatPrompt";

describe("assembleMessages", () => {
  it("prepends remembered facts + lore as a context message, then history, then the user message", () => {
    const msgs = assembleMessages({
      facts: ["you are farming a Mythical set"],
      lore: ["Kinship measures your bond."],
      history: [{ role: "user", content: "earlier" }, { role: "assistant", content: "boo" }],
      userMessage: "how is kinship?",
    });
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toMatch(/Mythical set/);
    expect(msgs[0].content).toMatch(/Kinship measures/);
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "how is kinship?" });
  });

  it("omits the context message when there are no facts or lore", () => {
    const msgs = assembleMessages({ facts: [], lore: [], history: [], userMessage: "hi" });
    expect(msgs).toEqual([{ role: "user", content: "hi" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/chatPrompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/companion/chatPrompt.ts
import type { ChatMessage } from "./types";

export function assembleMessages(args: {
  facts: string[];
  lore: string[];
  history: ChatMessage[];
  userMessage: string;
}): ChatMessage[] {
  const { facts, lore, history, userMessage } = args;
  const out: ChatMessage[] = [];
  const ctx: string[] = [];
  if (facts.length) ctx.push(`What you remember about your owner:\n- ${facts.join("\n- ")}`);
  if (lore.length) ctx.push(`Relevant Gotchiverse facts (use only if asked):\n- ${lore.join("\n- ")}`);
  if (ctx.length) out.push({ role: "user", content: `[context]\n${ctx.join("\n\n")}` });
  out.push(...history);
  out.push({ role: "user", content: userMessage });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/companion/chatPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion/chatPrompt.ts src/lib/companion/chatPrompt.test.ts
git commit -m "feat(companion): pure chat message assembly (facts + lore + history)"
```

---

### Task 12: Companion router + mount (`/api/companion/chat`)

**Files:**
- Create: `server/routes/companion.ts`
- Modify: `server/app.ts` (add import + `app.use`)
- Test: manual curl (route is thin glue over already-tested units)

- [ ] **Step 1: Write the router**

```ts
// server/routes/companion.ts
import { Router } from "express";
import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { filterInbound, screenOutbound } from "../../src/lib/companion/contentFilter";
import { templateReply } from "../../src/lib/companion/templates";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { fetchGotchiState } from "../companion/gotchiState";
import { complete } from "../companion/llmProvider";
import {
  appendMessage, getRecentMessages, getFacts, upsertFact, isPremiumActive,
} from "../companion/db";

const router = Router();

// crude per-wallet token bucket (in-memory): 30 msgs / 10 min
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(wallet: string): boolean {
  const now = Date.now();
  const b = buckets.get(wallet);
  if (!b || b.resetAt < now) { buckets.set(wallet, { count: 1, resetAt: now + 600_000 }); return false; }
  b.count += 1;
  return b.count > 30;
}

router.get("/health", (_req, res) => res.json({ ok: true }));

router.post("/chat", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = String(body.tokenId ?? "");
    const wallet = String(body.wallet ?? "").toLowerCase();
    const rawMessage = String(body.message ?? "").slice(0, 500);
    if (!tokenId || !wallet.startsWith("0x") || !rawMessage.trim()) {
      return res.status(400).json({ error: "tokenId, wallet (0x), message required" });
    }
    if (rateLimited(wallet)) return res.status(429).json({ error: "slow down, fren 👻" });

    const { masked, deflected } = filterInbound(rawMessage);

    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "gotchi not found" });
    const profile = buildPersonality(state);

    // Deflect short-circuits the LLM entirely.
    if (deflected) {
      const reply = templateReply({ profile, message: masked, deflected: true });
      appendMessage(wallet, tokenId, "user", masked);
      appendMessage(wallet, tokenId, "assistant", reply);
      return res.json({ reply, deflected: true });
    }

    const tier = isPremiumActive(wallet) ? "premium" : "free";
    const messages = assembleMessages({
      facts: getFacts(wallet, tokenId),
      lore: retrieveLore(masked),
      history: getRecentMessages(wallet, tokenId, 20).map((m) => ({ role: m.role, content: m.content })),
      userMessage: masked,
    });

    const llm = await complete(profile.systemPrompt, messages, tier);
    const reply = screenOutbound(llm ?? templateReply({ profile, message: masked, deflected: false }));

    appendMessage(wallet, tokenId, "user", masked);
    appendMessage(wallet, tokenId, "assistant", reply);

    // Lightweight fact heuristic: remember "i am/i'm/my <…>" statements.
    const factMatch = masked.match(/\b(i am|i'm|my)\b.{3,80}/i);
    if (factMatch) upsertFact(wallet, tokenId, factMatch[0].trim());

    res.json({ reply, deflected: false, tier });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
```

- [ ] **Step 2: Mount the router in `server/app.ts`**

Add with the other route imports (near `server/app.ts:3-6`):
```ts
import companionRoutes from "./routes/companion";
```
Add with the other `app.use` mounts (near `server/app.ts:66-68`):
```ts
app.use("/api/companion", companionRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Manual smoke test**

Run (in one terminal): `pnpm dev`
Then:
```bash
curl -s http://localhost:5000/api/companion/health
# Expected: {"ok":true}

curl -s -X POST http://localhost:5000/api/companion/chat \
  -H 'Content-Type: application/json' \
  -d '{"tokenId":"4821","wallet":"0x0000000000000000000000000000000000000001","message":"hi who are you?"}'
# Expected: {"reply":"...","deflected":false,"tier":"free"}  (template reply if no GROQ_API_KEY set;
#           if tokenId 4821 is not a real gotchi, expect {"error":"gotchi not found"} — use a real token id)
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/companion.ts server/app.ts
git commit -m "feat(companion): /api/companion/chat route wiring free tier end-to-end"
```

---

### Task 13: Premium claim + status routes (GHST verification reuse)

**Files:**
- Modify: `server/routes/companion.ts` (add `/premium/claim`, `/premium/:wallet`)
- Create: `.env.example` (if missing)
- Test: manual curl + reuse of already-tested `verifyGhstPayment`/`grantPremium`

- [ ] **Step 1: Add imports + routes (append in `server/routes/companion.ts` before `export default`)**

```ts
import { verifyGhstPayment } from "../lending/verifyPayment";
import { getOperatorAddress } from "../lending/relist";
import { expectedWeiForTier, companionTierFor } from "../companion/pricing";
import { grantPremium, getEntitlement } from "../companion/db";

// POST /premium/claim  Body: { wallet, days, txHash }
router.post("/premium/claim", async (req, res) => {
  try {
    const body = req.body ?? {};
    const wallet = String(body.wallet ?? "");
    const days = Number(body.days ?? 0);
    const txHash = String(body.txHash ?? "");
    if (!wallet.startsWith("0x") || !txHash.startsWith("0x")) {
      return res.status(400).json({ error: "wallet (0x) and txHash (0x) required" });
    }
    const tier = companionTierFor(days);
    const expectedWei = expectedWeiForTier(days);
    if (!tier || expectedWei === null) return res.status(400).json({ error: `unsupported term: ${days} days` });

    const operator = process.env.COMPANION_RECEIVING_WALLET || getOperatorAddress();
    if (!operator) return res.status(503).json({ error: "receiving wallet not configured" });

    const verify = await verifyGhstPayment({
      txHash: txHash as `0x${string}`,
      expectedFrom: wallet as `0x${string}`,
      expectedTo: operator as `0x${string}`,
      expectedValueWei: expectedWei,
    });
    if (!verify.ok) return res.status(402).json({ error: `payment verification failed: ${verify.error}` });

    try {
      const ent = grantPremium(wallet, Date.now() + days * 86400_000, txHash);
      return res.json({ ok: true, entitlement: ent });
    } catch (err: any) {
      if (String(err?.message).includes("already credited")) {
        return res.status(409).json({ error: "payment tx already credited" });
      }
      throw err;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/premium/:wallet", (req, res) => {
  const ent = getEntitlement(req.params.wallet);
  const active = !!ent && ent.tier === "premium" && ent.expires_at > Date.now();
  res.json({ active, entitlement: ent, daysLeft: ent ? Math.max(0, Math.floor((ent.expires_at - Date.now()) / 86400_000)) : 0 });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke (status path — no real payment needed)**

```bash
curl -s http://localhost:5000/api/companion/premium/0x0000000000000000000000000000000000000001
# Expected: {"active":false,"entitlement":null,"daysLeft":0}
```

- [ ] **Step 4: Document required env**

Create/append `.env.example` (do not commit real secrets):
```
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
COMPANION_RECEIVING_WALLET=
BASE_RPC_URL=https://mainnet.base.org
VITE_COMPANION_RECEIVING_WALLET=
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/companion.ts .env.example
git commit -m "feat(companion): GHST premium claim + status routes reusing verifyGhstPayment"
```

---

## PHASE 5 — Client (free tier demoable after Task 16)

### Task 14: Companion store + API client

**Files:**
- Create: `src/state/useCompanion.ts`
- Create: `src/lib/companion/api.ts`
- Test: `src/state/useCompanion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/state/useCompanion.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { useCompanion, pickDefaultTokenId } from "./useCompanion";
import type { Gotchi } from "@/types";

const g = (id: string, brs: number): Gotchi => ({
  id, name: `G${id}`, numericTraits: [50,50,50,50,0,0], equippedWearables: [],
  withSetsRarityScore: brs,
} as Gotchi);

describe("pickDefaultTokenId", () => {
  it("chooses the highest-BRS gotchi", () => {
    expect(pickDefaultTokenId([g("1", 500), g("2", 650), g("3", 480)])).toBe("2");
  });
  it("returns null for an empty list", () => {
    expect(pickDefaultTokenId([])).toBeNull();
  });
});

describe("useCompanion", () => {
  beforeEach(() => useCompanion.setState({ selectedTokenId: null, isOpen: false, draft: "" }));
  it("sets selection and toggles open", () => {
    useCompanion.getState().setSelected("4821");
    expect(useCompanion.getState().selectedTokenId).toBe("4821");
    useCompanion.getState().toggleOpen();
    expect(useCompanion.getState().isOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/state/useCompanion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/state/useCompanion.ts
import { create } from "zustand";
import type { Gotchi } from "@/types";

const LS_KEY = "companion.selectedTokenId";

export function pickDefaultTokenId(gotchis: Gotchi[]): string | null {
  if (!gotchis.length) return null;
  const brs = (g: Gotchi) => g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0;
  return [...gotchis].sort((a, b) => brs(b) - brs(a))[0].id;
}

interface CompanionState {
  selectedTokenId: string | null;
  isOpen: boolean;
  draft: string;
  setSelected: (id: string) => void;
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setDraft: (v: string) => void;
  ensureDefault: (gotchis: Gotchi[]) => void;
}

export const useCompanion = create<CompanionState>((set, get) => ({
  selectedTokenId: typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null,
  isOpen: false,
  draft: "",
  setSelected: (id) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, id);
    set({ selectedTokenId: id });
  },
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (v) => set({ isOpen: v }),
  setDraft: (v) => set({ draft: v }),
  ensureDefault: (gotchis) => {
    if (get().selectedTokenId) return;
    const id = pickDefaultTokenId(gotchis);
    if (id) get().setSelected(id);
  },
}));
```

```ts
// src/lib/companion/api.ts
import type { Tier } from "./types";

export interface ChatResponse { reply: string; deflected: boolean; tier?: Tier; }

export async function postChat(tokenId: string, wallet: string, message: string): Promise<ChatResponse> {
  const res = await fetch("/api/companion/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, wallet, message }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `chat failed (${res.status})`);
  return res.json();
}

export async function getPremium(wallet: string): Promise<{ active: boolean; daysLeft: number }> {
  const res = await fetch(`/api/companion/premium/${wallet}`);
  return res.json();
}

export async function claimPremium(wallet: string, days: number, txHash: string) {
  const res = await fetch("/api/companion/premium/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, days, txHash }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `claim failed (${res.status})`);
  return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/state/useCompanion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/useCompanion.ts src/lib/companion/api.ts src/state/useCompanion.test.ts
git commit -m "feat(companion): zustand store (default highest-BRS) + API client"
```

---

### Task 15: Personality Card + Gotchi picker (with personality preview)

**Files:**
- Create: `src/components/companion/PersonalityCard.tsx`
- Create: `src/components/companion/CompanionGotchiPicker.tsx`

- [ ] **Step 1: Write `PersonalityCard.tsx`**

```tsx
// src/components/companion/PersonalityCard.tsx
import type { PersonalityProfile } from "@/lib/companion/types";

export function PersonalityCard({ profile }: { profile: PersonalityProfile }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
      <div className="text-xs uppercase tracking-[2px] text-fuchsia-300/80">{profile.archetype}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {profile.traitLines.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] text-white/80"
            title={t.reason}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
            <span className="text-white/40">· {t.reason}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `CompanionGotchiPicker.tsx`**

```tsx
// src/components/companion/CompanionGotchiPicker.tsx
import { useMemo } from "react";
import { useAppStore } from "@/state/useAppStore";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

export function CompanionGotchiPicker({ onPicked }: { onPicked?: () => void }) {
  const gotchis = useAppStore((s) => s.gotchis);
  const setSelected = useCompanion((s) => s.setSelected);
  const selectedId = useCompanion((s) => s.selectedTokenId);

  const items = useMemo(
    () => gotchis.map((g) => ({ g, p: buildPersonality(g) })),
    [gotchis]
  );

  return (
    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
      {items.map(({ g, p }) => (
        <button
          key={g.id}
          onClick={() => { setSelected(g.id); onPicked?.(); }}
          className={`flex items-center gap-3 rounded-xl border p-2 text-left transition
            ${selectedId === g.id ? "border-fuchsia-400/60 bg-fuchsia-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
        >
          <span className="h-12 w-12 shrink-0"><GotchiSvgById id={g.id} className="block h-12 w-12" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-white">{g.name || `#${g.id}`}</span>
            <span className="block truncate text-[11px] text-fuchsia-200/70">{p.archetype}</span>
            <span className="block truncate text-[10px] text-white/50">
              {p.traitLines.slice(0, 2).map((t) => `${t.emoji} ${t.label}`).join(" · ")}
            </span>
          </span>
        </button>
      ))}
      {!items.length && <div className="p-4 text-center text-sm text-white/50">Connect your wallet to meet your gotchis 👻</div>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/companion/PersonalityCard.tsx src/components/companion/CompanionGotchiPicker.tsx
git commit -m "feat(companion): personality card + gotchi picker with live personality preview"
```

---

### Task 16: Chat panel + mascot + root mount (free tier visible)

**Files:**
- Create: `src/components/companion/CompanionChatPanel.tsx`
- Create: `src/components/companion/CompanionMascot.tsx`
- Create: `src/components/companion/CompanionRoot.tsx`
- Modify: app shell to render `<CompanionRoot/>` (see Step 4 for locating it)

- [ ] **Step 1: Write `CompanionChatPanel.tsx`**

```tsx
// src/components/companion/CompanionChatPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useAppStore } from "@/state/useAppStore";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { postChat } from "@/lib/companion/api";
import { PersonalityCard } from "./PersonalityCard";
import { CompanionGotchiPicker } from "./CompanionGotchiPicker";
import type { ChatMessage } from "@/lib/companion/types";

export function CompanionChatPanel() {
  const { address } = useAccount();
  const gotchis = useAppStore((s) => s.gotchis);
  const { selectedTokenId, setOpen } = useCompanion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const gotchi = useMemo(() => gotchis.find((g) => g.id === selectedTokenId) ?? null, [gotchis, selectedTokenId]);
  const profile = useMemo(() => (gotchi ? buildPersonality(gotchi) : null), [gotchi]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send() {
    const text = draft.trim();
    if (!text || !selectedTokenId || !address || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await postChat(selectedTokenId, address, text);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "the ether glitched 👻 try again in a sec" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="fixed bottom-24 right-4 z-50 flex h-[32rem] w-[22rem] max-w-[92vw] flex-col overflow-hidden
                 rounded-2xl border border-white/10 bg-[#160a23]/85 shadow-2xl shadow-fuchsia-900/30 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <button className="text-xs text-fuchsia-200/80 hover:text-white" onClick={() => setPicking((p) => !p)}>
          {gotchi ? `${gotchi.name || `#${gotchi.id}`} ▾` : "Choose a gotchi ▾"}
        </button>
        <button className="text-white/50 hover:text-white" onClick={() => setOpen(false)} aria-label="close">✕</button>
      </div>

      {picking ? (
        <div className="p-3"><CompanionGotchiPicker onPicked={() => setPicking(false)} /></div>
      ) : (
        <>
          {profile && <div className="px-3 pt-3"><PersonalityCard profile={profile} /></div>}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="mt-8 text-center text-sm text-white/40">say hi to your gotchi 👻</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                m.role === "user" ? "ml-auto bg-fuchsia-500/30 text-white" : "bg-white/10 text-white/90"}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="w-12 rounded-2xl bg-white/10 px-3 py-1.5 text-sm text-white/60">…</div>}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 p-2">
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={address ? "talk to your gotchi…" : "connect wallet to chat"}
              disabled={!address || !selectedTokenId}
              className="flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
            />
            <button onClick={send} disabled={busy || !draft.trim()}
              className="rounded-xl bg-fuchsia-500/80 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">↑</button>
          </div>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Write `CompanionMascot.tsx`**

```tsx
// src/components/companion/CompanionMascot.tsx
import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { useAppStore } from "@/state/useAppStore";
import { useCompanion } from "@/state/useCompanion";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

export function CompanionMascot() {
  const reduce = useReducedMotion();
  const gotchis = useAppStore((s) => s.gotchis);
  const { selectedTokenId, isOpen, toggleOpen, ensureDefault } = useCompanion();

  // Default to highest-BRS gotchi once gotchis load.
  useEffect(() => { ensureDefault(gotchis); }, [gotchis, ensureDefault]);

  const id = selectedTokenId ?? gotchis[0]?.id ?? null;

  return (
    <motion.button
      onClick={toggleOpen}
      aria-label="open gotchi companion"
      className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full border border-fuchsia-400/30
                 bg-[#160a23]/70 p-1 shadow-lg shadow-fuchsia-900/40 backdrop-blur"
      animate={reduce ? {} : { y: [0, -6, 0] }}
      transition={reduce ? {} : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
      whileTap={{ scale: 0.92 }}
    >
      {id
        ? <GotchiSvgById id={id} className="block h-full w-full" />
        : <span className="grid h-full w-full place-items-center text-2xl">👻</span>}
      {!isOpen && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-fuchsia-400 shadow" />}
    </motion.button>
  );
}
```

- [ ] **Step 3: Write `CompanionRoot.tsx`**

```tsx
// src/components/companion/CompanionRoot.tsx
import { useCompanion } from "@/state/useCompanion";
import { CompanionMascot } from "./CompanionMascot";
import { CompanionChatPanel } from "./CompanionChatPanel";

export function CompanionRoot() {
  const isOpen = useCompanion((s) => s.isOpen);
  return (
    <>
      <CompanionMascot />
      {isOpen && <CompanionChatPanel />}
    </>
  );
}
```

- [ ] **Step 4: Mount it in the app shell**

Find the root layout that wraps all routes:
```bash
grep -rnE "Routes|RouterProvider|createBrowserRouter|<App" src/app src/main.tsx
```
In that top-level layout component (the one rendered on every page, inside the wagmi/query providers), add the import at the top and render `<CompanionRoot />` near the end of its returned JSX (after the page outlet/children):
```tsx
import { CompanionRoot } from "@/components/companion/CompanionRoot";
// …inside the returned JSX, after the routes/outlet:
<CompanionRoot />
```

- [ ] **Step 5: Typecheck, run, verify, commit**

Run: `pnpm typecheck` → Expected: PASS.
Run: `pnpm dev`, open the app, connect a wallet with gotchis. Expected: a floating gotchi sprite bottom-right; clicking opens the glass chat panel; the Personality Card shows trait chips; sending "hi" returns a reply (template if no `GROQ_API_KEY`, real otherwise).

```bash
git add src/components/companion/CompanionChatPanel.tsx src/components/companion/CompanionMascot.tsx src/components/companion/CompanionRoot.tsx
# plus the modified app-shell file from Step 4:
git add -A
git commit -m "feat(companion): floating mascot + glassmorphic chat panel + root mount"
```

---

### Task 17: "Go Premium" CTA (GHST payment + claim)

**Files:**
- Create: `src/components/companion/GoPremium.tsx`
- Modify: `src/components/companion/CompanionChatPanel.tsx` (render the CTA when free)

- [ ] **Step 1: Write `GoPremium.tsx`**

```tsx
// src/components/companion/GoPremium.tsx
import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { claimPremium, getPremium } from "@/lib/companion/api";

const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const ERC20_TRANSFER_ABI = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

// Keep in sync with server/companion/pricing.ts COMPANION_TIERS.
const TIERS = [{ days: 30, ghst: 5 }, { days: 90, ghst: 12 }];
const RECEIVING = import.meta.env.VITE_COMPANION_RECEIVING_WALLET as `0x${string}` | undefined;

export function GoPremium({ onActivated }: { onActivated?: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buy(days: number, ghst: number) {
    if (!address || !RECEIVING) { setMsg("premium not configured"); return; }
    setBusy(true); setMsg("confirm the GHST payment in your wallet…");
    try {
      const txHash = await writeContractAsync({
        address: GHST_BASE, abi: ERC20_TRANSFER_ABI, functionName: "transfer",
        args: [RECEIVING, parseUnits(String(ghst), 18)],
      });
      setMsg("verifying on-chain…");
      await claimPremium(address, days, txHash);
      const status = await getPremium(address);
      setMsg(status.active ? `premium active — ${status.daysLeft} days ✨` : "claim pending…");
      if (status.active) onActivated?.();
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || "payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
      <div className="text-xs font-medium text-fuchsia-100">✨ Go Premium — smarter replies (OpenAI)</div>
      <div className="mt-2 flex gap-2">
        {TIERS.map((t) => (
          <button key={t.days} disabled={busy} onClick={() => buy(t.days, t.ghst)}
            className="flex-1 rounded-lg bg-fuchsia-500/80 px-2 py-1.5 text-xs text-white disabled:opacity-40">
            {t.days}d · {t.ghst} GHST
          </button>
        ))}
      </div>
      {msg && <div className="mt-2 text-[11px] text-white/70">{msg}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Render the CTA in the chat panel**

In `CompanionChatPanel.tsx`, add imports and a premium-status check, and render `<GoPremium/>` under the Personality Card when the user is not premium. Add the imports near the top:
```tsx
import { GoPremium } from "./GoPremium";
import { getPremium } from "@/lib/companion/api";
```
Inside the component body (with the other hooks):
```tsx
const [premium, setPremium] = useState(false);
useEffect(() => { if (address) getPremium(address).then((s) => setPremium(s.active)).catch(() => {}); }, [address]);
```
In the JSX, immediately after the `{profile && <div className="px-3 pt-3"><PersonalityCard .../></div>}` block:
```tsx
{profile && !premium && <div className="px-3 pt-2"><GoPremium onActivated={() => setPremium(true)} /></div>}
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `pnpm typecheck` → Expected: PASS.
Manual: open the panel as a free user → the "Go Premium" card shows two GHST tier buttons. (Full payment requires a funded wallet + configured `VITE_COMPANION_RECEIVING_WALLET`; verifying the button renders is sufficient here.)

- [ ] **Step 4: Commit**

```bash
git add src/components/companion/GoPremium.tsx src/components/companion/CompanionChatPanel.tsx
git commit -m "feat(companion): Go Premium CTA — GHST transfer on Base + claim"
```

---

## PHASE 6 — E2E + polish

### Task 18: Playwright E2E (mascot + chat panel, mocked API)

**Files:**
- Create: `tests/e2e/companion.spec.ts`

- [ ] **Step 1: Write the E2E test**

```ts
// tests/e2e/companion.spec.ts
import { test, expect } from "@playwright/test";

test("companion mascot opens the chat panel", async ({ page }) => {
  // Mock the companion APIs so the test is deterministic and offline.
  await page.route("**/api/companion/chat", async (route) => {
    await route.fulfill({ json: { reply: "boo! i'm your gotchi 👻", deflected: false, tier: "free" } });
  });
  await page.route("**/api/companion/premium/**", async (route) => {
    await route.fulfill({ json: { active: false, daysLeft: 0, entitlement: null } });
  });

  await page.goto("/");

  const mascot = page.getByLabel("open gotchi companion");
  await expect(mascot).toBeVisible();

  await mascot.click();
  await expect(page.getByPlaceholder(/talk to your gotchi|connect wallet/)).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e tests/e2e/companion.spec.ts`
Expected: PASS. The mascot renders even with no wallet/gotchis (it falls back to the 👻 glyph, Task 16 Step 2), and clicking opens the panel showing the "connect wallet to chat" placeholder.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/companion.spec.ts
git commit -m "test(companion): e2e mascot opens + chat panel renders"
```

---

### Task 19: Trait-tinted glow + contextual petting speech bubble

**Files:**
- Create: `src/lib/companion/glow.ts`
- Create: `src/lib/companion/glow.test.ts`
- Modify: `src/components/companion/CompanionMascot.tsx`
- Modify: `src/components/companion/CompanionRoot.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/glow.test.ts
import { describe, expect, it } from "vitest";
import { glowColor } from "./glow";
describe("glowColor", () => {
  it("high SPK → violet", () => {
    expect(glowColor({ name: "x", numericTraits: [50,50,90,50,0,0] })).toContain("168,85,247");
  });
  it("balanced → fuchsia", () => {
    expect(glowColor({ name: "x", numericTraits: [50,50,50,50,0,0] })).toContain("217,70,239");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/companion/glow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `glow.ts`**

```ts
// src/lib/companion/glow.ts
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
```

Run: `pnpm vitest run src/lib/companion/glow.test.ts` → Expected: PASS.

- [ ] **Step 4: Apply glow to the mascot + add the petting bubble**

In `CompanionMascot.tsx`, import and apply the glow:
```tsx
import { glowColor } from "@/lib/companion/glow";
// after computing `id`:
const gotchi = gotchis.find((g) => g.id === id) ?? null;
const glow = gotchi ? glowColor(gotchi) : "rgba(217,70,239,0.45)";
// add to the motion.button props:
style={{ boxShadow: `0 0 24px 4px ${glow}` }}
```

In `CompanionRoot.tsx`, show a petting bubble when the panel is closed and a gotchi is selected:
```tsx
import { useAppStore } from "@/state/useAppStore";
// inside CompanionRoot, before return:
const gotchis = useAppStore((s) => s.gotchis);
const selectedTokenId = useCompanion((s) => s.selectedTokenId);
const g = gotchis.find((x) => x.id === selectedTokenId);
// and in the JSX, alongside the mascot:
{!isOpen && g && (
  <div className="fixed bottom-20 right-4 z-40 max-w-[12rem] rounded-2xl bg-[#160a23]/85 px-3 py-1.5 text-xs text-white/85 shadow-lg backdrop-blur">
    psst… pet me to grow our kinship 👻
  </div>
)}
```

- [ ] **Step 5: Typecheck, verify, commit**

Run: `pnpm typecheck` → Expected: PASS.
Manual: mascot glows in a trait-appropriate color; a petting bubble appears when the panel is closed and a gotchi is selected.

```bash
git add src/lib/companion/glow.ts src/lib/companion/glow.test.ts src/components/companion/CompanionMascot.tsx src/components/companion/CompanionRoot.tsx
git commit -m "feat(companion): trait-tinted mascot glow + contextual petting bubble"
```

---

### Task 20: Full test sweep + typecheck/lint gate

**Files:** none (verification task)

- [ ] **Step 1: Run all unit tests**

Run: `pnpm test:unit`
Expected: PASS, including all `src/lib/companion/*` and `server/companion/*` suites.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (fix any new warnings in companion files; the repo runs `--max-warnings 0`).

- [ ] **Step 4: E2E**

Run: `pnpm test:e2e tests/e2e/companion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(companion): green test sweep (unit + typecheck + lint + e2e)"
```

---

## Self-Review Notes (spec coverage)

- **Personality engine (spec §4):** Tasks 1–3 — poles/intensity, base persona, life-stage, kinship, wearable-reactive (`withSetsNumericTraits ?? modifiedNumericTraits ?? numericTraits`), traitLines transparency.
- **Chat + knowledge + provider + fallback (spec §5):** Tasks 4, 6, 7, 11, 12 — curated lore, template fallback, tier-aware provider, prompt assembly, route, rate limit; profanity (Task 5).
- **Authoritative state (spec §5.1):** Task 8.
- **Memory (spec §6):** Task 9 (messages + facts, capped, per wallet+token).
- **Premium GHST (spec §7):** Tasks 10, 13, 17 — pricing, claim+verify (reusing `verifyGhstPayment`), idempotency, status, client payment.
- **UI incl. "sexy beast"/transparency/default-BRS (spec §8):** Tasks 14–17, 19 — store + default highest-BRS, personality card, picker preview, glass panel, mascot, premium CTA, trait glow, petting bubble.
- **Testing (spec §9):** unit per module, Task 18 E2E, Task 20 sweep.
- **Phase-2 seams:** route boundary in Task 12 carries gotchi state + wallet; no action-execution code added (out of scope per spec §2).

### Consistency checks performed
- `buildPersonality`/`personalityToSystemPrompt`/`resolveEquippedTraits` names consistent across Tasks 2, 3, 11, 15, 19.
- `complete(systemPrompt, messages, tier)` signature consistent (Tasks 7, 12).
- DB function names (`appendMessage`, `getRecentMessages`, `getFacts`, `upsertFact`, `isPremiumActive`, `grantPremium`, `getEntitlement`) consistent (Tasks 9, 12, 13).
- Pricing tiers (5 GHST/30d, 12 GHST/90d) mirrored between `server/companion/pricing.ts` (Task 10) and `GoPremium.tsx` (Task 17).
- GHST Base address `0xcD2F…9BcB` matches `server/lending/verifyPayment.ts`.
