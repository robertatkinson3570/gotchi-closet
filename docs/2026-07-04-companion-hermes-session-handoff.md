# Session handoff — Autonomous Hermes + Companion fixes (2026-07-04)

Full context for a fresh agent picking up the GotchiCloset **gotchi companion** ("Hermes") work.
Read this before touching companion/chat code. Written after a long session that shipped a lot and
made some avoidable mistakes — both are recorded honestly below.

---

## 1. What shipped this session (all merged to `main` + deployed)

| PR | What | Status |
|----|------|--------|
| #6 | **Autonomous Hermes** plan Tasks 1-6: goal store, goals API + auto-collect toggle, bounded multi-step tool loop, autonomous cron (dormant), "while you were away" report, ops runbook | merged, live |
| #7 | **Steward RPC 429 fix** — `server/steward/chain.ts` now uses viem `fallback()` over a pool of public Base RPCs + multicall batching. Fixed "empty reservoirs" dying with "couldn't send" | merged, live, verified |
| #8 | **Companion chat fixes** — deterministic navigation, real lending read (own vs rented), commands/capabilities list, live-data + no-fabrication directive, stronger trait-driven persona | merged, live, verified |
| #9 | **Groq model fallback** — `complete()`/`completeWithTools()` try 70B then fall back to `llama-3.1-8b-instant` when the 70B hits its daily token cap | merged, live, verified |

### Go-live flips done this session
- **`HERMES_AUTONOMOUS=1`** — GitHub secret set + synced to VPS `.env`; autonomous cron started (still a no-op until a wallet enrolls a Steward session key).
- **`VITE_STEWARD_AUTOMATION=1`** — set in **Vercel** production env (via `vercel env add`) + prod rebuilt/redeployed. Enroll/recruit wizard on `/steward` is live.
- Bundler: user confirmed the Alto bundler is up + funded on the VPS.
- **Still pending for full autonomy:** per-owner enrollment (each owner signs once) + the runbook's safety check (confirm the session key rejects non-allowlisted selectors). See `docs/hermes-autonomous-runbook.md`.

---

## 2. THE key gotcha — Groq free-tier token limits (this dominated the session)

The companion LLM is **Groq `llama-3.3-70b-versatile`** (free tier), cloud API, NOT self-hosted. Two limits:
- **TPM (tokens per minute): 12,000** — headers `x-ratelimit-*-tokens`.
- **TPD (tokens per DAY): 100,000** — this is the killer. Error body says: `Rate limit reached ... on tokens per day (TPD): Limit 100000`.

When TPD is exhausted, **every** chat 429s and `complete()` returns null → the UI shows the template
fallback **"the spirits are quiet right now… ask me again soon 🔮"**. This looks like a bug but is quota.

