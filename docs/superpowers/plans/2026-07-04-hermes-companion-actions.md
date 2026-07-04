# Hermes for Aavegotchi — Companion Actions (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing Gotchi Companion a third faculty — **Act** — so an owner can command their gotchi in chat ("channel my gotchis") and the VPS executes it through Steward, paid in credits and remembered.

**North star — Hermes for Aavegotchi:** one agent, three faculties.
- **Speak** — chat in-character. *(shipped: `server/routes/companion.ts` `/chat`)*
- **Know** — persona from traits, soul depth, gotchi-kb lore, memory of your talks. *(shipped; kept fresh by Phase 4)*
- **Act** — *this plan.* Do real onchain upkeep on command, safely, and remember it.

**Architecture:** The chat LLM is upgraded from plain completion to **tool-calling**. When the model calls `run_upkeep(tokenId)`, the server executes it **VPS-side** via the *same* `runOne(enrollment, {force:true})` path the Steward cron uses (Base session key, allowlisted to pet/channel/claim, non-custodial — it literally cannot move funds). Execution is gated by four checks: (1) a fresh 24h **Hermes signature** proving the chat wallet, (2) on-chain **ownership** of the gotchi, (3) an **active Steward enrollment**, (4) a **credit** to burn. Every action burns one credit — the owner pays, the VPS just runs. Actions are logged to companion memory so Hermes remembers what it did for you.

**Tech Stack:** Express + better-sqlite3 (server), viem (`recoverMessageAddress`), OpenAI-compatible tool-calling (Groq free / OpenAI premium), React + wagmi (client). All new code reuses existing modules — no new infra.

**Scope note (from writing-plans scope check):** Your full ask spans several subsystems. This plan is **Phase 1 = Act (the command loop)** — the headline "command your gotchi." Phases 2–4 (read tools, proactive alerts, daily KB refresh) are outlined at the end and get their own plans. Phase 1 alone is shippable.

---

## File Structure

**New files**
- `src/lib/companion/actionAuth.ts` — shared (client signs / server verifies) message builder for the 24h Hermes action session. Pure module, no viem/DOM (mirrors `premiumAuth.ts`).
- `server/companion/tools.ts` — the OpenAI tool schema(s) + a pure dispatcher mapping a tool name → executor.
- `server/companion/actions.ts` — the `run_upkeep` executor: ownership + enrollment + credit checks, then `runOne`, then burn + log.

**Modified files**
- `server/companion/db.ts` — add `companion_actions` table + `logAction` / `getActions`.
- `server/companion/llmProvider.ts` — add `completeWithTools()` alongside `complete()`.
- `server/routes/companion.ts` — wire tool-calling into `/chat`; require action auth for execution.
- `src/lib/companion/api.ts` — pass optional `actionAuth` on `postChat`.
- `src/components/companion/CompanionChatPanel.tsx` — sign the Hermes session once/24h when an action needs it; render action results.

---

## Task 1: Action memory (remember what it did)

**Files:**
- Modify: `server/companion/db.ts` (add table in `getDb()` `db.exec`, add two functions)
- Test: `server/companion/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to server/companion/db.test.ts
import { logAction, getActions } from "./db";

test("logAction persists and getActions returns newest-last", () => {
  logAction("0xAbc", "123", "upkeep", "pet:1 channel:0 claim:0", "0xtx1");
  logAction("0xAbc", "123", "upkeep", "pet:0 channel:2 claim:0", "0xtx2");
  const acts = getActions("0xabc", "123", 10);
  expect(acts).toHaveLength(2);
  expect(acts[1].detail).toContain("channel:2");
  expect(acts[1].txHash).toBe("0xtx2");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run server/companion/db.test.ts -t "logAction"`
Expected: FAIL — `logAction is not a function`.

- [ ] **Step 3: Add the table + functions**

In `server/companion/db.ts`, inside the `db.exec(\`...\`)` block in `getDb()`, add:

```sql
    CREATE TABLE IF NOT EXISTS companion_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL, token_id TEXT NOT NULL,
      kind TEXT NOT NULL, detail TEXT NOT NULL,
      tx_hash TEXT, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_action_key ON companion_actions(wallet, token_id, id);
```

Then add at the end of the file:

```ts
export interface StoredAction { kind: string; detail: string; txHash: string | null; ts: number; }

export function logAction(wallet: string, tokenId: string, kind: string, detail: string, txHash: string | null) {
  getDb().prepare(
    `INSERT INTO companion_actions (wallet, token_id, kind, detail, tx_hash, ts) VALUES (?,?,?,?,?,?)`
  ).run(wallet.toLowerCase(), String(tokenId), kind, detail, txHash, Date.now());
}

export function getActions(wallet: string, tokenId: string, limit = 10): StoredAction[] {
  const rows = getDb().prepare(
    `SELECT kind, detail, tx_hash as txHash, ts FROM companion_actions
     WHERE wallet = ? AND token_id = ? ORDER BY id DESC LIMIT ?`
  ).all(wallet.toLowerCase(), String(tokenId), limit) as StoredAction[];
  return rows.reverse();
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run server/companion/db.test.ts -t "logAction"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/companion/db.ts server/companion/db.test.ts
git commit -m "feat(hermes): action memory table + logAction/getActions"
```

---

## Task 2: The Hermes action-session signature (owner proof)

**Files:**
- Create: `src/lib/companion/actionAuth.ts`
- Modify: `server/companion/auth.ts`
- Test: `src/lib/companion/actionAuth.test.ts`

Reuses the exact pattern of `src/lib/companion/premiumAuth.ts` (24h TTL, shared string). Server verification reuses `server/companion/auth.ts`'s `verifySigned`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companion/actionAuth.test.ts
import { actionMessage, ACTION_SIG_TTL_MS } from "./actionAuth";

test("actionMessage is deterministic and lower-cases wallet", () => {
  const m = actionMessage("0xAbC", 123);
  expect(m).toBe(actionMessage("0xabc", 123));
  expect(m).toContain("0xabc");
  expect(m).toContain("123");
});
test("TTL is 24h", () => { expect(ACTION_SIG_TTL_MS).toBe(24 * 60 * 60 * 1000); });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/companion/actionAuth.test.ts`
Expected: FAIL — cannot find module `./actionAuth`.

- [ ] **Step 3: Implement**

```ts
// src/lib/companion/actionAuth.ts
// Shared client(signs)/server(verifies). Proves the chat wallet controls its address
// so it can command VPS-side Steward actions and spend its own credits. Pure module.
export const ACTION_SIG_TTL_MS = 24 * 60 * 60 * 1000;

