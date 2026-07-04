# Autonomous Hermes — Implementation Plan (+ Full Session Handoff)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement Part 2 task-by-task. **Read Part 1 (Handoff) first — it is the full context of the session that produced this plan.** Steps use checkbox (`- [ ]`) syntax.

**Goal:** Upgrade Hermes from a reactive *agentic assistant* to an *autonomous agent* — a multi-step tool loop, standing goal memory, and a VPS cron that pursues those goals hands-free via delegated signing (Steward AA), safely bounded to pet/channel/claim.

---

# PART 1 — SESSION HANDOFF (read first; full context)

## 1.1 What Hermes is
"Hermes" is the **GotchiCloset gotchi companion** — a chat agent tied to a user's Aavegotchi. It has a persona built from the gotchi's on-chain traits, persistent memory, a soul that accrues XP, Aavegotchi lore, and (as of this session) **agentic abilities**: it takes on-chain actions, navigates the app, and answers from live data. "Hermes" is a **brand/persona name only** — see 1.3.

Live at **gotchicloset.com**. The companion + steward routes run on the **VPS Express server** (NOT Vercel). The React UI is on Vercel.

## 1.2 What shipped THIS session (all on `main`, deployed)
Phase 1 (the agentic assistant) + a long tail of fixes, in order:
- **Action memory** — `companion_actions` table + `logAction`/`getActions`.
- **24h action-session signature** — `src/lib/companion/actionAuth.ts` + `actionSignatureValid` (server).
- **Tool-calling** — `completeWithTools` in `llmProvider.ts` (OpenAI-style `tools`).
- **`run_upkeep` executor** — `server/companion/actions.ts` (`runUpkeep`, VPS-side via Steward session key) + `server/companion/tools.ts` (`HERMES_TOOLS`, `HERMES_NAV_ROUTES`, `HERMES_ACTION_DIRECTIVE`).
- **Soul XP from actions** — actions become weight-2 memories in `server/routes/soul.ts` `buildSoulContext`.
- **`/chat` wiring** — tool loop + ownership gate.
- **Client** — `CompanionChatPanel.tsx`: sign-once, navigate, result render, proactive nudge.
- **Fixes (important — these are hard-won):**
  - **llama over-calls tools** on plain questions → only offer tools when the message matches an intent regex (`wantsTool`), else use plain `complete()`; and **fall back to `complete()`** whenever a tool turn yields no text. Without this, normal chat collapsed to the "spirits are quiet" template.
  - **llama emits tool calls as TEXT** — `<function=name>{json}</function>` in `content` instead of the `tool_calls` field. `completeWithTools` now parses that shape as a real tool call AND strips stray markup so users never see it.
  - **Model picked `navigate` over `run_upkeep`** for action requests → added a **deterministic short-circuit**: a clear "empty/collect/channel/claim/reservoir" message (and not a question) ALWAYS returns the prepare-sign directive, bypassing the model's tool choice.
  - **Persona "can-act" line** appended to the system prompt so it never says "I can't invoke actions" or tells the user to "set up Steward."
  - **Read tools** (answer from real data, injected into context when intent matches): `holdings.ts` (what I own), `baazaar.ts` (cheapest listings + best BRS/GHST), `dao.ts` (live Snapshot aavegotchi.eth proposals), `estate.ts` (what upkeep is due).
  - **Engagement soul XP** — message count feeds `xp` in `buildSoulContext` (capped).
  - **Dropped dead `/steward` nav** and made **`/baazaar` open the marketplace tab** (`ExplorerPage.tsx` reads `scope=baazaar` / the `/baazaar` path).
  - **`prepare + sign`** — the key action model (see 1.4).

## 1.3 The LLM (critical fact)
The brain is **Groq `llama-3.3-70b-versatile`** (free tier) / **OpenAI `gpt-4o-mini`** (premium) — **cloud APIs, NOT self-hosted, NOT on the VPS.** `cfgFor(tier)` in `llmProvider.ts`. The VPS calls out to Groq; `GROQ_API_KEY`/`OPENAI_API_KEY` are synced by the deploy workflow. We considered a self-hosted open model (actual "Hermes") but the VPS has **no GPU**, so it stayed on Groq.

