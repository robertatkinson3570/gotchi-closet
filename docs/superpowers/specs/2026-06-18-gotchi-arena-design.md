# Gotchi Arena — Public "Talk to Any Gotchi" Funnel & Roast Battles — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Project:** gotchi-closet
**Builds on:** [Gotchi Companion design](2026-06-18-gotchi-companion-design.md) (already largely built)
**Optional later tie-in:** [Gotchi Soul design](2026-06-18-gotchi-soul-design.md) (spec only)

---

## 1. Summary

A **public, no-wallet surface** that turns every Aavegotchi into a shareable social object, to
re-engage holders and lore newcomers into the ecosystem. Two surfaces:

- **Public Gotchi page** (`/g/:tokenId`): anyone can meet any gotchi — it renders, shows its
  Personality Card, and offers a **capped "taste" chat** in its trait-voice. No wallet required.
- **Roast Battles** (`/arena/:challengerId/vs/:rivalId`): pick a rival gotchi and the two trade
  **trait-flavored trash talk**, grounded in real on-chain stats. Shareable as a link that unfurls
  into a battle card — the **viral engine**.

The funnel is **dual-audience, one mechanic**:
- **Holders (primary goal — connect wallet & explore):** battles + chat re-engage them →
  *connect wallet to challenge, defend, customize* → into the app.
- **Gotchi-less strangers ("lore them in"):** they get the taste, then a light CTA — *gotchis start
  cheap, grab one and join the fight.* No fake free-pet scaffolding (YAGNI).

It is built **on top of the existing companion**, reusing its engines, and **costs ~$0 to operate
by design** (see §6): free hosted model only, cache-first, template fallback, and a hard wall that
public traffic never touches the operator's paid key.

### Design pillars
- **Cheap to run is a feature.** Cost control is wired in, not bolted on; the cost cap doubles as
  the connect-wallet conversion nudge.
- **Roast the gotchi, never the human.** Playful, Gotchiverse-flavored ribbing of on-chain stats,
  traits, looks, and (later) soul — hard guardrails against targeting real people.
- **Reuse over rebuild.** The personality, knowledge, content-filter, and provider engines already
  exist; the arena is a thin new module on top.
- **Virality through the share artifact.** A link that unfurls into a roast battle is the loop —
  no embed/widget infrastructure needed for v1.

---

## 2. Scope

### In scope (v1)
- Public Gotchi page with capped taste chat (no wallet).
- Roast Battles: challenge a **specific** gotchi (by tokenId/owner address); trait-flavored banter.
- Cost/abuse controls: cache/template-first, free-model-on-demand, global daily ceiling, per-IP
  rate limits, hard wall against the paid tier.
- Safety guardrails: gotchi-only roasting, content filtering, hostile-input deflection, owner
  opt-out, no doxxing.
- Shareable OG image + meta for link unfurling.
- Dual funnel CTAs (connect-wallet for holders / acquire-a-gotchi for strangers).

### Out of scope (v1) — explicit seams
- **King-of-the-hill leaderboard / win-scoring** (matchmaking is challenge-a-specific-gotchi only).
- **Soul ammo** in roasts (additive once Soul is built — battles ship on traits/BRS/level/kinship).
- Embeddable widgets / standalone public service (Approaches B/C — later if it takes off).
- Premium/paid model for any public traffic (never).

---

## 3. Architecture (Approach A — public surface inside the existing app)

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT (React / Vite) — public, no-auth routes          │
│   /g/:tokenId        → gotchi render + Personality Card   │
│                        + capped taste chat + "⚔ Roast"    │
│   /arena/:a/vs/:b    → face-off banter + Share + CTAs     │
│   (connect-wallet CTA via existing wagmi)                 │
└─────────┬───────────────────────────────────┬───────────┘
   GET /arena/g/:id   POST /arena/g/:id/chat   GET /arena/battle/:a/vs/:b
          │                                     │   + OG image/meta
