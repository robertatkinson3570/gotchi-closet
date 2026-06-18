# Gotchi Companion — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Project:** gotchi-closet

---

## 1. Summary

Pick one of your Aavegotchis and it becomes a living **companion**: a floating mascot
that sits on screen, chats with you in a voice **derived from its own traits, age, XP,
and kinship**, and knows both *itself* (your portfolio data) and *Aavegotchi lore/mechanics*.

Every gotchi is, at baseline, a **playful, slightly spooky Gotchiverse ghost**. Its traits
only *shade* that base persona — they never replace it. No two gotchis sound alike, but all
sound like they belong in the Gotchiverse.

The feature is **talk-only in v1** (it coaches you through petting/channeling but does not
sign transactions for those). Clean seams are left so an "action agent" layer can bolt on in
phase 2 without reworking the personality, chat, or UI layers.

The LLM is **free to the operator by default** (free hosted model + template fallback). A
**premium tier** (operator's OpenAI key) is unlocked by paying **GHST on Base**, because
every premium token costs the operator real money.

### Design pillars (from Aavegotchi ethos)
- **Both extremes are valid.** A mellow ghost (NRG 2) is as characterful as a turnt one
  (NRG 98). There is no "better" build — only different.
- **Deterministic identity.** Personality is a pure function of on-chain/equipped state.
  The same gotchi always has the same baseline character; only kinship/age drift it over time,
  and equipped wearables shift it live.
- **Never hard-fail.** If the LLM is down or rate-limited, the companion degrades to
  in-character template replies, never an error.
- **Cutting-edge feel.** The mascot and chat surface are a flagship visual moment — intuitive,
  premium, "sexy beast" styling (see §8.1).

---

## 2. Scope

### In scope (v1)
- Personality engine: gotchi state → personality profile → system prompt (pure logic).
- Floating mascot UI + click-to-chat panel + contextual speech bubbles + Personality Card.
- Chat endpoint backed by a free hosted LLM, grounded in the gotchi's live state + curated lore.
- Lightweight persistent per-gotchi memory (server SQLite).
- Profanity protection (mask + playful deflect).
- Freemium: free tier for everyone; premium (OpenAI) unlocked via GHST-on-Base payment.

### Out of scope (v1) — explicit phase-2 seams
- **Action agents** that sign on-chain transactions (auto-pet, channel execution).
- Vector/RAG knowledge base, summarization memory, cross-device sync beyond the SQLite store.
- Voice/TTS, multi-gotchi group chat, live market/floor-price data in chat.

> The chat route already carries the gotchi's live state and the caller's wallet, so a future
> `tools` layer (pet/channel execution) attaches at the route boundary without touching
> `personality.ts`, the UI, or memory.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT (React / Vite)                                   │
│                                                          │
│  CompanionMascot ──► CompanionChatPanel                  │
│   (corner sprite,      (Personality Card, messages,      │
│    idle float,          input, "Go Premium")             │
│    speech bubbles)          │                            │
│         ▲                   ▼                            │
│   useCompanion (zustand: selectedTokenId, isOpen, draft) │
│         │                   │  POST /api/companion/chat  │
└─────────┼───────────────────┼────────────────────────────┘
          │                   ▼
┌─────────┼───────────────────────────────────────────────┐
│  SERVER (Express)           │                            │
│                             ▼                            │
│   /api/companion/chat                                    │
│        ├─ fetch live gotchi state (authoritative)        │
│        ├─ personality.ts   (traits/age/xp/kin → prompt)  │
│        ├─ knowledge.ts      (keyword → lore snippets)     │
│        ├─ contentFilter.ts  (mask + deflect)             │
│        ├─ memoryStore       (history + facts, SQLite)    │
│        ├─ entitlements      (tier lookup, SQLite)         │
│        └─ llmProvider.ts(tier) ─► openai | groq | template│
│                                                          │
│   /api/companion/premium/claim  ─► viem on-chain verify  │
└──────────────────────────────────────────────────────────┘
```

### Units & boundaries

| Unit | Location | Responsibility | Depends on |
|---|---|---|---|
| `personality.ts` | server | Pure: gotchi state → `PersonalityProfile` → systemPrompt | types only |
| `knowledge.ts` | server | Curated lore snippets + keyword retrieval | none |
| `contentFilter.ts` | server | Mask profanity in/out, signal deflect | none |
| `llmProvider.ts` | server | Tier-aware `complete(systemPrompt, messages, tier)` | env keys |
| `memoryStore` | server (SQLite) | Per-`wallet+tokenId` history + facts | better-sqlite3 |
| `entitlements` | server (SQLite) | Premium tier by wallet; on-chain claim verify | viem, better-sqlite3 |
| `companion` route | server | Orchestrates the above for chat + claim | all server units |
| `useCompanion` | client | Selection/open state, persisted to localStorage | zustand |
| `CompanionMascot` | client | Corner sprite, idle float, speech bubbles | GotchiSvgById, framer-motion |
| `CompanionChatPanel` | client | Personality Card, messages, input, premium CTA | useCompanion, react-query |

Mirrors existing patterns: route modules in `server/routes/`, SQLite in `server/lending/db.ts`,
sprite render in `src/components/explorer/GotchiSvgById.tsx`, state in `src/state/`.

---

## 4. Personality engine (`personality.ts`)

Pure, deterministic, no LLM, fully unit-tested.

```ts
buildPersonality(gotchi: Gotchi): PersonalityProfile
personalityToSystemPrompt(profile: PersonalityProfile): string
```

### 4.1 Trait source (wearable-reactive)
Read **equipped** values so wearables/sets change personality live:
```
const traits = gotchi.withSetsNumericTraits
            ?? gotchi.modifiedNumericTraits
            ?? gotchi.numericTraits;
```
Index map: `0=NRG (Energy)`, `1=AGG (Aggression)`, `2=SPK (Spookiness)`, `3=BRN (Brain)`,
`4=Eye Shape`, `5=Eye Color`. Only indices 0–3 drive voice; 4–5 are flavor (mentioned only if
the gotchi describes its looks). The card compares base (`numericTraits`) vs equipped to surface
wearable-driven shifts.

### 4.2 Universal base persona (always present)
`UNIVERSAL_BASE_PERSONA` — a constant injected into *every* system prompt: a playful,
mischievous, faintly spooky spirit summoned through a portal, aware it's a ghost, at home in
the Gotchiverse. This is the floor; trait shading is layered on top. No gotchi is ever a dry
assistant.

### 4.3 Spectrum traits → pole + intensity
Aavegotchi traits are a bell curve centered ~50 (range 0–99; extremes rare). For traits 0–3,
`distance = |value - 50|` selects an intensity word; sign selects the pole.

| Intensity | distance |
|---|---|
| slightly | 0–10 |
| fairly | 10–25 |
| very | 25–40 |
| extremely | 40+ |

| Trait | Low pole | High pole |
|---|---|---|
| NRG (Energy) | mellow, still, unhurried | hyper, restless, turnt |
| AGG (Aggression) | gentle, peaceable haunt | rowdy, combative poltergeist |
| SPK (Spookiness) | warm, cute, friendly-Casper ghost | eerie, ominous oracle ghost |
| BRN (Brain) | instinctive, street-smart | galaxy-brained, analytical |

> Low SPK is **not** "non-ghostly" — it is a *cute friendly* ghost. The ghost-playfulness is
> constant; only the flavor varies.

### 4.4 Life-stage modifiers
- **Age** = now − `createdAt` → `hatchling | young | grown | elder`. Older ⇒ wiser, settled.
- **XP / `level`** → low = naive & eager; high = seasoned, references shared history.
- **Kinship** → the **warmth dial** over the trait voice. Low = aloof, still warming up;
  high = devoted, affectionate. (`createdAt`/`level`/`kinship` already on `Gotchi`.)

### 4.5 Output
```ts
interface PersonalityProfile {
  archetype: string;     // e.g. "Mellow Galaxy-Brain Elder"
  toneWords: string[];   // ["calm","analytical","devoted"]
  traitLines: TraitLine[]; // { emoji, label, reason } — drives the Personality Card UI
  systemPrompt: string;  // base persona + voice + live-state + reply rules
}
```
`traitLines` are the **"why this personality"** transparency surface, e.g.
`🧠 Extremely galaxy-brained — BRN 96`, `👻 Eerie oracle — SPK 88`,
`💞 Devoted to you — kinship 1,240`, `🕰️ Elder spirit`,
`😼 Marigold set has me extra turnt — +10 NRG`.

`systemPrompt` instructs: *you ARE this gotchi; here is your voice; here is your live state
(traits, age, kinship, equipped wearables, lending status); stay in character; keep replies
short and playful.*

---

## 5. Chat (`/api/companion/chat`)

**Request:** `{ tokenId, wallet, message }` → **Response:** `{ reply, deflected? }`

### 5.1 Authoritative state
The server fetches the gotchi's **live state by `tokenId`** (reusing existing
`/api/gotchis` / subgraph fetchers) rather than trusting client-sent traits. Keeps personality
accurate and prevents spoofing.

### 5.2 Prompt assembly (kept small for free-tier token limits)
```
[ UNIVERSAL_BASE_PERSONA ]
[ personality.systemPrompt ]
[ live gotchi state snapshot ]
[ 2–4 lore snippets from knowledge.ts matched to the message ]
[ remembered facts (≤10) + recent history (≤20 msgs) ]
[ user message (profanity-masked) ]
```

### 5.3 Knowledge (`knowledge.ts`)
Hand-curated, tagged lore/mechanics snippets (NOT a vector DB): portals & summoning,
collateral/aTokens, Haunts, GHST, kinship & petting (~12h interaction), alchemica
(FUD/FOMO/ALPHA/KEK), the Forge, Baazaar, rarity farming/BRS, wearables & sets. Keyword match
pulls only the relevant 2–4 snippets. Trivially expandable. Accurate lore here prevents
hallucinated game mechanics.

### 5.4 Content filter (`contentFilter.ts`)
Incoming text scanned; profanity **masked** before it reaches the LLM or memory. On a hit, the
gotchi **playfully deflects** in-character (e.g. *"ooOOoo, such language for a spirit to hear 👻"*)
instead of engaging. Output also screened so the model never emits profanity/slurs.
Mask-and-deflect, not hard-block.

### 5.5 Provider (`llmProvider.ts`)
`complete(systemPrompt, messages, tier) → string`. Routing:
- `tier === "premium"` → **OpenAI** (operator key; e.g. `gpt-4o-mini`, configurable).
- else → **Groq free** (e.g. `llama-3.3-70b-versatile`, configurable).
- any error / no key → **template** fallback.

Keys are server-side env only, never shipped to client. Provider is swappable behind the
single `complete` interface.

### 5.6 Template fallback (never hard-fail)
Trait-flavored canned lines per intent (greeting, petting nudge, "tell me about yourself",
game-question, unknown). Selected using the same `PersonalityProfile`, so even offline the
voice is on-brand. Degraded, not broken.

### 5.7 Abuse / cost control
Per-wallet rate limit (in-memory token bucket), max input length, capped history/facts injected.
Applies to **both** tiers — premium also carries a monthly message cap per entitlement window so
a single buyer cannot run up an unbounded OpenAI bill.

---

## 6. Memory (`memoryStore`, SQLite)

New DB module mirroring `server/lending/db.ts`. Two tables, keyed by `wallet + tokenId` so each
gotchi remembers each owner independently. Timestamps (`ts`) are unix epoch **milliseconds**:

- `companion_messages(wallet TEXT, tokenId TEXT, role TEXT, content TEXT, ts INTEGER)` — recent
  history; last ~20 injected.
- `companion_facts(wallet TEXT, tokenId TEXT, fact TEXT, ts INTEGER)` — model/heuristic-extracted
  "things I remember about you"; capped ~10.

After each exchange the server runs a tiny fact-extraction pass (LLM on premium; simple heuristic
on free) and upserts notable facts. Seam: fact count / recall depth can later scale with kinship.

---

## 7. Premium tier & payment (GHST on Base)

### 7.1 Flow
1. Chat panel "Go Premium" shows price (e.g. `N GHST = 30 days`).
2. User sends a GHST ERC-20 transfer to the configured **receiving wallet** via their connected
   wallet (wagmi/viem — existing deps).
3. Client posts `{ wallet, txHash }` to `POST /api/companion/premium/claim`.
4. Server verifies on-chain with **viem**: a GHST `Transfer` of the correct amount to the
   receiving address, in a finalized block, **not already claimed** (dedupe by `txHash`).
5. On success → write entitlement; unlock OpenAI tier for that wallet.

### 7.2 Storage
`companion_entitlements(wallet TEXT, tier TEXT, expiresAt INTEGER, lastTxHash TEXT)`
(`expiresAt` = unix epoch ms). The chat route reads this to choose the provider tier.

### 7.3 Config (looked up, not guessed)
GHST-on-Base token address, receiving wallet, price, and entitlement window are env/config
values. The GHST Base address is sourced from the existing dapp config / the operator's
`base-contract-addresses` notes during implementation — not inferred.

### 7.4 Verification edge cases (unit-tested)
Valid transfer; wrong amount; wrong recipient; unfinalized tx; replayed `txHash`; transfer of a
different token. All must be handled explicitly.

---

## 8. Client UI

### 8.1 Visual direction — "sexy beast", cutting-edge
The mascot + chat surface are a flagship moment and must feel premium and effortless:
- **Glassmorphic chat panel**: translucent dark surface, subtle backdrop blur, soft inner glow,
  fine 1px gradient border. Rounded, floating — never a boxy modal.
- **Aavegotchi-native palette**: ghost-purple / cyan neon accents on near-black, tuned to the
  existing Tailwind theme (no clashing new palette).
- **Trait-tinted glow**: panel/accent glow color derives from the gotchi's dominant trait
  (e.g. eerie high-SPK → violet haze; high-NRG → hot cyan), so the UI itself reflects personality.
- **Alive mascot**: framer-motion idle float + subtle bob/blink; springy open/close; speech
  bubbles animate in with a soft pop. Respect `prefers-reduced-motion`.
- **Personality Card**: sleek stat-chip row (emoji + label + reason), micro-animated on open,
  reading like a premium trading-card header — not a plain list.
- **Intuitive by default**: one obvious affordance (tap the gotchi → chat). Clear empty state
  ("say hi 👻"), visible typing indicator, smooth autoscroll, one-tap gotchi switch.
- **Mobile-first**: panel docks as a bottom sheet on small screens; mascot stays thumb-reachable.

### 8.2 Components & state
- **`useCompanion`** (zustand, matches `src/state/`): `selectedTokenId`, `isOpen`, `draft`;
  persists `selectedTokenId` to localStorage so the gotchi greets you on return.
  - **Default selection**: when no gotchi has been chosen yet, default to the owner's
    **highest-BRS** gotchi (`withSetsRarityScore ?? modifiedRarityScore ?? baseRarityScore`),
    so a first-time user immediately meets their "best" gotchi.
- **`CompanionMascot`**: fixed corner sprite via `GotchiSvgById`; gentle idle float
  (framer-motion). Click toggles the panel. Contextual **speech bubbles** (e.g. petting nudge
  on the Manage page).
- **`CompanionChatPanel`**: Personality Card (from `traitLines`) + scrollable messages + input
  + "Go Premium" CTA. Radix/Tailwind to match existing UI.
- **Gotchi picker with personality preview**: choose which owned gotchi is the companion
  (reuse owned-gotchi data / `GotchiSearch`). Each candidate in the picker shows a **live
  personality preview** — its archetype + top `traitLines` (the *what & why*) computed by the
  same `buildPersonality` — so the user understands each gotchi's character **before** selecting.
  Swap anytime; selecting recomputes personality (including current wearables).

> **Transparency requirement:** the user must always be able to see *what* their gotchi's
> personality is and *why* (which traits/age/kinship drive it) — both in the picker preview and
> in the in-chat Personality Card. `buildPersonality` is the single source for both surfaces.

---

## 9. Testing

- **`personality.ts`** (vitest): trait values → expected pole/intensity/archetype; base persona
  always present; equipped (wearable-modified) traits shift the profile; age/XP/kinship modifiers;
  both-extremes-valid (no "better" build) sanity.
- **`contentFilter.ts`**: profanity masked + deflect signaled; clean text untouched; output screen.
- **`knowledge.ts`**: keyword → expected snippet set; prompt size bound respected.
- **Premium verify**: mocked viem client across all §7.4 edge cases.
- **`llmProvider.ts`**: mocked; assert tier routing and template fallback on error/no-key.
- **E2E (playwright)**: mascot appears; chat round-trips (mocked LLM); Personality Card renders;
  premium CTA visible to free users.

---

## 10. Build order (foundation-first)

1. `personality.ts` + tests (no deps; the novel core).
2. `knowledge.ts` + `contentFilter.ts` + tests.
3. `llmProvider.ts` (Groq + template; OpenAI behind tier flag) + tests.
4. `memoryStore` SQLite + chat route wiring (free tier end-to-end).
5. Client: `useCompanion`, `CompanionMascot`, `CompanionChatPanel`, picker (free tier demoable),
   with the §8.1 visual direction.
6. Premium: entitlements table + `premium/claim` verify + "Go Premium" UI.
7. E2E + polish (speech bubbles, idle animation, Personality Card shifts, trait-tinted glow).

Each step is independently testable; the app has a working free-tier companion after step 5.