## 1.4 The action model: "prepare + sign" (why, and how it differs from Steward AA)
**Steward AA automation is currently OFF in prod** (`VITE_STEWARD_AUTOMATION` unset, no bundler running). So `runUpkeep` (the VPS executor) returns `not-enrolled` for everyone, and the `/steward` page isn't live. To make actions work **today**, `run_upkeep` in chat uses **prepare + sign**:
- Server returns `{ prepareUpkeep: true, navigate: "/lending/lands" }`.
- Client (`CompanionChatPanel.runPrepareUpkeep`) fetches `GET /api/steward/upkeep?owner=…` → `{ summary:{pet,channel,claim}, calls:[{to,data}] }` (this endpoint needs **no enrollment**), and the user's **own wallet** sends each call. If `calls` is empty → "nothing ready to collect (cooldown)".
- **The `runUpkeep` VPS executor + action-signature infra exist but are UNUSED by chat** — they are the *delegated-signing* path this plan (Part 2) turns on.

## 1.5 Current agentic classification
**Agentic assistant** — reactive (acts on your message), single-step tool use, human signs each action. Part 2 pushes it to **autonomous agent** (multi-step loop + cron acting on its own via delegated signing). The user explicitly chose **"go fully autonomous"** — but capped to pet/channel/claim only.

## 1.6 Architecture / file map (current)
- `server/routes/companion.ts` — `/chat` (deterministic collect short-circuit → prepare-sign; `wantsTool` gate; read-tool injection for holdings/deals/dao/estate; `completeWithTools`; `run_upkeep`→prepareUpkeep+navigate; `navigate`; fallback to `complete()`), `/premium/*`, `/history`.
- `server/companion/` — `db.ts` (SQLite: `companion_messages`, `companion_facts`, `companion_entitlements`(credits), `companion_actions`; **add `companion_goals` here**), `llmProvider.ts`, `tools.ts`, `actions.ts` (`runUpkeep`), `auth.ts`, `holdings.ts`, `baazaar.ts`, `dao.ts`, `estate.ts`, `gotchiState.ts`, `knowledge.ts` (static lore), `pricing.ts`.
- `server/steward/` — `service.ts` (`upkeepFor`), `chain.ts` (`snapshotFor`), `cron.ts` (`runOne`, node-cron pattern), `db.ts` (`listEnrollments`, `Enrollment`), `runner.ts`, `encode.ts`, `aa.ts` (AA submit via bundler).
- `server/soul/` — `soulDoc.ts`, `soulStore.ts`, `depth.ts`, `snapshot.ts` (`soulDepthSnapshot`), `seal.ts`.
- `src/lib/companion/` — `api.ts` (`postChat`, `ChatResponse{reply,navigate,prepareUpkeep,needsActionAuth,action}`), `actionAuth.ts`, `premiumAuth.ts`, `personality.ts`, `chatPrompt.ts`, `contentFilter.ts`, `templates.ts`.
- `src/components/companion/CompanionChatPanel.tsx` — chat UI, `runPrepareUpkeep` (wallet sends upkeep calls), navigate, proactive nudge (`stewardApi.upkeep` on open, throttled 30m).
- `src/pages/` — `ExplorerPage.tsx` (baazaar mode), `LandManagementPage.tsx` (per-parcel `actions.claim`).

