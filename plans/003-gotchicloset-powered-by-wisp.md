# Plan 003 — GotchiCloset, powered by Wisp (dogfood + badge)

**Written against commit:** `5ef9570` (branch `build/all-features`). Re-verify excerpts if HEAD has moved.

**Type:** Refactor-behind-the-seam + a small branding component. No user-facing behavior change to the companion/roast; this makes gotchi-closet **customer #1** of the Wisp MCP and shows it.

**Brand:** the engine/product is **Wisp** (a Soul MCP). gotchi-closet is "powered by Wisp." This plan makes that literally true and visible.

**Depends on:** Plan 001 (`server/mcp/tools.ts` exists with `buildChatContext`, `getPersona`, `getRoastSetup`). The badge links to `/mcp`, which Plan 004 builds — see "Badge link" note.

---

## Why this exists

Two goals, one plan:
1. **Dogfood (customer #1).** Today `server/routes/companion.ts` assembles persona + soul + lore + history inline, then calls the LLM (`server/routes/companion.ts:57-100`). Wisp's whole value prop is "the MCP provides context; the customer brings the model." So gotchi-closet should *consume the Wisp MCP for context* and then run its **own** `llmProvider` — making it the reference BYO-LLM customer and collapsing the context-assembly into one shared place (`server/mcp/tools.ts`) used by both the web app and external integrators.
2. **Show it.** A tasteful **"Powered by Wisp"** badge that links to the Wisp info/sell page (`/mcp`), turning the free app into the product's always-on showcase + funnel.

This is intentionally a *seam refactor*: same inputs, same outputs, same behavior (credits, premium-signature gate, content filter, rate limit, history, facts) — just sourced through the Wisp tools so there is a single source of truth.

---

## Scope

### In scope
- Refactor `server/routes/companion.ts` `/chat` so the **context assembly** (persona + soul snapshot + `assembleMessages`) comes from `server/mcp/tools.ts` `buildChatContext(...)` (imported in-process — no network hop), then the route calls its own `complete(systemPrompt, messages, tier)` exactly as today.
- Do the same for the roast/arena generation paths: source the battle setup from `getRoastSetup(...)` (`server/mcp/tools.ts`), keep the existing per-line `complete()` calls in `server/roast/engine.ts` / `server/arena/*`.
- Add `src/components/PoweredByWisp.tsx` and render it in the app footer (and optionally the companion panel header).

### Out of scope
- No behavior change: credits/premium gate (`companion.ts:79-90`), content filter, rate limit, history, fact extraction all stay identical.
- Do not change the MCP server's zero-LLM invariant — the web app does the LLM call, NOT the MCP tools.
- The `/mcp` page itself is Plan 004. This plan only adds the badge that links to it.

---

## Files

- **Modify:** `server/routes/companion.ts` (source context from `server/mcp/tools.ts`), `server/roast/engine.ts` and `server/arena/publicBattle.ts` (source setup from `getRoastSetup`), `src/components/layout/RootLayout.tsx` (render the badge).
- **Create:** `src/components/PoweredByWisp.tsx`.
- **Reuse:** `server/mcp/tools.ts` (Plan 001) — `buildChatContext(tokenId, message, wallet?)`, `getRoastSetup(a, b)`.

### Current-state excerpt to refactor (the seam)

```ts
// server/routes/companion.ts:57-75 — assembly that should move behind buildChatContext()
const state = await fetchGotchiState(tokenId);
const profile = buildPersonality(state);
const soul = soulDepthSnapshot(tokenId);
const systemPrompt = soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt;
const messages = assembleMessages({ facts: getFacts(wallet, tokenId), lore: retrieveLore(masked),
  history: getRecentMessages(wallet, tokenId, 20).map(m => ({ role: m.role, content: m.content })),
  userMessage: masked });
// then: complete(systemPrompt, messages, tier)   ← stays in the route (the web app is the BYO-LLM customer)
```

After the refactor, the route obtains `{ systemPrompt, messages }` from `buildChatContext(tokenId, masked, wallet)` and keeps the `complete(...)` call + the deflection branch + content screening unchanged.

---

## Steps

- [ ] **Step 1 — Verify the seam matches.** Open `server/mcp/tools.ts` (Plan 001) and confirm `buildChatContext(tokenId, message, wallet?)` returns exactly `{ systemPrompt, messages }` assembled the same way as `companion.ts:57-75` (same persona + soul snapshot concat, same `assembleMessages` inputs). If it diverges (e.g. omits facts/history when a wallet is present), STOP and reconcile 001 first — the web app must get identical context or replies will change.

- [ ] **Step 2 — Refactor `/chat`.** Replace the inline assembly (`companion.ts:57-75`) with a call to `buildChatContext(tokenId, masked, wallet)`; keep everything else byte-for-byte: the deflection branch, `eligiblePremium` gate, `complete(...)` premium/free fallback, `screenOutbound`, `appendMessage`, fact extraction. The only change is *where systemPrompt+messages come from*.

- [ ] **Step 3 — Refactor roast/arena setup.** In `server/roast/engine.ts` and `server/arena/publicBattle.ts`, source the archetype/voice/rules setup from `getRoastSetup(a, b)` instead of calling `archetypeFor`/`roastSystemPrompt` directly. Keep the existing per-line `complete()` generation + the deterministic judge. (If the shapes don't line up cleanly, this sub-step may be deferred — note it and proceed; the chat dogfood is the priority.)

- [ ] **Step 4 — Typecheck + tests.** Run: `npm run typecheck` (exit 0) and `npx vitest run server/companion server/roast server/soul` — all existing tests must still pass. Behavior is unchanged, so green tests are the proof.

- [ ] **Step 5 — Regression check the reply path.** Run the companion regression if present: `npm run mommy:regression`. Expected: pass (the refactor must not change replies).

- [ ] **Step 6 — Build the badge.** Create `src/components/PoweredByWisp.tsx`: a small, subtle pill — a wisp/ghost glyph + "Powered by Wisp" — linking to `/mcp` (internal route; opens the Wisp info/sell page from Plan 004). Match the app's existing component conventions (Tailwind, the muted footer styling). Keep it understated; the app stays "free for the community."

- [ ] **Step 7 — Render it.** Add `<PoweredByWisp />` to the app footer in `src/components/layout/RootLayout.tsx` (and optionally a tiny variant in the companion panel header). Run: `npm run build` (exit 0) and confirm the badge renders and links to `/mcp`.

---

## Done criteria (machine-checkable)

- `npm run typecheck` → exit 0; `npm run build` → exit 0.
- `npx vitest run server/companion server/roast server/soul` → all pass (unchanged behavior).
- `npm run mommy:regression` → pass (if the script exists).
- `grep -rn "buildChatContext" server/routes/companion.ts` → matches (the route now sources context from the Wisp tools).
- The companion `/chat` still returns the same `{ reply, tier }` shape; the premium credit burn still fires only on premium success.
- A "Powered by Wisp" badge renders in the footer and links to `/mcp`.

## Test plan

- Rely on the **existing** companion/roast/soul vitest suites as the regression guard — this is a refactor, so "tests still green" IS the test. If any companion test asserts on the inline assembly internals (unlikely), update it to assert on the same observable output via `buildChatContext`.
- Add `src/components/__tests__/PoweredByWisp.test.tsx` (or follow the repo's component test pattern if one exists) asserting the badge renders the text "Powered by Wisp" and an anchor to `/mcp`.

## Maintenance notes

- **Single source of truth.** After this, context assembly lives in `server/mcp/tools.ts` and is consumed by both the web app and external Wisp customers. Future persona/soul/lore changes go there once, and everyone gets them.
- **The web app is a BYO-LLM customer.** It brings Groq/OpenAI via `llmProvider`. The MCP tools must stay zero-LLM (Plan 001 invariant); the `complete()` call lives in the route, not the tools.
- **Badge link depends on Plan 004.** Until `/mcp` exists, the badge links to a route that 404s. Either land 004 first, or have the badge link to a temporary `/mcp` stub. Note which you chose.

## Escape hatches

- If `buildChatContext` (Plan 001) is not yet implemented, STOP — this plan depends on it. Do not re-inline a second copy of the assembly.
- If the roast/arena refactor (Step 3) risks changing battle output, defer it (note it) and ship the chat dogfood + badge only. Partial dogfood is fine; changed behavior is not.
- If any existing test changes its expected reply after Step 2, STOP and report — that means the MCP assembly is NOT identical to the inline one, which is a Plan 001 bug to fix, not something to paper over by editing the test's expectations.