export function actionMessage(wallet: string, signedAt: number): string {
  return `GotchiCloset Hermes — authorize actions\nwallet: ${wallet.toLowerCase()}\nts: ${signedAt}`;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/companion/actionAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the server verifier**

In `server/companion/auth.ts`, add:

```ts
import { actionMessage } from "../../src/lib/companion/actionAuth";
// ...existing verifySigned...
export function actionSignatureValid(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  return verifySigned(actionMessage, wallet, signedAt, signature);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/companion/actionAuth.ts src/lib/companion/actionAuth.test.ts server/companion/auth.ts
git commit -m "feat(hermes): 24h action-session signature (client+server)"
```

---

## Task 3: LLM tool-calling (`completeWithTools`)

**Files:**
- Modify: `server/companion/llmProvider.ts`
- Test: `server/companion/llmProvider.test.ts`

Both Groq and OpenAI accept the OpenAI `tools`/`tool_calls` shape. Returns either text or a tool call.

- [ ] **Step 1: Write the failing test** (stub `fetch`)

```ts
// append to server/companion/llmProvider.test.ts
import { completeWithTools } from "./llmProvider";

test("completeWithTools returns a tool call when the model emits one", async () => {
  const origKey = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = "x";
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { tool_calls: [
      { id: "c1", type: "function", function: { name: "run_upkeep", arguments: '{"tokenId":"7"}' } },
    ] } }] }),
  })) as any;
  const out = await completeWithTools("sys", [{ role: "user", content: "channel my gotchi 7" }],
    [{ type: "function", function: { name: "run_upkeep", description: "d", parameters: { type: "object", properties: {} } } }], "free");
  globalThis.fetch = origFetch; process.env.GROQ_API_KEY = origKey;
  expect(out?.toolCall?.name).toBe("run_upkeep");
  expect(out?.toolCall?.args.tokenId).toBe("7");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run server/companion/llmProvider.test.ts -t "completeWithTools"`
Expected: FAIL — `completeWithTools is not a function`.

- [ ] **Step 3: Implement** (add below `complete()` in `llmProvider.ts`)

```ts
export interface ToolCall { id: string; name: string; args: Record<string, any>; }
export interface ToolTurn { text: string | null; toolCall: ToolCall | null; }

export async function completeWithTools(
  systemPrompt: string, messages: ChatMessage[], tools: any[], tier: Tier
): Promise<ToolTurn | null> {
  const cfg = cfgFor(tier);
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model, max_tokens: 450, temperature: 0.7, tools, tool_choice: "auto",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) return null;
    const msg: any = (await res.json())?.choices?.[0]?.message;
    const tc = msg?.tool_calls?.[0];
    if (tc?.function?.name) {
      let args: Record<string, any> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      return { text: null, toolCall: { id: tc.id, name: tc.function.name, args } };
    }
    const text = typeof msg?.content === "string" && msg.content.trim() ? msg.content.trim() : null;
    return { text, toolCall: null };
  } catch { return null; }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run server/companion/llmProvider.test.ts -t "completeWithTools"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/companion/llmProvider.ts server/companion/llmProvider.test.ts
git commit -m "feat(hermes): completeWithTools (OpenAI-style tool-calling)"
```

---

## Task 4: The `run_upkeep` executor + tool registry

**Files:**
- Create: `server/companion/tools.ts`, `server/companion/actions.ts`
- Test: `server/companion/actions.test.ts`

`actions.ts` reuses `listEnrollments` (`server/steward/db.ts`), `runOne` (`server/steward/cron.ts`), and `hasCredits`/`burnCredit`/`logAction` (`server/companion/db.ts`). Ownership is verified by the caller (Task 5) via `fetchGotchiState().owner`, so this executor takes an already-owner-verified wallet.

- [ ] **Step 1: Write the failing test** (inject deps so no chain/bundler needed)

```ts
// server/companion/actions.test.ts
import { runUpkeep } from "./actions";

test("runUpkeep: no active enrollment → not-enrolled, no credit burned", async () => {
  const deps = {
    listEnrollments: () => [],
    runOne: async () => ({ ran: true, txHash: "0x" }),
    hasCredits: () => true, burnCredit: () => true, logAction: () => {},
  };
  const r = await runUpkeep("0xabc", "7", deps as any);
  expect(r.ok).toBe(false); expect(r.reason).toBe("not-enrolled");
});

test("runUpkeep: enrolled + credits → runs, burns, logs", async () => {
  let burned = false, logged = false;
  const e = { id: 1, owner: "0xabc", gotchiId: 7, status: "active" };
  const deps = {
    listEnrollments: () => [e],
    runOne: async () => ({ ran: true, txHash: "0xtx", reason: undefined }),
    hasCredits: () => true, burnCredit: () => { burned = true; return true; },
    logAction: () => { logged = true; },
  };
  const r = await runUpkeep("0xabc", "7", deps as any);
  expect(r.ok).toBe(true); expect(r.txHash).toBe("0xtx");
  expect(burned).toBe(true); expect(logged).toBe(true);
});

test("runUpkeep: no credits → no-credits, does not run", async () => {
  let ran = false;
  const e = { id: 1, owner: "0xabc", gotchiId: 7, status: "active" };
  const deps = {
    listEnrollments: () => [e], runOne: async () => { ran = true; return { ran: true }; },
    hasCredits: () => false, burnCredit: () => true, logAction: () => {},
  };
  const r = await runUpkeep("0xabc", "7", deps as any);
  expect(r.ok).toBe(false); expect(r.reason).toBe("no-credits"); expect(ran).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run server/companion/actions.test.ts`
Expected: FAIL — cannot find module `./actions`.

- [ ] **Step 3: Implement `actions.ts`**

```ts
// server/companion/actions.ts
export interface ActionDeps {
  listEnrollments: (owner: string) => Array<{ id: number; owner: string; gotchiId: number; status: string }>;
  runOne: (e: any, nowSec: number, opts: { force?: boolean }) => Promise<{ ran: boolean; txHash?: string; reason?: string }>;
  hasCredits: (wallet: string) => boolean;
  burnCredit: (wallet: string) => boolean;
  logAction: (wallet: string, tokenId: string, kind: string, detail: string, txHash: string | null) => void;
}

export interface ActionResult {
  ok: boolean;
  reason?: "not-enrolled" | "no-credits" | "no-work" | "inactive";
  txHash?: string;
  detail?: string;
}

// Runs the gotchi's DUE Steward upkeep (pet/channel/claim per its enrollment) via the same
// VPS path the cron uses. Owner MUST already be verified as the on-chain owner by the caller.
export async function runUpkeep(wallet: string, tokenId: string, deps: ActionDeps): Promise<ActionResult> {
  const e = deps.listEnrollments(wallet).find((x) => x.gotchiId === Number(tokenId) && x.status === "active");
  if (!e) return { ok: false, reason: "not-enrolled" };
  if (!deps.hasCredits(wallet)) return { ok: false, reason: "no-credits" };
  const res = await deps.runOne(e, Math.floor(Date.now() / 1000), { force: true });
  if (!res.ran) return { ok: false, reason: (res.reason as any) ?? "no-work" };
  deps.burnCredit(wallet);
  const detail = `upkeep run for #${tokenId}`;
  deps.logAction(wallet, tokenId, "upkeep", detail, res.txHash ?? null);
  return { ok: true, txHash: res.txHash, detail };
}
```

- [ ] **Step 4: Implement `tools.ts`** (schema shown to the model)

```ts
// server/companion/tools.ts
export const HERMES_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_upkeep",
      description:
        "Perform the owner's gotchi's due on-chain upkeep now (pet / channel alchemica / claim), " +
        "using their enrolled Steward automation. Use when the owner asks you to channel, pet, or claim. " +
        "On-chain cooldowns still apply; nothing happens if nothing is due.",
      parameters: {
        type: "object",
        properties: { tokenId: { type: "string", description: "the gotchi token id to act on" } },
        required: ["tokenId"],
      },
    },
  },
];
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run server/companion/actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/companion/actions.ts server/companion/tools.ts server/companion/actions.test.ts
git commit -m "feat(hermes): run_upkeep executor + tool registry"
```

---

## Task 5: Wire Act into `/chat`

**Files:**
- Modify: `server/routes/companion.ts`
- Test: `tests/e2e/companion.spec.ts` (add an action-path assertion) — or a route unit test.

Flow: after building `systemPrompt` + `messages`, call `completeWithTools(...)`. If it returns a `toolCall` for `run_upkeep`: (1) require a valid action signature; if missing/expired → `{ needsActionAuth: true, reply }`, no execution. (2) verify `state.owner === wallet`. (3) execute `runUpkeep`. (4) reply in-character with the result.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/e2e/companion.spec.ts: a chat that triggers run_upkeep with NO action
// signature returns needsActionAuth and does NOT execute.
// POST /api/companion/chat { tokenId, wallet, message: "channel my gotchis" }
// expect(res.body.needsActionAuth).toBe(true)
```