## 1.7 Deploy & ops (how "shipped" works)
- **Push to `main`** → **Vercel** builds the frontend AND the **VPS auto-deploys** via `.github/workflows/deploy-autorenew.yml`: self-hosted runner `[self-hosted, gotchicloset-vps]`, `git reset --hard origin/main`, sync secrets into `.env`, `docker compose -p gotchicloset -f deploy/docker-compose.yml up -d --build`, health check `http://127.0.0.1:8791/api/lending/autorenew/health`.
- **Secrets** synced there include `GROQ_API_KEY`, `OPENAI_API_KEY`, `SOUL_*`, `STEWARD_PET_RELAYER_KEY`, `STEWARD_BUNDLER_EXECUTOR_KEY`, `POSTIZ_*`. **Add new flags (`HERMES_AUTONOMOUS`, `VITE_STEWARD_AUTOMATION`) to this file** to activate them in prod.
- VPS = Hostinger, **SSH refused** — ops via hPanel terminal or the GitHub Actions runner. No GPU.
- **GateGuard hook** forces a fact-block before edits/bash in this environment (present importers/duplicates/data-shape/instruction, then retry). Expect it.

## 1.8 Known gotchas (do not relearn the hard way)
- Groq llama **over-calls tools** and **text-emits tool calls** — both handled; keep those guards.
- The model **won't reliably pick the action tool** — keep the deterministic collect short-circuit.
- **Steward AA is OFF in prod** — `runUpkeep`/enrollment/`/steward` are dormant until Part 2 Task 6 (ops).
- `run_upkeep`'s `claim` calls ARE the **land-alchemica (reservoir) claims**; "empty reservoirs" == prepare-sign upkeep.
- Don't reintroduce `/steward` to `HERMES_NAV_ROUTES` (page not live).
- No `Date.now()`/`Math.random()` bans apply to **workflow scripts only**; normal server runtime code may use them.

---

# PART 2 — THE BUILD

**Architecture:** (1) A **goal store** holds standing objectives per wallet+gotchi. (2) A **multi-step loop** lets the chat agent chain tool calls (check → act → observe → report) in one turn. (3) An **autonomous cron** reads active goals and, for wallets that enrolled a Steward session key, executes due upkeep via `runUpkeep` (delegated signing — capped, non-custodial), logging each action. (4) **Delegated-signing go-live** is an ops checklist (bundler + enroll + flags), not code — the cron is a no-op until it's done.

**Tech Stack:** Express + better-sqlite3, viem, Groq/OpenAI tool-calling, node-cron, React + wagmi. Reuses shipped modules listed in 1.6.

**Safety invariant (must hold in EVERY task):** the autonomous path may ONLY call the Steward session key, on-chain-scoped to `pet`/`channel`/`claim`. It can never transfer/approve/move funds. Anything that widens this is a bug.

---

## Task 1: Goal store

**Files:** Modify `server/companion/db.ts`; Test `server/companion/db.test.ts`

- [ ] **Step 1: failing test**

```ts
// append to server/companion/db.test.ts
import { setGoal, getGoals, getActiveGoals } from "./db";
describe("goals", () => {
  it("setGoal upserts; getGoals reflects enabled", () => {
    setGoal("0xAbc", "7", "keep_emptied", true);
    setGoal("0xAbc", "7", "keep_emptied", true);
    const gs = getGoals("0xabc");
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({ tokenId: "7", goal: "keep_emptied", enabled: true });
  });
  it("getActiveGoals returns only enabled", () => {
    setGoal("0xAAA", "1", "keep_emptied", true);
    setGoal("0xBBB", "2", "keep_emptied", false);
    const a = getActiveGoals();
    expect(a.some((g) => g.wallet === "0xaaa")).toBe(true);
    expect(a.some((g) => g.wallet === "0xbbb")).toBe(false);
  });
});
```

- [ ] **Step 2: run, verify FAIL** — `npx vitest run server/companion/db.test.ts -t "goals"`
- [ ] **Step 3: implement** — add to the `db.exec(...)` block in `getDb()`:

```sql
    CREATE TABLE IF NOT EXISTS companion_goals (
      wallet TEXT NOT NULL, token_id TEXT NOT NULL, goal TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, token_id, goal)
    );
```

and at end of file:

