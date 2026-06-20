# Plan 001 — Soul MCP (Bring-Your-Own-LLM)

**Written against commit:** `5ef9570` (branch `build/all-features`). If `git rev-parse --short HEAD` differs and the files below have moved, re-verify the excerpts before proceeding.

**Type:** Spike / vertical slice (prove the architecture with read + context tools; defer writes/seal/metering to a follow-on).

**Owner of LLM cost:** the MCP CLIENT (integrator), not us. **The MCP server makes ZERO LLM calls.** This is the central invariant of the whole plan — if any step makes the server call an LLM, the plan has failed.

---

## Why this exists

gotchi-closet has a working "soul + companion + roast" engine. Today it only lives inside the web app, and the operator pays for LLM generation (Groq free tier / OpenAI premium via a GHST credit ledger). We want to expose the engine as a **Model Context Protocol (MCP) server** so that *any* AI agent/app (Claude, a Discord bot, another dapp's agent, a user's own runtime) can plug a gotchi's soul into **its own model with its own API keys**.

The key realization (verified in `server/routes/companion.ts`): the expensive part — text generation — is a single `complete(systemPrompt, messages, tier)` call at [companion.ts:87/94/98](../server/routes/companion.ts). Everything *before* it is deterministic, LLM-free assembly:

```ts
// server/routes/companion.ts:57-75 (current state, abridged)
const state = await fetchGotchiState(tokenId);
const profile = buildPersonality(state);                       // persona + systemPrompt
const soul = soulDepthSnapshot(tokenId);                       // soul context string (or null)
const systemPrompt = soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt;
const messages = assembleMessages({                            // turn assembly
  facts: getFacts(wallet, tokenId),
  lore: retrieveLore(masked),
  history: getRecentMessages(wallet, tokenId, 20).map(m => ({ role: m.role, content: m.content })),
  userMessage: masked,
});
// ...only AFTER this does the LLM get called: complete(systemPrompt, messages, tier)
```

A BYO-LLM MCP server reuses that assembly and **returns `{ systemPrompt, messages }` (and a ready-to-load persona/prompt) instead of calling `complete`.** The client's model generates the reply. This makes the server cheap (subgraph/RPC reads + pure functions), removes the operator's LLM cost entirely, and is model-agnostic.

> Strategic note (see `plans/README.md` for the full roadmap): gotchi-closet itself becomes **customer #1** of this MCP (plan 003 — the web app sources persona/context from the MCP, then generates with its *own* llmProvider), and gotchi-closet also becomes the **storefront** that advertises + sells access to it (plan 004). v1 below is the foundation both depend on.

---

## Scope

### In scope (v1 vertical slice)
- A new MCP server process under `server/mcp/` that imports the existing engine modules and exposes **read + context tools, plus one embodiment prompt** — all deterministic, all LLM-free.
- stdio transport (the standard MCP local transport) as the primary; structure the code so an HTTP/SSE transport can be added later without rewriting the tool handlers.
- A npm script `mcp` to run it via `tsx`.

### Explicitly OUT of scope (do NOT touch / defer to follow-on plans)
- **Do not call `complete()` / import `server/companion/llmProvider.ts` anywhere in the MCP server.** (cost invariant)
- No write tools yet (`record_memory`, `seal_soul`) — those need signature auth + metering; defer to a later plan.
- No changes to `server/routes/companion.ts`, the web app, or any existing endpoint. The MCP server is purely additive. (Dogfooding the web app onto the MCP is plan 003, separate.)
- No collection-agnostic refactor here — v1 wraps Aavegotchi via the existing `fetchGotchiState`. Generalization is plan 002 (cross-referenced below).
- No auth/credit gating on the read tools in v1 (reads are cheap + public). Rate-limiting is a v1 nicety, not a blocker.

---

## Files

