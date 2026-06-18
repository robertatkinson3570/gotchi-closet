# Roast Arena — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Project:** gotchi-closet
**Builds on:** Gotchi Companion (personality engine, premium tier + wallet-signature auth, content filter), Global Chat (sign-once-to-join + ownership pattern). **Bridges to:** [Gotchi Soul](2026-06-18-gotchi-soul-design.md) (not yet built — roast XP feeds soul depth later via a seam).

---

## 1. Summary

A **Roast Arena**: two gotchis roast each other in an AI-driven battle, an **AI judge** declares a winner, and the winner gains **Roast XP** toward its eventual **soul**. A public **leaderboard** ranks gotchis by XP.

Matchmaking is an **open async queue**: you put one of your gotchis up as an open challenge; anyone (including you, with another gotchi) accepts by choosing their own gotchi. On accept, the server runs the whole battle instantly, stores a replayable transcript, and updates both gotchis' records.

**Premium is the edge:** roast lines are generated at each owner's LLM tier — free gotchis roast via Groq, **premium (paid OpenAI) gotchis roast with the sharper model, so they win more.** It's an edge, not a guarantee: the judge scores the actual roast content, so a witty free gotchi can still upset a lazy premium one.

The Arena opens as a **modal** from a "⚔️ Roast Arena" link in the companion panel (promo), so players stay in context.

### Design pillars
- **Your gotchi fights as itself.** Roast voice comes from the existing trait/age/kinship personality engine; the gotchi you pick matters.
- **Pay for an edge, not a win.** Premium sharpens generation; an impartial single-model judge scores content, so free players still win sometimes.
- **Mean, never hateful.** Burns target the gotchi's traits/looks/vibes/on-chain life — playful trash talk, never slurs or protected-class attacks. Enforced by system prompt + content filter.
- **XP is the bridge to Soul.** Roast XP accrues now in its own store; the Soul depth engine reads it as a signal when Soul ships — no rework.

---

## 2. Scope

### In scope (v1)
- Open queue (enter / leave / list), keyed by gotchi token id.
- Accept → **instant AI-judged battle**: 3 rounds, per-owner-tier roast generation, impartial structured-output judge.
- Replayable transcript (animated turn-by-turn on open) + per-wallet/gotchi battle history.
- Roast XP + win–loss record per gotchi; **XP leaderboard**.
- Roast Arena **modal** (Queue · My Battles · Leaderboard · Replay) + companion promo link.
- Auth (sign-once + ownership), content moderation, per-wallet rate limit, graceful template fallback.