┌─────────┼─────────────────────────────────────┼─────────┐
│  SERVER (Express)  server/arena/                         │
│   publicState.ts (public gotchi fetch, cached)           │
│   publicChat.ts  (taste chat: caps, cache/template-first)│
│   battle.ts      (two gotchis → guardrailed banter)      │
│   safety.ts      (roast guardrails + filter + deflect)   │
│   arenaCache.ts  (SQLite: battle/intro cache, ceiling)   │
│   og.ts          (serverless OG image + meta)            │
│   arena route    (public endpoints)                      │
│                                                          │
│  Reuses: personality.ts, knowledge.ts, contentFilter.ts, │
│          llmProvider.ts (FREE tier only), gotchi fetchers│
└──────────────────────────────────────────────────────────┘
```

### Units & boundaries

| Unit | Location | Responsibility | Reuses / depends on |
|---|---|---|---|
| `publicState.ts` | server | Fetch a gotchi's **public** state by tokenId (no wallet). Cached. | existing gotchi/subgraph fetchers |
| `publicChat.ts` | server | Taste chat: per-visitor cap, cache/template-first, free model. | personality, knowledge, contentFilter, llmProvider |
| `battle.ts` | server | Two gotchis' personalities + on-chain stats → N rounds of guardrailed banter. | personality, llmProvider, safety |
| `safety.ts` | server | Roast guardrails (gotchi-only), output filter, hostile-input deflect, opt-out check. | contentFilter |
| `arenaCache.ts` | server (SQLite) | Battle cache per matchup + intro cache per gotchi; daily-ceiling counter; opt-out flags. Mirrors `lending/db.ts`. | better-sqlite3 |
| `og.ts` | server (serverless) | Render OG share image + meta tags for unfurling. | existing Vercel fn pattern; SVG/html-to-image |
| `arena` route | server | Orchestrate public endpoints (state / chat / battle / OG). | all arena units |
| Public pages | client | `/g/:tokenId`, `/arena/:a/vs/:b`; render, taste chat, share, CTAs. | GotchiSvgById, buildPersonality, wagmi, framer-motion |

Mirrors existing patterns: SQLite in `server/lending/db.ts`, pure engines in
`src/lib/companion/*`, provider in `server/companion/llmProvider.ts`, route modules in
`server/routes/`.

---

## 4. Reused foundation (already in the repo)

The arena adds **no** new personality/LLM logic — it reuses what the companion already ships:

- `src/lib/companion/personality.ts` — `buildPersonality` (deterministic from traits; works for
  **any** gotchi, owned or not).
- `src/lib/companion/knowledge.ts` — lore snippets for grounded chat.
- `src/lib/companion/contentFilter.ts` — masking + deflect, reused by `safety.ts`.
- `server/companion/llmProvider.ts` — **free (Groq) tier only** for all public traffic.
- `server/companion/gotchiState.ts` / gotchi fetchers — public state by tokenId.
- `server/companion/db.ts` pattern + better-sqlite3 — model for `arenaCache.ts`; the owner opt-out
  flag may live alongside companion data.

No dependency on the **premium** (GHST) tier or on **Soul** — both are additive/irrelevant to v1.

---

## 5. Roast battle generation (`battle.ts`)

1. Resolve both gotchis via `publicState.ts` (public on-chain state: traits, BRS, level, kinship,
   looks; soul snapshot later if present).
2. Build each gotchi's `PersonalityProfile` via `buildPersonality`.
3. Compose a **guardrailed battle prompt** (`safety.ts`): each gotchi roasts the **other gotchi's**
   stats/traits/looks in its own trait-voice (high-AGG = brutal, high-BRN = condescending,
   high-SPK = eerie menace), Gotchiverse-flavored, N short rounds.
4. Generate on the **free model**; pass output through `contentFilter`.
5. Cache the result in `arenaCache` keyed by the **ordered matchup** `(challengerId, rivalId)`.

**Determinism/caching:** same matchup returns the cached battle (refreshed on a TTL or explicit
"rematch"). A viral battle link viewed thousands of times triggers **one** generation.

**Ammo (current):** BRS, level, kinship, trait extremes, eye shape/color, haunt. **Ammo (later,
additive):** soul depth, soul age, past-lives count ("six owners, none kept you").

---

## 6. Cost & abuse control (≈ $0 to operate)

Four mechanics, in priority order:

1. **Free hosted model only** for all public traffic — `$0` in dollars within the free tier's
   rate limits. The premium key is **never** reachable from public routes (hard tier wall).
2. **Cache/template-first:** gotchi intros and roast battles are template-built and cached by
   **default**; the free model fires only on an active interaction (visitor types a custom message
   or requests a fresh/rematch battle).
3. **Global daily ceiling** on fresh generations; once hit, everything serves cache/templates.
4. **Per-IP rate limits + per-visitor message caps** (token-bucket, mirrors the companion's abuse
   control). Hitting the cap surfaces the **connect-wallet CTA** — the cap *is* the funnel nudge.

**Bounded worst case:** under a spike or bot attack the surface degrades to **templates** — still
on-brand, still `$0`. There is no code path to a surprise bill.

---

## 7. Safety & guardrails (`safety.ts`)

- **Hard prompt constraints** (battle + chat): roast only the gotchi's on-chain stats, traits,
  looks, soul — **never** the human owner, wallet, or real-world identity; no slurs, hate,
  protected-class, sexual, or threatening content; keep it playful Gotchiverse ribbing.
- **Output always filtered** through `contentFilter` (mask) before caching/returning.
- **Hostile custom chat** → in-character deflect (reuses the companion deflect), never engages.
- **Owner opt-out:** a connected owner can hide their gotchi from the public arena (flag in the
  companion DB); public routes withhold it ("this spirit declined the arena").
- **No doxxing:** public pages show tokenId + on-chain stats; owner address truncated, never
  featured.

---

## 8. Funnel & CTAs

- **Holder (primary):** *"Your gotchi? Connect wallet to challenge anyone, customize your fighter,
  defend your rank."* → into the app. **Primary metric:** connect-wallet conversions from public
  pages.
- **Stranger ("lore them in"):** *"No gotchi yet? They start cheap — grab one and join the fight."*
  → outbound to acquire a gotchi.
- **Share:** the **OG card link is the loop** — a rival owner sees the roast on social → comes to
  clap back → connects. Secondary metrics: battles generated, shares.

---

## 9. Data flow — roast battle

1. Visitor opens `/arena/:a/vs/:b` → client calls `GET /api/arena/battle/:a/vs/:b`.
2. Server checks `arenaCache` for the ordered matchup → **hit:** return cached banter (`$0`, no
   quota burn).
3. **Miss + under daily ceiling:** resolve both public states → build personalities → generate
   guardrailed banter on the free model → filter → cache → return.
4. **Miss + over ceiling:** build a **template** battle from traits → cache → return.
5. Client renders the face-off + Share (OG link) + dual CTA.

---

## 10. Storage (`arenaCache.ts`, SQLite)

New DB module mirroring `server/lending/db.ts`. Timestamps are unix epoch **ms**.

- `arena_battles(challengerId TEXT, rivalId TEXT, banter TEXT, model TEXT, ts INTEGER,
  PRIMARY KEY (challengerId, rivalId))` — cached battle per ordered matchup.
- `arena_intros(tokenId TEXT PRIMARY KEY, intro TEXT, ts INTEGER)` — cached public greeting.
- `arena_optout(tokenId TEXT PRIMARY KEY, ts INTEGER)` — gotchis hidden from the public arena.
- Daily-ceiling counter + per-IP buckets may be in-memory (reset daily) rather than persisted.

---

## 11. Edge cases (tested)

| Case | Handling |
|---|---|
| Invalid / nonexistent tokenId | Friendly "lost spirit" page; no crash. |
| Gotchi vs itself | Blocked ("can't roast your own reflection"). |
| Gotchi never companioned | Works — personality is deterministic from traits. |
| Opted-out gotchi challenged | Withheld ("this spirit declined the arena"). |
| Rate-limited / capped visitor | Connect-wallet CTA (the gate). |
| Daily ceiling hit | Serve cached/template battle; never the paid key. |
| Subgraph / RPC down | Serve cached state or a graceful message. |

---

## 12. Testing

- **`battle.ts`** (vitest): trait-flavored output; guardrail asserts it **never references
  owner/human/wallet**; `contentFilter` applied; both gotchis represented; deterministic matchup
  cache key.
- **`safety.ts`** (vitest): hate / personal-attack attempts masked or deflected; opt-out respected.
- **`publicChat.ts`** (vitest): per-visitor cap enforced; cache/template-first; over-ceiling
  degrades to template; **never routes to the paid tier**.
- **`arenaCache.ts`** (vitest): matchup hit/miss; daily-ceiling counter; opt-out storage.
- **`publicState.ts`** (vitest): public fetch + cache; missing-token handling.
- **`og.ts`** (vitest): image + meta render for a battle/gotchi.
- **E2E (playwright):** `/g/:id` loads with **no wallet**; taste chat caps → connect CTA;
  `/arena/:a/vs/:b` renders a battle; share link carries OG meta; opt-out hides a gotchi.

---

## 13. Build order (foundation-first)

1. `publicState.ts` + `arenaCache.ts` + tests — public fetch + cache foundation.
2. Public `/g/:tokenId` page + `publicChat.ts` + `safety.ts` (taste chat, cache/template-first,
   caps) → demoable end-to-end.
3. `battle.ts` + `/arena/:a/vs/:b` page + matchup cache + daily ceiling.
4. `og.ts` image/meta + Share button (the viral object).
5. Funnel CTAs (connect-wallet / acquire-a-gotchi) + owner opt-out + polish.
6. *(later, additive)* soul ammo in roasts; king-of-the-hill leaderboard.

Each step is independently testable; after step 2 there is a working public gotchi page, and after
step 4 the full viral loop (battle → share → land) is live.