- **Create:** `server/mcp/index.ts` (server entry + transport), `server/mcp/tools.ts` (tool/resource/prompt handlers that reuse the engine), `server/mcp/README.md` (how to run + connect).
- **Modify:** `package.json` (add `@modelcontextprotocol/sdk` dep + an `mcp` script). This is the ONLY existing file touched.
- **Reuse (import, do not modify):**
  - `src/lib/companion/personality.ts` → `buildPersonality(state)` returns `{ systemPrompt, archetype, traitLines, ... }`
  - `src/lib/companion/knowledge.ts` → `retrieveLore(message, max?)`
  - `src/lib/companion/chatPrompt.ts` → `assembleMessages({ facts, lore, history, userMessage })`
  - `server/companion/gotchiState.ts` → `fetchGotchiState(tokenId)`
  - `server/companion/db.ts` → `getFacts(wallet, tokenId)`, `getRecentMessages(wallet, tokenId, n)`
  - `server/soul/snapshot.ts` → `soulDepthSnapshot(tokenId)`
  - `server/soul/depth.ts` / `src/lib/soul/quickDepth.ts` → depth/level (already used by the soul route)
  - `server/soul/seal.ts` → `readOnChainSeal(tokenId)`, `sealConfigured()` (read-only use)
  - `src/lib/roast/prompts.ts` → `archetypeFor(traits)`, `roastSystemPrompt(...)`, `ARCHETYPE_VOICE` (for `get_roast_setup`)
  - `server/routes/soul.ts` is the reference for how a soul payload is shaped (depth, level, breakdown, soulAgeDays, streak, kinship, memories, pastLives, sealStatus) — mirror that shape in `get_soul`.

---

## v1 tool / resource / prompt surface (all LLM-free)

1. **Resource** `soul://{tokenId}` → JSON soul document: depth, level, breakdown, soulAgeDays, streak, kinship, memories count, pastLives, sealStatus. (Mirror the `GET /api/soul/:tokenId` response shape in `server/routes/soul.ts`.)
2. **Tool** `get_soul(tokenId: string)` → same soul JSON as the resource (tool form for clients that prefer tools).
3. **Tool** `get_persona(tokenId: string)` → `{ systemPrompt }` where `systemPrompt = buildPersonality(state).systemPrompt` + (if present) `"\n\n" + soulDepthSnapshot(tokenId)`. This is the embodiment context the client's model loads to *become* the gotchi. **No LLM call.**
4. **Tool** `build_chat_context(tokenId: string, message: string, wallet?: string)` → `{ systemPrompt, messages }` produced exactly like `companion.ts:57-75` **but without** the `complete()` call. The client feeds `{ systemPrompt, messages }` to its own model. If `wallet` is omitted, pass empty history/facts (anonymous context). Reuse `assembleMessages` + `retrieveLore`; reuse `getFacts`/`getRecentMessages` only when `wallet` is a 0x string.
5. **Tool** `get_roast_setup(tokenIdA: string, tokenIdB: string)` → `{ a, b }` each with `{ name, archetype, voice, traits }` plus shared `rules` text, derived from `archetypeFor` + `ARCHETYPE_VOICE` + `roastSystemPrompt`. The client's model writes the actual burns. **No LLM call.**
6. **Tool** `verify_soul(tokenId: string)` → `{ configured, onChain }` from `sealConfigured()` + `readOnChainSeal(tokenId)` (cached, cheap).
7. **Prompt** `embody_gotchi(tokenId: string)` → an MCP *prompt* whose messages carry the `get_persona` systemPrompt as instructions, so a host (e.g. Claude Desktop) can one-click "become this gotchi."

> Every handler returns data assembled from pure functions + cached reads. Grep proof required at done-time: zero references to `llmProvider`/`complete(` under `server/mcp/`.

---

## Steps

- [ ] **Step 1 — Add the SDK + script.** In `package.json`, add dependency `"@modelcontextprotocol/sdk"` (latest) and a script `"mcp": "tsx server/mcp/index.ts"`. Run: `npm install`. Verify the server entry import resolves: read the installed `node_modules/@modelcontextprotocol/sdk/package.json` "exports" to find the server entry, then `node -e "require('<that entry>')"` exits 0. STOP and report if no server export exists.

- [ ] **Step 2 — Scaffold `server/mcp/tools.ts`.** Export pure async functions `getSoul(tokenId)`, `getPersona(tokenId)`, `buildChatContext(tokenId, message, wallet?)`, `getRoastSetup(a, b)`, `verifySoul(tokenId)`, each reusing the imports listed under "Files". Mirror `server/routes/soul.ts` for the soul shape and `server/routes/companion.ts:57-75` for the context assembly. **Do not import `server/companion/llmProvider`.** Add a top-of-file comment: `// INVARIANT: this module makes NO LLM calls — generation is the MCP client's job.`