- [ ] **Step 2: Run it, verify it fails** — route has no tool path yet, `needsActionAuth` undefined.

- [ ] **Step 3: Implement the wiring** in `server/routes/companion.ts`

Add imports:
```ts
import { completeWithTools } from "../companion/llmProvider";
import { HERMES_TOOLS } from "../companion/tools";
import { runUpkeep } from "../companion/actions";
import { getActions, logAction, hasCredits, burnCredit } from "../companion/db";
import { listEnrollments } from "../steward/db";
import { runOne } from "../steward/cron";
import { actionSignatureValid } from "../companion/auth";
```

Include recent actions in memory context (so Hermes remembers). Where `messages` is assembled, extend `facts`:
```ts
const actionLines = getActions(wallet, tokenId, 5)
  .map((a) => `You did: ${a.kind} for the owner${a.txHash ? ` (tx ${a.txHash.slice(0, 10)}…)` : ""}`);
// pass facts: [...getFacts(wallet, tokenId), ...actionLines] into assembleMessages
```

Replace the `complete(...)` free-tier call with a tool-aware turn:
```ts
const turn = await completeWithTools(systemPrompt, messages, HERMES_TOOLS, tier);

if (turn?.toolCall?.name === "run_upkeep") {
  const tokenIdArg = String(turn.toolCall.args.tokenId ?? tokenId);
  const sigOk = await actionSignatureValid(wallet, Number(body.actionSignedAt), String(body.actionSignature ?? ""));
  if (!sigOk) {
    const reply = screenOutbound("sign once to let me act on-chain for you, fren 👻");
    appendMessage(wallet, tokenId, "user", masked);
    appendMessage(wallet, tokenId, "assistant", reply);
    return res.json({ reply, needsActionAuth: true });
  }
  if (String(state.owner).toLowerCase() !== wallet) {
    return res.json({ reply: screenOutbound("that gotchi isn't in your wallet — i can only act for its owner 👻"), deflected: false });
  }
  const result = await runUpkeep(wallet, tokenIdArg, { listEnrollments, runOne, hasCredits, burnCredit, logAction });
  const summary = result.ok
    ? `done — ran your gotchi's upkeep${result.txHash ? ` (tx ${result.txHash.slice(0, 10)}…)` : ""}`
    : result.reason === "not-enrolled" ? "you haven't enrolled this gotchi in Steward yet — set that up and i can act for you"
    : result.reason === "no-credits" ? "you're out of credits — top up and i'll get right on it"
    : result.reason === "no-work" ? "nothing's due right now — cooldowns still ticking"
    : "couldn't run it just now";
  const reply = screenOutbound(summary);
  appendMessage(wallet, tokenId, "user", masked);
  appendMessage(wallet, tokenId, "assistant", reply);
  return res.json({ reply, action: result });
}