**Mitigation shipped (#9):** on any 70B failure, retry on **`llama-3.1-8b-instant`** — a SEPARATE daily
bucket — so chat stays alive (lower quality, but not dead). Override via `GROQ_MODEL` /
`GROQ_FALLBACK_MODEL` env. Diagnostic logging: `[llm] complete <model> !ok <status>` in server logs.

**Hard lesson (do not repeat):** ~100k tokens/day is only ~30-100 chats. Bursty automated testing
(dozens of full chat calls in minutes) **exhausts the shared prod key's daily budget** and degrades the
live product for real users. When testing chat: **one real message at a time, human-paced (>=15s apart),
a handful total.** Never fire test bursts at the chat endpoint. Prefer unit tests + the token-measurement
script (below) which cost ZERO Groq tokens.

**"no users can pay"** (user's explicit constraint): the OpenAI premium path is effectively dead for
reliability — do NOT design around users buying credits. The **free tier must carry it**. The lever is
reducing tokens per request (see §5 next steps), not upsells.

---

## 3. Architecture / file map (companion)

Prod topology: **frontend on Vercel** (`gotchicloset.com`), **companion+steward API on the VPS Express
server** (`api.gotchicloset.com`). Deploy = push to `main` -> `.github/workflows/deploy-autorenew.yml`
rebuilds the VPS (self-hosted runner) AND Vercel builds the frontend.

- `server/routes/companion.ts` — the `/chat` handler. Order of handling: deflected -> **help intent
  (capabilities list)** -> **deterministic nav (detectNav)** -> data fetches (holdings/lending/deals/dao/
  estate) -> deterministic `wantsCollect` (prepare-sign upkeep) -> bounded tool loop (`runAgentLoop`) ->
  plain `complete()` with template fallback. Also `/goals`, `/actions/:wallet/:tokenId`, `/premium/*`, `/history`.
- `server/companion/`
  - `intent.ts` — **`detectNav(msg)`** (deterministic route mapping for the whole site; motion verb + place keyword), **`isHelpIntent`**, **`CAPABILITIES_REPLY`**. Fully unit-tested (`intent.test.ts`).
  - `lending.ts` — **`fetchLendingSummary(wallet)`**: gotchiLendings as lender (rented out vs listed) and borrower (renting in). Regex that gates it must match plurals (`lend\w*|rent\w*`) — a `\b`-boundary miss caused a hallucinated "no active lendings".
  - `holdings.ts`, `baazaar.ts`, `dao.ts`, `estate.ts` — live read summaries injected into context.
  - `llmProvider.ts` — `complete()` / `completeWithTools()` with the **70B->8B model-fallback loop**.
  - `agentLoop.ts` — bounded multi-step tool loop (read tools feed back; run_upkeep/navigate terminal).
  - `autonomousCron.ts` — `runAutonomousPass` (pure) + `startHermesAutonomousCron` (gated on `HERMES_AUTONOMOUS=1`).
  - `db.ts` — SQLite: messages, facts, entitlements(credits), actions, **goals**.
  - `tools.ts` — `HERMES_TOOLS` (run_upkeep, navigate) + `HERMES_READ_TOOLS` (get_estate/holdings/deals/dao).
- `src/lib/companion/personality.ts` — **`buildPersonality`** + `UNIVERSAL_BASE_PERSONA` + `personalityToSystemPrompt`. This session rewrote it to **lead with trait-driven voice** (was "subtle/light generic assistant"). `personality.test.ts` pins: contains `UNIVERSAL_BASE_PERSONA`, the name, `SPK <n>`, a short/brief/concise cue, and "character" — keep those if editing.
- `src/lib/companion/api.ts` — client: `postChat`, `getGoals`/`setGoal`, `getRecentActions`.
- `src/components/companion/CompanionChatPanel.tsx` — chat UI, auto-collect toggle, proactive nudge, "while you were away" report.
- `docs/hermes-autonomous-runbook.md` — delegated-signing go-live checklist.

---

## 4. Current chat behavior (verified live this session)

- **Navigation** (deterministic, no LLM): "take me to / show me / go to <baazaar|deals|forge|dao|lending|lands|staking|pulse|explorer|games|get-tokens>" -> correct `navigate` route. Works even when Groq is throttled.
- **"what can you do?"** -> fixed capabilities list (deterministic).
- **"what do I own?"** -> separates owned vs rented ("own 7 ... plus 31 more rented out"). Real subgraph data.
- **"what lendings do I have / am I renting out?"** -> real lending position.
- **"any deals now?"** -> live cheapest Baazaar listings, stated as current (no "I recall").
- **news / anything with no live source** -> honestly defers to official channels (no fabrication).
- **Persona** -> trait-driven voice comes through when the LLM responds (e.g. high-NRG gotchi: "feelin' the energy, lowkey restless"). NOTE: a high-SPK "eerie oracle" gotchi (e.g. token 4821 "Binance") can read as **cryptic/alien** ("I felt you coming. speak, owner.") — persona may need dialing so it stays warm/helpful. Open item.

---

## 5. In-progress / next steps

1. **Free-tier token trim (was mid-edit, UNCOMMITTED)** — branch `perf/free-tier-token-trim`. Intended changes: chat `history` window **20 -> 8** (`server/routes/companion.ts`) and `max_tokens` **450 -> 320** (both spots in `llmProvider.ts`). Roughly halves tokens/request -> ~2x more 70B chats/day on the free budget. Low risk. Finish, unit-test, PR, merge. (The `history` edit failed to apply because the file changed under me — just re-read and re-apply.)
2. **Further token reduction** (biggest free-tier lever): consider trimming `SITE_OVERVIEW` (~221 tok, injected every request) and only injecting it on how-to/site questions; shorten injected data name-lists.
3. **Persona tuning** — keep personality but ensure high-SPK gotchis stay helpful, not cryptic/alien.
4. **Autonomous go-live** — per-owner enrollment + safety verification (session key must reject non-allowlisted selectors) per `docs/hermes-autonomous-runbook.md`. Cron is armed (`HERMES_AUTONOMOUS=1`) but dormant with zero enrollments; safety invariant: only actuator is `runUpkeep` -> Steward session key scoped to pet/channel/claim.

---

## 6. Facts the next agent needs

- **Prod API:** `https://api.gotchicloset.com` (VPS Express). Frontend: `gotchicloset.com` (Vercel).
- **Deploy:** push/merge to `main` -> `deploy-autorenew.yml` (VPS, self-hosted runner) + Vercel. Watch with `gh run watch <id>`. VPS SSH is refused (hPanel-only); ops go through the Actions runner.
- **Vercel:** CLI is authed as `robertatkinson3570`; project `gotchi-closet` (`prj_gnIDM6cgTs9ynlus1hscXCAlxNpA`, team `team_YDWkmy3loMovQZo1gXafs3rr`). Env vars via `vercel env add ... production` then redeploy (`vercel redeploy <latest-prod-url>`). VITE_ vars are build-time — need a rebuild to take effect. **Do NOT `vercel --prod` from a stale local branch.**
- **Groq:** key in VPS `.env` (synced from GH secret `GROQ_API_KEY`) and local `.env`. Model `llama-3.3-70b-versatile`, fallback `llama-3.1-8b-instant`. Limits TPM 12k / **TPD 100k**.
- **Test wallet (has real data):** `0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96` — 7 gotchis owned + **31 rented out**. Gotchi token `4821` (name "Binance", high-SPK eerie-oracle) exists for persona tests.
- **Token-cost measurement (0 Groq tokens):** a `tsx -e` script importing `buildPersonality`/`fetchLendingSummary`/`assembleMessages` and dividing char length by 4. Use this instead of hammering `/chat`.
- **GateGuard hook:** this environment forces a fact-block (importers / affected functions / data-shape / verbatim instruction) before every Edit/Write and the first Bash. Expect it; present the facts and retry.
- **Local git can drift behind `origin/main`** (merges done via `gh` server-side). Always `git checkout main && git pull origin main` before branching, or you'll edit stale files. (This bit me — a branch was created off stale main.)

## 7. User feedback / working style (heed these)
- **Test like a human, not a bot:** hold a real conversation, one message at a time, spaced out. Judge "does it respond like a real convo?" — that's the bar.
- **Don't burn tokens.** Bursty chat testing exhausts the shared free daily budget and breaks the live product. Use static/token-measurement checks; touch the live LLM sparingly.
- **No paid path for users** — optimize the free tier; don't design around OpenAI credits.
- The user moves fast and adds requirements mid-task; keep changes tight and verify in the running app, not just unit tests.