```ts
export interface Goal { wallet: string; tokenId: string; goal: string; enabled: boolean; }
export function setGoal(wallet: string, tokenId: string, goal: string, enabled: boolean) {
  getDb().prepare(
    `INSERT INTO companion_goals (wallet, token_id, goal, enabled, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(wallet, token_id, goal) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(wallet.toLowerCase(), String(tokenId), goal, enabled ? 1 : 0, Date.now());
}
export function getGoals(wallet: string): Goal[] {
  return (getDb().prepare(`SELECT wallet, token_id as tokenId, goal, enabled FROM companion_goals WHERE wallet = ?`)
    .all(wallet.toLowerCase()) as any[]).map((r) => ({ ...r, enabled: !!r.enabled }));
}
export function getActiveGoals(): Goal[] {
  return (getDb().prepare(`SELECT wallet, token_id as tokenId, goal, enabled FROM companion_goals WHERE enabled = 1`)
    .all() as any[]).map((r) => ({ ...r, enabled: true }));
}
```

- [ ] **Step 4: run, verify PASS. Step 5: commit** `feat(hermes): goal store`

---

## Task 2: Goals API (signed set + list)

**Files:** Modify `server/routes/companion.ts`, `src/lib/companion/api.ts`, `CompanionChatPanel.tsx`

Auth: reuse the 24h action signature (`actionSignatureValid`) — a goal authorizes autonomous gas spend, so it must be owner-signed. NOTE: `actionSignatureValid` import was removed from `companion.ts` when chat switched to prepare-sign — **re-add it**.

- [ ] **Step 1:** failing test — `POST /companion/goals` without a valid action signature → 401.
- [ ] **Step 2:** run, verify FAIL.
- [ ] **Step 3:** implement in `server/routes/companion.ts`:

```ts
import { setGoal, getGoals } from "../companion/db";
import { actionSignatureValid } from "../companion/auth";

router.get("/goals/:wallet", (req, res) => {
  const wallet = String(req.params.wallet);
  if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet (0x) required" });
  res.json({ goals: getGoals(wallet) });
});
router.post("/goals", async (req, res) => {
  const b = req.body ?? {};
  const wallet = String(b.wallet ?? "").toLowerCase();
  const tokenId = String(b.tokenId ?? "");
  const goal = String(b.goal ?? "");
  if (!wallet.startsWith("0x") || !tokenId || !goal) return res.status(400).json({ error: "wallet, tokenId, goal required" });
  if (!(await actionSignatureValid(wallet, Number(b.actionSignedAt), String(b.actionSignature ?? "")))) {
    return res.status(401).json({ error: "owner signature required" });
  }
  setGoal(wallet, tokenId, goal, b.enabled !== false);
  res.json({ ok: true, goals: getGoals(wallet) });
});
```

- [ ] **Step 4:** client — add `getGoals`/`setGoal` to `src/lib/companion/api.ts` (mirror `postChat`, pass `actionSignature`/`actionSignedAt` via `ensureActionAuth`); add an "Auto-collect: on/off" toggle to `CompanionChatPanel.tsx`.
- [ ] **Step 5:** run tests, verify PASS. Commit `feat(hermes): goals API + auto-collect toggle`.

---

## Task 3: Multi-step tool loop

**Files:** Create `server/companion/agentLoop.ts`; Test `server/companion/agentLoop.test.ts`

- [ ] **Step 1: failing test**

```ts
import { runAgentLoop } from "./agentLoop";
test("runs a tool then answers, feeding the result back", async () => {
  const calls: string[] = []; let t = 0;
  const llm = async (_s: string, msgs: any[]) => {
    t++;
    if (t === 1) return { text: null, toolCall: { id: "1", name: "get_estate", args: {} } };
    expect(JSON.stringify(msgs)).toContain("2 reservoirs ready");
    return { text: "You've got 2 reservoirs ready — collect?", toolCall: null };
  };
  const dispatch = async (n: string) => { calls.push(n); return "2 reservoirs ready"; };
  const out = await runAgentLoop("sys", [{ role: "user", content: "what's ready?" }], [], llm as any, dispatch, 4);
  expect(calls).toEqual(["get_estate"]);
  expect(out).toContain("2 reservoirs ready");
});
test("bounded — never infinite-loops", async () => {
  const llm = async () => ({ text: null, toolCall: { id: "x", name: "loop", args: {} } });
  const out = await runAgentLoop("sys", [{ role: "user", content: "hi" }], [], llm as any, async () => "again", 2);
  expect(typeof out).toBe("string");
});
```

- [ ] **Step 2:** run, verify FAIL. **Step 3:** implement `agentLoop.ts`:

```ts
import type { ChatMessage } from "../../src/lib/companion/types";
import type { ToolTurn } from "./llmProvider";
type Llm = (s: string, m: ChatMessage[], tools: any[], tier: any) => Promise<ToolTurn | null>;
type Dispatch = (name: string, args: Record<string, any>) => Promise<string>;