const reply = screenOutbound(turn?.text ?? templateReply({ profile, message: masked, deflected: false }));
```

(Premium path mirrors this; keep the existing credit/`burnCredit` premium gating for the OpenAI tier. Action credits are burned inside `runUpkeep`.)

- [ ] **Step 4: Run it, verify it passes** — no-signature action request returns `needsActionAuth: true`, no execution.

- [ ] **Step 5: Commit**

```bash
git add server/routes/companion.ts tests/e2e/companion.spec.ts
git commit -m "feat(hermes): wire run_upkeep into /chat with action-auth + ownership gate"
```

---

## Task 6: Client — sign once, act, show result

**Files:**
- Modify: `src/lib/companion/api.ts`, `src/components/companion/CompanionChatPanel.tsx`
- Test: manual (drive it in the running app per the `verify`/`run` skill)

- [ ] **Step 1: Extend `postChat`** in `src/lib/companion/api.ts` to accept + send `actionSignature`/`actionSignedAt`, and return `needsActionAuth` + `action` (mirror the existing premium `signature`/`signedAt` passing).

- [ ] **Step 2: Add `ensureActionAuth()`** in `CompanionChatPanel.tsx` — a copy of `ensurePremiumAuth()` using `actionMessage` / `ACTION_SIG_TTL_MS` from `@/lib/companion/actionAuth`, cached under `companion.actionSig.<wallet>`.

- [ ] **Step 3: In `send()`**, attach cached action auth if present. If the response has `needsActionAuth`, call `ensureActionAuth()` (one popup, cached 24h) and **re-send the same message** once with the fresh signature.

- [ ] **Step 4: Render** — when `res.action?.ok`, show the returned `reply`; optionally prefix action confirmations with ⚡.

- [ ] **Step 5: Manual verify** — with an enrolled gotchi + credits: type "channel my gotchis" → sign once → see the tx confirmation → ask "what did you do for me?" → Hermes recalls it (from `getActions`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/companion/api.ts src/components/companion/CompanionChatPanel.tsx
git commit -m "feat(hermes): client action-session sign + result rendering"
```