### Out of scope (v1) — explicit phase-2 seams (§8)
- Live PvP between two present players (SSE-streamed battles).
- Community/spectator **voting** as an alternate judge.
- **Stakes/wagers** ("peeps play and win").
- **ELO rating** for competitive ranking (v1 ranks by XP).
- Direct Soul integration (Soul isn't built; the XP seam is defined, the read happens when Soul ships).

---

## 3. Architecture

```
┌──────────────────────────── CLIENT (modal) ───────────────────────────┐
│  Companion panel: "⚔️ Roast Arena" link → opens RoastArenaModal        │
│  RoastArenaModal (Radix dialog):                                       │
│    [ Queue ]  [ My Battles ]  [ Leaderboard ]   + BattleReplay view    │
│    useRoastArena() hook → REST calls                                   │
└───────┬──────────────────────────────────────────────────────┬────────┘
        │ /api/roast/queue  /api/roast/battle  /api/roast/...   │
┌───────┼──────────────────────────────────────────────────────┼────────┐
│  SERVER (Express)                                                      │
│   routes/roast.ts   queue / battle / battle:id / battles / leaderboard │
│   roast/engine.ts   orchestrates a battle (LLM calls + judge + store)  │
│   roast/store.ts    SQLite: roast_queue, roast_battles, roast_stats    │
│   reuses: companion/auth.ts (verifyRoomSignature), gotchiState.ts      │
│           (owner+traits), llmProvider.complete(tier),                  │
│           isPremiumActive, contentFilter, buildPersonality             │
│  src/lib/roast/  (PURE, shared, unit-tested):                          │
│     prompts.ts  roast-line prompt + judge prompt builders              │
│     judge.ts    parse/validate judge structured output → verdict       │
│     xp.ts       award(win|loss) → xp delta (pure)                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Units & boundaries

| Unit | Location | Responsibility |
|---|---|---|
| `prompts.ts` | `src/lib/roast/` (pure) | Roast-line prompt (persona + **archetype** + opponent + prior lines) and the judge prompt; trait→roast-archetype mapping (ported from GotchiHeist skills). |
| `judge.ts` | `src/lib/roast/` (pure) | Validate/parse the judge's structured verdict; safe deterministic fallback verdict. |
| `templates.ts` | `src/lib/roast/` (pure) | Archetype-flavored fallback burn pool (GotchiHeist phrase-pool pattern); deterministic pick. |
| `xp.ts` | `src/lib/roast/` (pure) | `xpForResult(outcome) → number` (winner large, loser small). |
| `llmProvider.ts` | server (extend) | Add an **ordered provider chain per tier** (NIM → Groq → OpenAI per §4.5) + NIM provider; keep `complete(systemPrompt, msgs, tier)` API. |
| `engine.ts` | server | Run a battle: N rounds of `llmProvider.complete(tier)` per side (chain), content-filter, free-tier judge, persist, update stats. |
| `store.ts` | server (SQLite) | `roast_queue`, `roast_battles`, `roast_stats`. Mirrors `companion/db.ts`. |
| `roast` route | server | queue/leave/list, battle (accept+resolve), battle:id, history, leaderboard. |
| `RoastArenaModal` + `useRoastArena` | client | Queue, accept, history, leaderboard, animated replay. |
| companion promo link | client | "⚔️ Roast Arena" entry in the companion panel. |

Pure `src/lib/roast/*` modules follow the companion rule: no `@/`/DOM (server imports them relatively).

### 3.1 Modal visual direction — "sexy beast", cutting-edge
The Roast Arena modal is a flagship moment and must feel like a premium fighting-game screen, consistent with the companion's glass aesthetic but bolder:
- **Arena, not a dialog.** Full-bleed glassmorphic overlay (translucent near-black, heavy backdrop blur, animated neon edge) — not a boxy modal. Subtle animated grain/scanline for an arcade feel; respect `prefers-reduced-motion`.
- **VS staging.** The battle replay frames the two gotchis as opponents — sprites on left/right with a glowing **"VS"** sigil, name + W–L + a small premium/free badge under each. Trait-tinted glow per gotchi (reuse the companion's `glowColor`).
- **Roasts land like hits.** On replay, each burn animates in (spring slide + impact shake on the *target* side, a quick spark/flash), alternating sides; a round counter ticks; pacing builds to the verdict. Lift the **timing/choreography** (staged entrances, impact beats, pacing constants) from GotchiHeist's `CharacterStage` + `sceneDirector` rather than inventing it.
- **Verdict drop.** The judge's call lands as a dramatic reveal — winner sprite pulses/levels-up, **+XP counts up**, loser dims; one-line verdict in a marquee.
- **Leaderboard = trophy wall.** Rank chips (gold/silver/bronze for top 3), sprite + name + W–L + XP, the viewer's own gotchi highlighted; tasteful motion on rank-in.
- **Tabs as arena controls.** Queue · My Battles · Leaderboard as segmented neon controls; clear primary CTAs ("Enter the Arena", "Roast!").
- **Mobile-first.** Full-screen sheet on small screens; sprites stack; thumb-reachable CTAs.
- Palette stays in the existing ghost-purple / cyan-neon Tailwind theme — no clashing new palette.

---

## 4. Battle flow & engine

### 4.1 Flow
1. **Queue:** `POST /queue {tokenId, wallet, signature, signedAt}` → verify sig + ownership → upsert into `roast_queue` (one entry per gotchi).
2. **Accept:** `POST /battle { challengerTokenId, wallet, signature, signedAt, opponentTokenId }` → verify challenger sig + ownership → confirm opponent is in `roast_queue` → resolve (4.2) → remove opponent from queue → return `{ battleId }`.
3. **Replay:** `GET /battle/:id` → transcript; client animates lines in, ending on the verdict.

### 4.2 Resolution (`engine.ts`)
- Fetch both gotchis' state (`fetchGotchiState`) → `buildPersonality` for each. Determine each side's tier via `isPremiumActive(ownerWallet)`.
- **Roast style per gotchi (in character):** `prompts.ts` derives a **roast archetype** from the gotchi's traits (ported from GotchiHeist's skill archetypes) — e.g. high AGG → *Gladiator* (charges in, trash-talks), high SPK → *Dark Oracle* (cryptic, ominous burns), low AGG → *Zen* (eerily calm devastation), low BRN → *Lucky Fool* (accidentally brutal). The archetype shapes each line's *attitude* on top of the personality voice, so no two gotchis roast the same way.
- **3 rounds**, alternating (A, B each round = 6 lines). Each line: `prompts.roastLine(persona, archetype, opponent, priorLines)` → `llmProvider.complete(systemPrompt, msgs, ownerTier)` (provider chain, §4.5); on a fully failed chain → **template burn pool** (§4.6). Each line passes `contentFilter` (mask) before storing.
- **Judge:** `prompts.judge(aLines, bLines, aName, bName)` → a **single fixed FREE model run for every battle** (the §4.5 free chain) → structured output `{ winner: "a"|"b", aScore, bScore, verdict }`, validated by `judge.ts`. A free judge is deliberate: it keeps the judge **impartial** (same ref for everyone) AND keeps **free-vs-free battles + the judge zero operator cost** (a premium judge would charge OpenAI on every battle, including free ones). Premium's advantage stays purely in *generation* quality. On judge failure → **deterministic fallback** in `judge.ts` (compare aggregate score signal; tiebreak by lower `token_id`) — no randomness — so a battle always resolves.
- **Persist:** insert `roast_battles` (both line arrays as `transcript` JSON, verdict, scores, winner). Update `roast_stats` for both via `xp.xpForResult` (winner +large, loser +small; increment wins/losses).

### 4.3 Guardrails
System prompt for roast lines: *roast the opponent gotchi's traits, looks, vibes, and on-chain life; be playful and savage but NEVER use slurs, hate, or attacks on protected classes; keep each burn to one or two sentences.* `contentFilter` is the backstop on every line and is also applied to the judge's verdict text.

### 4.4 Concurrency, fairness & integrity
- **Atomic queue claim (no double-accept).** Two challengers can hit `POST /battle` against the same queued gotchi at once. The opponent is **claimed in a single SQLite transaction** — `DELETE FROM roast_queue WHERE token_id = ?` and proceed only if **one row was deleted**; otherwise return `409 already taken`. Exactly one battle ever resolves per queue entry.
- **Re-verify the opponent at battle time.** The queued gotchi may have been **sold** since it queued. At resolve, re-check the opponent still exists and is owned by its queued wallet (`fetchGotchiState(opponentTokenId).owner === queuedWallet`); if not, drop it from the queue and return `410 opponent no longer available` (no battle, no XP).
- **Anti-grind XP.** To stop farming the leaderboard by replaying weak/own opponents: XP from battles against the **same opponent token** within a rolling window (e.g. 1h) **diminishes** (full → reduced → zero); the win–loss record still updates but XP does not balloon. **Self-battles** (both gotchis owned by the same wallet) are allowed for fun but award **no leaderboard XP** to either side (record-only) — you can't pump your own ranking.
- **Offline-side cost attribution.** The queued (offline) gotchi roasts at **its owner's** tier; that owner's premium lines **burn their own credits** (§7), falling back to the free chain when their balance hits 0 — so a challenger can't drain someone else's credits beyond their balance, and the owner can never be charged beyond what they bought.

### 4.5 Model tiers & cost (near-zero cost)
The existing `llmProvider.complete(systemPrompt, msgs, tier)` already provides what roast needs — **no provider change**. (NVIDIA NIM/kimi was evaluated and dropped: `kimi` is deprecated — HTTP 410 Gone — and NIM's remaining models are just `llama-3.3-70b`, the same family Groq already gives us free, so NIM adds no quality. Groq's `llama-3.3-70b-versatile` produces genuinely savage roasts.)

| Use | Model | Operator cost |
|---|---|---|
| **Free roast** | Groq `llama-3.3-70b-versatile` → template pool | **$0** |
| **Premium roast** | OpenAI `gpt-4o-mini` (burns 1 credit) → on failure, free model → template pool | OpenAI only (credit-paid) |
| **Judge (all battles)** | Groq `llama-3.3-70b-versatile` → deterministic fallback | **$0** |

- Net effect: **free roasts and every judge call cost nothing**; the operator only spends OpenAI against **already-purchased credits** (§7). The route attempts the premium (OpenAI) line and **burns a credit only when OpenAI actually returns text** — exactly as the live companion now does.
- **Hard caps:** `max_tokens` capped (~120 per roast line, ~150 for the judge), request timeout (~20s), and a per-wallet **battle rate limit** (~3 battles/min) to protect the free Groq quota.

### 4.6 Template burn pool (never hard-fail)
When the whole provider chain fails, `src/lib/roast/templates.ts` returns an **archetype-flavored canned burn** (ported from GotchiHeist's fallback phrase-pool pattern) — e.g. *"your BRS is lower than my kinship 💀"*, *"summoned from a portal just to lose to me?"* — selected deterministically by the gotchi's archetype + line index (no `Math.random`). Degraded but in-character; a battle always produces 6 lines and a verdict.

---

## 5. Data model & endpoints

### 5.1 SQLite (in the companion DB; timestamps unix **ms**)
- `roast_queue(token_id TEXT PRIMARY KEY, wallet TEXT, gotchi_name TEXT, queued_at INTEGER)`
- `roast_battles(id INTEGER PK AUTOINCREMENT, a_token TEXT, a_name TEXT, a_wallet TEXT, b_token TEXT, b_name TEXT, b_wallet TEXT, winner_token TEXT, transcript TEXT, verdict TEXT, a_score INTEGER, b_score INTEGER, created_at INTEGER)` — `transcript` is JSON: `[{ side:"a"|"b", round:number, text:string }]`.
- `roast_stats(token_id TEXT PRIMARY KEY, wallet TEXT, gotchi_name TEXT, wins INTEGER, losses INTEGER, xp INTEGER, updated_at INTEGER)`

### 5.2 Endpoints — `/api/roast`
| Method + path | Body / query | Returns |
|---|---|---|
| `GET /queue` | — | `{ queue: QueueEntry[] }` (token, name, record) |
| `POST /queue` | `{tokenId, wallet, signature, signedAt}` | `{ ok }` (sig + ownership; 401/403 on fail) |
| `POST /queue/leave` | `{tokenId, wallet, signature, signedAt}` | `{ ok }` |
| `POST /battle` | `{challengerTokenId, wallet, signature, signedAt, opponentTokenId}` | `{ battleId }` (resolves synchronously) |
| `GET /battle/:id` | — | `{ battle }` (full transcript + verdict + scores) |
| `GET /battles` | `?tokenId=` or `?wallet=` | `{ battles: BattleSummary[] }` (history) |
| `GET /leaderboard` | `?limit=` (≤100) | `{ rows: StatRow[] }` (XP desc) |

Reads (`/queue`, `/battle/:id`, `/battles`, `/leaderboard`) are public; writes (`/queue`, `/queue/leave`, `/battle`) require signature + ownership.

**Privacy:** wallets are stored (for ownership/auth) but **never returned in public responses** — a `toPublic()` mapper exposes only token id, gotchi name, transcript, verdict, scores, and W–L/XP. Identity in the Arena is the *gotchi*, not the address (same as Global Chat).

---

## 6. XP, record & leaderboard

- **`xp.xpForResult`** (pure): winner `+WIN_XP`, loser `+LOSS_XP` (`WIN_XP` ≫ `LOSS_XP` > 0). Exact values set in implementation; tested for win ≫ loss > 0.
- **`roast_stats`** increments `wins`/`losses` and `xp` per gotchi each battle.
- **Leaderboard** ranks by `xp` desc, returns sprite/name (client renders sprite via `GotchiSvgById(token_id)`) + W–L + XP. Because winning drives most XP and premium gotchis win more, the board rewards effort + the paid edge.
- **Soul bridge:** `roast_stats.xp` is the canonical roast-XP the Soul depth engine will read later (§8). No coupling now beyond the column existing.

---

## 7. Auth, cost & moderation (reuse)

- **Auth:** queue/leave/battle require the **sign-once** signature (`verifyRoomSignature` from `companion/auth.ts`) + **ownership** (`fetchGotchiState(tokenId).owner === wallet`), identical to Global Chat. Client caches the signature like the room/premium flows.
- **Tier = credit balance (not time).** Premium is **credit-based**. **1 credit = 1 premium LLM generation** (a companion reply or one roast line). A wallet's lines use OpenAI while `credits(ownerWallet) > 0`, **burning 1 credit per premium line**; at 0 credits the side **seamlessly falls back to the free NIM/Groq chain** — never an error. The judge always runs the **free** chain (impartial + $0). Credits **do not expire**.
- **Pricing (credit packs, GHST ≈ $0.058 — see §7.1):** **500 GHST → 5,000 credits** (~$2 cost vs $29 → ~93% margin) · **1000 GHST → 12,000 credits** (bulk bonus, ~92%). The **credit balance is the cost cap** — a buyer can never cost more than `credits × ~$0.0004`, so the operator is **loss-proof** regardless of usage or GHST price.
- **Top-up:** when a wallet's credits run low/zero, the UI shows a **"buy more credits"** CTA; `addCredits` simply **stacks** onto the balance (idempotent by txHash). No renewals or expiry — buy another pack anytime.
- **Cost control:** free roasts + the judge cost **$0** (NIM/Groq); the operator only spends OpenAI against **already-purchased credits**. Per-wallet **battle rate limit** (~3 battles/min) + the §4.5 sliding-window LLM cap (~60 calls/10 min) + per-line `max_tokens` cap protect the *free* tier from flooding (NIM/Groq quotas) — they don't touch your wallet.
- **Moderation:** anti-hate system prompt + `contentFilter` on every line and the verdict; the stored transcript is already clean.

### 7.1 Credit ledger — no cap workarounds
Credits are the only thing standing between a user and the operator's OpenAI key, so the ledger is hardened against circumvention:
1. **Server-authoritative.** Tier is decided from the **DB credit balance**, never from the client or request body. A client claiming "premium" without credits gets the free chain.
2. **Atomic check-and-burn.** Each premium line runs only if `UPDATE companion_entitlements SET credits = credits - 1 WHERE wallet = ? AND credits > 0` affects **exactly one row**. Concurrent requests can't over-spend, double-dip, or go negative; if 0 rows change, that line uses the free chain.
3. **Signature + ownership gate** (already built) — a caller can't spend another wallet's credits or fake a tier; the wallet is proven by signature, not trusted from the body.
4. **Payment-verified, idempotent crediting** — credits are added **only after** on-chain GHST verification (`verifyGhstPayment`), **deduped by txHash**, so one payment can't be replayed for multiple credit grants.
5. **No free-OpenAI path.** The free tier is NIM/Groq ($0 to the operator); there is no code path that reaches OpenAI without first successfully burning a purchased credit.

### 7.2 Shared credit store (companion + roast)
The companion's premium store migrates from `expires_at` (days) to a **`credits` balance** on `companion_entitlements`: `isPremiumActive(wallet)` → `hasCredits(wallet)`, `grantPremium` → `addCredits(wallet, amount, txHash)` (idempotent), plus `burnCredit(wallet)` (the atomic decrement). **One ledger** powers both the live companion premium and the roast premium edge. The companion's `pricing.ts` `COMPANION_TIERS` change from `{days, priceGhst}` to `{credits, priceGhst}` (500 GHST → 5,000, 1000 GHST → 12,000). This is a small change to the live companion, applied as the first build step.

---

## 8. Phase-2 seams

| Phase-2 feature | Seam (no v1 rework) |
|---|---|
| **Live PvP** (both players present) | Battle resolution emits each line; stream over Global Chat's SSE infra instead of returning all at once. Engine + store unchanged. |
| **Community voting** judge | Swap the AI-judge step for a vote-collection window; `roast_battles.winner_token` is set on tally instead of immediately. |
| **Stakes / wagers** | A pre-battle escrow (GHST, reusing `verifyGhstPayment`) gated on the same `/battle` accept; payout on resolve. |
| **ELO rating** | Add a `rating` column to `roast_stats`; leaderboard switches to rank by rating; XP unchanged. |
| **Soul integration** | Soul depth engine reads `roast_stats.xp` as a signal once Soul ships. |

---

## 9. Testing

- **`prompts.ts`** (vitest): roast-line prompt includes persona + archetype + opponent name + prior lines; trait→archetype mapping (high AGG → Gladiator, high SPK → Dark Oracle, low AGG → Zen, etc.); judge prompt includes both line sets; pure deterministic strings.
- **`templates.ts`** (vitest): returns a non-empty archetype-flavored burn; deterministic by archetype + index (no randomness); covers each archetype.
- **`llmProvider.ts`** (vitest, mocked fetch): chain falls through NIM→Groq on failure and returns the first success; free chain never calls OpenAI; premium chain tries OpenAI first; all-fail → null (engine then uses the template pool).
- **`judge.ts`** (vitest): parses a valid structured verdict; rejects malformed/garbage → safe deterministic fallback verdict with a winner (tiebreak by lower token_id).
- **`xp.ts`** (vitest): `xpForResult(win) ≫ xpForResult(loss) > 0`.
- **`store.ts`** (vitest, temp DB like the companion/global tests): queue upsert/leave/list; battle insert + transcript round-trip; `roast_stats` win/loss/xp accrual; leaderboard XP-desc ordering.
- **`engine.ts`** (vitest, mocked `llmProvider`/`gotchiState`): a battle produces 6 filtered lines + a judged winner; LLM-null → template lines; judge-fail → fallback winner; both stats updated; opponent removed from queue.
- **Integrity (vitest):** atomic claim — a second `/battle` against an already-claimed opponent gets `409` and no second battle; opponent sold since queuing → `410`, dropped, no XP; same-opponent-within-window → diminished XP; self-battle → record-only, no XP; `toPublic()` output contains **no wallet field**.
- **Route** (manual curl): `/queue` validation 400, missing-signature 401, ownership 403; `/leaderboard` empty `{rows:[]}`.
- **E2E (playwright):** open the Roast Arena modal from the companion link; Queue/Leaderboard render (mocked APIs); a battle replay animates lines and shows the verdict.

---

## 10. Build order (foundation-first)

1. **Credit ledger migration (§7.2):** `companion_entitlements` → `credits` balance; `hasCredits`/`addCredits`/`burnCredit` (atomic); `pricing.ts` → credit packs (500 GHST → 5,000, 1000 GHST → 12,000); update the companion route to burn a credit per premium reply + the GoPremium UI to credit packs + a "buy more" CTA. Tests for atomic burn (no negative, no double-spend) + idempotent credit. Deploy (live companion).
2. `src/lib/roast/` — `prompts.ts` (incl. trait→archetype), `judge.ts`, `templates.ts` (burn pool), `xp.ts` + tests (pure core).
3. Extend `server/companion/llmProvider.ts` to an ordered provider chain + NIM `kimi-k2.5` provider (§4.5) + tests; add NIM env to `.env.example` and the deploy secret-sync.
4. `server/roast/store.ts` (SQLite) + tests.
5. `server/roast/engine.ts` (resolve a battle: per-tier generation via the chain, free-tier judge, persist, stats) + tests (mocked provider/state).
6. `server/routes/roast.ts` (queue/battle/history/leaderboard) with the §4.4 integrity rules (atomic claim, opponent re-verify, anti-grind XP, `toPublic`) + mount + manual curl.
7. Client: `useRoastArena` hook + `RoastArenaModal` (Queue · My Battles · Leaderboard · animated Replay) built to the §3.1 "sexy beast" visual direction + companion "⚔️ Roast Arena" promo link.
8. E2E + polish (replay animation, leaderboard sprites, in-chat Arena nudge).

Each step is independently testable; a working queue + AI-judged battle + leaderboard exists after step 6 (API) / step 7 (UI). PvP, voting, stakes, ELO, and Soul integration are phase-2 seams (§8).