// Bounded tool loop. Tool results are appended as user turns tagged [tool:<name>] so the model
// sees them on the next pass. Returns the final text (never throws, never runs away).
export async function runAgentLoop(
  systemPrompt: string, messages: ChatMessage[], tools: any[], llm: Llm, dispatch: Dispatch, maxSteps = 4, tier: any = "free"
): Promise<string> {
  const convo: ChatMessage[] = [...messages];
  let last = "";
  for (let step = 0; step < maxSteps; step++) {
    const turn = await llm(systemPrompt, convo, tools, tier);
    if (!turn) break;
    if (turn.toolCall) {
      let result = "(tool failed)";
      try { result = await dispatch(turn.toolCall.name, turn.toolCall.args); } catch { /* keep fallback */ }
      convo.push({ role: "user", content: `[tool:${turn.toolCall.name}] ${result}` });
      continue;
    }
    if (turn.text) { last = turn.text; break; }
    break;
  }
  return last || "…";
}
```

- [ ] **Step 4:** run, verify PASS. Commit `feat(hermes): bounded multi-step tool loop`.
- [ ] **Step 5 (wire — separate commit):** in `/chat`, replace the single `completeWithTools` call with `runAgentLoop`, `dispatch` mapping read-tool names (`get_holdings`/`get_deals`/`get_dao`/`get_estate`) → the existing fetchers' strings. Keep the deterministic `wantsCollect` short-circuit and the `run_upkeep`/`navigate` **terminal** directives (they end the turn — have `dispatch` throw a sentinel the route catches, or detect them before the loop). Verify in the running app (superpowers `verify` skill).

---

## Task 4: Autonomous cron (delegated-signing actor)

**Files:** Create `server/companion/autonomousCron.ts`; Test `server/companion/autonomousCron.test.ts`; Modify `server/app.ts`

- [ ] **Step 1: failing test**

```ts
import { runAutonomousPass } from "./autonomousCron";
test("acts only for enrolled wallets with an active goal", async () => {
  const acted: string[] = [];
  const deps = {
    getActiveGoals: () => [{ wallet: "0xaaa", tokenId: "1", goal: "keep_emptied" }, { wallet: "0xbbb", tokenId: "2", goal: "keep_emptied" }],
    isEnrolled: (w: string) => w === "0xaaa",
    runUpkeep: async (w: string) => { acted.push(w); return { ok: true, txHash: "0xtx" }; },
    log: () => {},
  };
  const s = await runAutonomousPass(deps as any);
  expect(acted).toEqual(["0xaaa"]); expect(s.acted).toBe(1);
});
test("no-op with zero enrollments (dormant until Steward AA live)", async () => {
  const s = await runAutonomousPass({ getActiveGoals: () => [{ wallet: "0xaaa", tokenId: "1", goal: "keep_emptied" }],
    isEnrolled: () => false, runUpkeep: async () => ({ ok: true }), log: () => {} } as any);
  expect(s.acted).toBe(0);
});
```

- [ ] **Step 2:** run, verify FAIL. **Step 3:** implement `autonomousCron.ts`:

```ts
export interface AutoDeps {
  getActiveGoals: () => Array<{ wallet: string; tokenId: string; goal: string }>;
  isEnrolled: (wallet: string) => boolean;
  runUpkeep: (wallet: string, tokenId: string) => Promise<{ ok: boolean; reason?: string; txHash?: string }>;
  log: (wallet: string, tokenId: string, kind: string, detail: string, txHash: string | null) => void;
}
// One pass: for each active goal whose wallet GRANTED a Steward session key, run due upkeep
// hands-free. Skips everyone else — zero enrollments ⇒ no-op. SAFETY: runUpkeep is pet/channel/claim only.
export async function runAutonomousPass(deps: AutoDeps): Promise<{ acted: number; skipped: number }> {
  let acted = 0, skipped = 0;
  for (const g of deps.getActiveGoals()) {
    if (!deps.isEnrolled(g.wallet)) { skipped++; continue; }
    try {
      const r = await deps.runUpkeep(g.wallet, g.tokenId);
      if (r.ok) { acted++; deps.log(g.wallet, g.tokenId, "auto-upkeep", `autonomous ${g.goal}`, r.txHash ?? null); }
      else skipped++;
    } catch { skipped++; }
  }
  return { acted, skipped };
}
```

- [ ] **Step 4 (live wiring):** add `startHermesAutonomousCron()` (mirror `server/steward/cron.ts` node-cron, ~30 min), gated on `process.env.HERMES_AUTONOMOUS === "1"`; deps: `getActiveGoals` from db; `isEnrolled(w)` = `listEnrollments(w).some(e => e.status === "active")`; `runUpkeep(w, id)` = `server/companion/actions.ts` `runUpkeep` with live deps `{listEnrollments, runOne, hasCredits, burnCredit, logAction}`. Call from `server/app.ts` at boot. Add `HERMES_AUTONOMOUS` to `.github/workflows/deploy-autorenew.yml` secret sync (default off).
- [ ] **Step 5:** run tests, verify PASS. Commit `feat(hermes): autonomous cron (dormant until enrolled)`.

---

## Task 5: "While you were away…" report

**Files:** Modify `src/components/companion/CompanionChatPanel.tsx`

- [ ] Extend the proactive nudge: also fetch recent actions (add `GET /companion/actions/:wallet/:tokenId` returning `getActions`, or reuse existing); if the latest are `auto-upkeep`, greet "while you were away I emptied N reservoirs for you 👻". Manual verify. Commit `feat(hermes): report autonomous actions on open`.

---

## Task 6 (OPS — no code): bring delegated signing live

The gate. Until done, Task 4's cron is a safe no-op. On the VPS (per the `steward-aa-phase1-state` memory + `deploy/` notes):
1. **Bundler:** bring up the Alto bundler (`deploy/docker-compose.yml`) with `STEWARD_BUNDLER_EXECUTOR_KEY` funded with a small Base ETH float.
2. **Flags:** set `VITE_STEWARD_AUTOMATION=1` and `HERMES_AUTONOMOUS=1` via GitHub secrets → the deploy workflow sync.
3. **Enroll:** each owner enrolls once — one wallet signature granting the session key scoped to pet/channel/claim (existing Steward enroll flow). No enrollment ⇒ no autonomy for that wallet.
4. **Verify:** one autonomous pass acts on a test wallet; `getActions` shows `auto-upkeep`; confirm the session key CANNOT call any non-allowlisted selector (safety invariant).

---

## Self-Review
- **Coverage:** multi-step loop (T3) ✅ · autonomous cron (T4) ✅ · delegated signing (T4 executor + T6 go-live) ✅ · goal memory (T1/T2) ✅ · report-back (T5) ✅.
- **Safety invariant:** the only actuator is `runUpkeep` → Steward session key (pet/channel/claim). No task adds a funds-moving path; cron is dormant with zero enrollments (T4 tests assert it).
- **Placeholders:** none — code steps are complete; T3.5 and T5 name exact existing functions to wire.
- **Types:** `Goal` (T1) used by T2/T4; `AutoDeps` matches T4 live wiring; `runAgentLoop` matches its test.
- **Auth:** goal-setting requires the 24h action signature (T2); enrollment (T6) is a separate on-chain owner signature granting the capped key.