---

## Phases 2–4 (separate plans — outlined for cohesion)

**Phase 2 — Know deeper (read tools; the messenger informs).** Add read-only tools to `HERMES_TOOLS`, each burning a credit:
- `baazaar_deals(category?)` — new `server/companion/baazaar.ts` subgraph query for current listings; the LLM explains *why* a listing is a good/bad deal (floor vs ask, traits/BRS).
- `estate_status(tokenId?)` — reuse `upkeepFor(owner, {snapshotFor}, now)` (`server/steward/service.ts`) to report empty/idle parcels, unclaimed alchemica, un-channeled gotchis. Read-only (no signature).

**Phase 3 — Speak proactively (Hermes brings news).** VPS cron (mirror `server/steward/cron.ts`) checks `estate_status` per opted-in owner and writes a pending alert; Hermes opens the next chat with it ("parcel #12 is idle — want me to channel?"). Push channels (email/Telegram) later. **No auto-posting to your or anyone's social** (out of scope).

**Phase 4 — Keep Hermes' knowledge current (daily gotchi-kb refresh cron).** A VPS cron that runs the existing KB refresh so `retrieveLore()` answers about Aavegotchi stay fresh (new AGIPs, Base changes, DAO calls).
- **Mechanism:** daily `node tools/gotchi-kb/kb.mjs refresh` (append newer Discord messages + rebuild index), then a lightweight step to sync whatever source `src/lib/companion/knowledge.ts` reads.
- **Honest dependencies to resolve first:** the KB tool currently runs *locally* against `C:\tools\dce` with a Discord user token at `C:\tools\dce\token.txt` (per `CLAUDE.md`). To run on the VPS it needs (a) the dce data + a valid token present on the VPS, and (b) confirmation of whether `retrieveLore` reads the live dce index or a bundled/static lore set — if static, add a build step that regenerates that lore file from the refreshed index. Token expiry (401) must alert, not silently stall.
- Scheduling: reuse the app's cron pattern (`node-cron`, like `server/steward/cron.ts` / `server/megaphone/cron.ts`), gated behind an env flag (e.g. `HERMES_KB_REFRESH=1`) and a token-present check so it no-ops safely when unconfigured.

---

## Self-Review

- **Spec coverage:** command actions (Task 4/5 `run_upkeep`) ✅ · owner pays via credits (Task 4 burns) ✅ · VPS executes (Task 4 `runOne`) ✅ · remember what it did (Task 1 + Task 5 action context) ✅ · ask about Aavegotchi (shipped; fresh via Phase 4) ✅ · Baazaar deals + empty-parcel alerts → Phases 2/3 ✅ · daily KB pull → Phase 4 ✅.
- **Security:** actions require fresh 24h signature (Task 2) + on-chain ownership (Task 5) + active enrollment + credit (Task 4). Steward session key is allowlist-scoped to pet/channel/claim on-chain — cannot move funds. ✅
- **Placeholders:** none in Phase 1 — every code step is complete. Frontend Task 6 references the exact existing pattern (`ensurePremiumAuth`) to copy.
- **Type consistency:** `ToolTurn`/`ToolCall` (Task 3) consumed in Task 5; `ActionResult.reason` values match the Task 5 `summary` switch; `logAction`/`getActions` signatures match Task 1 ↔ Task 5.