- [ ] **Step 3 — Scaffold `server/mcp/index.ts`.** Create an MCP server (name `"gotchi-soul"`, version from package.json), register the resource/tools/prompt from the surface list wired to `tools.ts`, and connect a stdio transport. Each tool's input schema validates `tokenId` as a non-empty numeric string. Wrap every handler in try/catch returning a structured MCP error (never throw raw).

- [ ] **Step 4 — Typecheck.** Run: `npm run typecheck`. Expected: exit 0, no new errors. If the SDK lacks types, add minimal local types rather than `any`-casting everything; STOP and report if the SDK is untyped and large.

- [ ] **Step 5 — Smoke test the server boots.** Run: `npx tsx server/mcp/index.ts` and confirm it starts and waits on stdio without throwing (it will block — that's correct for stdio; Ctrl-C to exit). If the MCP Inspector is available (`npx @modelcontextprotocol/inspector npx tsx server/mcp/index.ts`), connect and list tools; otherwise verify via the stdio test client (see Test plan).

- [ ] **Step 6 — Prove the cost invariant.** Run from repo root: `grep -rnE "llmProvider|complete\(" server/mcp/` — expected: **no matches**. If anything matches, the invariant is violated — fix before done.

- [ ] **Step 7 — Write `server/mcp/README.md`.** Document: the BYO-LLM principle (server never generates), each tool/resource/prompt with an example input/output, how to run (`npm run mcp`), and a sample Claude Desktop `mcpServers` config block pointing at `tsx server/mcp/index.ts`. Note the v1 limitation: read-only, Aavegotchi-only, anonymous context unless a wallet is passed.

---

## Done criteria (machine-checkable)

- `npm run typecheck` → exit 0.
- `grep -rnE "llmProvider|complete\(" server/mcp/` → no matches (cost invariant holds).
- `npx tsx server/mcp/index.ts` boots without throwing.
- A stdio/direct test client can: list tools (expects ≥ 6), call `get_soul` for a known token (e.g. `1589` or `21403`) and receive a soul JSON with a numeric `depth` and a `level` string, and call `get_persona` and receive a non-empty `systemPrompt`. None of these calls produce any outbound LLM request.

## Test plan

Create `server/mcp/smoke.test.ts` (vitest) importing the `tools.ts` functions directly (not via transport):
- `getPersona("1")` → `{ systemPrompt: <string length > 50> }`.
- `getSoul("1")` → object with `typeof depth === "number"` and `typeof level === "string"`.
- `buildChatContext("1", "hi")` → `{ systemPrompt: string, messages: non-empty Array }`, with NO network/LLM dependency (mock `fetchGotchiState` per the pattern in `server/soul/*.test.ts`).
- Run: `npx vitest run server/mcp/smoke.test.ts` → all pass. Follow the DB-isolation approach (`closeDb()`) used in `server/soul/*.test.ts` if the DB is touched.

## Maintenance notes

- **The cost invariant is load-bearing.** Keep the grep check (Step 6) and the top-of-file invariant comment; a future LLM call here reintroduces operator cost.
- **Auth/metering is deferred, not forgotten.** Read tools are public in v1. Before write tools (`record_memory`, `seal_soul`), gate with `premiumSignatureValid` (`server/companion/auth.ts`) and meter *state/seal* operations — never generation (there is none).
- **Generalization (plan 002) makes this 100× more valuable.** Design tool names to accept a `collection` arg defaulting to `"aavegotchi"` now, so multi-collection isn't a later breaking change.

## Escape hatches

- If the installed `@modelcontextprotocol/sdk` server API differs from this plan's assumptions (entry path, registration API), **STOP and report the actual SDK shape** rather than guessing.
- If `fetchGotchiState` needs env/secrets unavailable in the executor's environment, **do not hardcode any secret**; make the smoke test mock it and note the runtime env requirement in the README.
- `soulDepthSnapshot`/`readOnChainSeal` may make network calls that fail offline — they already fail safe (return null); the tools must tolerate null and still return a valid soul shape (off-chain depth, `sealStatus: "unconfigured"/"unsealed"`).
