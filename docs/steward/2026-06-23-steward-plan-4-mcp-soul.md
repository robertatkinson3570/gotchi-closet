# Steward — Plan 4: MCP Dogfood + Soul-XP Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Depends on Plans 1-3.

**Goal:** Make Steward a first-class Base agent surface (expose its actions as MCP tools, same dogfood pattern as the Wisp plan 003) and unify soul XP so the Steward dashboard shows the *exact same* number as the companion chat.

**Architecture:** `service.ts` exposes a per-owner work preview that reuses the Plan-1 due-work engine behind injected deps (unit-tested). `server/mcp/` gains four steward tools (`steward_status`, `steward_log`, `steward_preview`, `steward_run_now`) registered the same way existing tools are. `soulStats.ts` becomes the single source of soul level/xp/memories, consumed by both the companion chat and the Steward dashboard via one route + hook.

**Tech Stack:** @modelcontextprotocol/sdk (already a dep), the Plan 1-3 modules, the existing companion/soul engine (`server/soul/*`, `src/lib/soul/quickDepth.ts`).

**Why:** ties Steward into Base's agentic economy (an external agent can read/trigger an estate steward) and makes the soul feel like one creature across chat + work (per the spec's "Why now" + the soul-deepens-from-work thesis).

---

## File Structure

- `server/steward/service.ts` (create) — `previewOwner(owner, deps)` per-enrollment work preview (pure-ish).
- `server/steward/service.test.ts` (create).
- `server/mcp/tools.ts` (modify) — register the four steward tools next to the existing tools.
- `server/mcp/smoke.test.ts` (modify) — assert the steward tools are listed + return shape.
- `server/steward/soulStats.ts` (create) — single source for `{ level, xpPct, memories }` per gotchi.
- `server/routes/steward.ts` (modify) — add `GET /soul?owner&gotchiId`.
- `src/hooks/useSteward.ts` (modify) — add `useSoulStats`.
- `src/components/steward/ManageView.tsx` + `src/pages/StewardPage.tsx` (modify) — feed real soul stats.

---

## Task 1: Per-owner work preview service

**Files:**
- Create: `server/steward/service.ts`, `server/steward/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { previewOwner } from "./service";
import { getStewardDb, closeStewardDb, enroll, setStatus } from "./db";

const NOW = 1_000_000_000;
beforeEach(() => { process.env.STEWARD_DB_PATH = ":memory:"; getStewardDb(); });
afterEach(() => { closeStewardDb(); });

describe("previewOwner", () => {
  it("returns a work plan per active enrollment without submitting anything", async () => {
    enroll({ owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    const snapshotFor = vi.fn(async () => ({ gotchis: [{ id: 7, lastInteracted: 0, lastChanneled: 0 }], parcels: [] }));
    const out = await previewOwner("0x1", { snapshotFor }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].gotchiId).toBe(7);
    expect(out[0].plan.pet).toEqual([7]); // pet due
    expect(snapshotFor).toHaveBeenCalledWith("0x1");
  });

  it("skips paused enrollments", async () => {
    const e = enroll({ owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    setStatus(e.id, "paused");
    const out = await previewOwner("0x1", { snapshotFor: vi.fn(async () => ({ gotchis: [], parcels: [] })) }, NOW);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/service.test.ts`
Expected: FAIL — `Cannot find module './service'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/service.ts
// Read-only preview of what each active steward WOULD do right now (no submission).
// Reuses the Plan-1 due-work engine; snapshot reads are injected so it's unit-tested.
import { listEnrollments } from "./db";
import { computeWork, type ChainSnapshot, type WorkPlan } from "./dueWork";

export interface PreviewDeps { snapshotFor: (owner: string) => Promise<ChainSnapshot>; }
export interface EnrollmentPreview { id: number; gotchiId: number; chores: any; plan: WorkPlan; }

export async function previewOwner(owner: string, deps: PreviewDeps, now: number): Promise<EnrollmentPreview[]> {
  const active = listEnrollments(owner).filter((e) => e.status === "active");
  if (!active.length) return [];
  const snap = await deps.snapshotFor(owner);
  return active.map((e) => ({ id: e.id, gotchiId: e.gotchiId, chores: e.chores, plan: computeWork(e.chores, snap, now) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/service.ts server/steward/service.test.ts
git commit -m "feat(steward): per-owner work preview service"
```

---

## Task 2: Steward MCP tools (dogfood)

**Files:**
- Modify: `server/mcp/tools.ts`, `server/mcp/smoke.test.ts`

Follow the existing tool-registration pattern in `server/mcp/tools.ts` (read it first to match the exact `server.tool(name, schema, handler)` shape and how the MCP server is assembled).

- [ ] **Step 1: Add the four steward tools**

```ts
// server/mcp/tools.ts  (add alongside the existing tool registrations)
import { z } from "zod";
import { listEnrollments, getLog } from "../steward/db";
import { previewOwner } from "../steward/service";
import { snapshotFor } from "../steward/chain";
import { runAllDue } from "../steward/cron";

// Inside the function that registers tools on the MCP `server`:
server.tool(
  "steward_status",
  { owner: z.string().describe("wallet address") },
  async ({ owner }) => ({ content: [{ type: "text", text: JSON.stringify(listEnrollments(owner)) }] })
);

server.tool(
  "steward_log",
  { owner: z.string() },
  async ({ owner }) => ({ content: [{ type: "text", text: JSON.stringify(getLog(owner)) }] })
);

server.tool(
  "steward_preview",
  { owner: z.string().describe("preview what each active steward would do now, no tx") },
  async ({ owner }) => {
    const now = Math.floor(Date.now() / 1000);
    const out = await previewOwner(owner, { snapshotFor }, now);
    return { content: [{ type: "text", text: JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) }] };
  }
);

server.tool(
  "steward_run_now",
  { owner: z.string().describe("force a run cycle for this owner's due stewards") },
  async ({ owner }) => {
    await runAllDue(); // runEnrollment still enforces per-enrollment intervals + simulate-before-submit
    return { content: [{ type: "text", text: JSON.stringify(getLog(owner).slice(0, 5)) }] };
  }
);
```

- [ ] **Step 2: Extend the MCP smoke test**

```ts
// server/mcp/smoke.test.ts  (add)
it("lists the steward tools", async () => {
  const tools = await listToolsSomehow(); // use the same listing helper the existing smoke test uses
  const names = tools.map((t: any) => t.name);
  expect(names).toEqual(expect.arrayContaining(["steward_status", "steward_log", "steward_preview", "steward_run_now"]));
});
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run server/mcp/smoke.test.ts`
Expected: PASS (existing tests + the new steward-tools assertion).
```bash
git add server/mcp/tools.ts server/mcp/smoke.test.ts
git commit -m "feat(steward): expose steward actions as MCP tools (dogfood)"
```

---

## Task 3: Single-source soul stats (chat == dashboard)

**Files:**
- Create: `server/steward/soulStats.ts`
- Modify: `server/routes/steward.ts`, `src/hooks/useSteward.ts`, `src/components/steward/ManageView.tsx`, `src/pages/StewardPage.tsx`

First read the companion/soul engine (`server/soul/depth.ts`, `src/lib/soul/quickDepth.ts`, and wherever the chat reads soul depth/XP) and identify the function that produces the soul level/XP/memory count the chat shows. `soulStats.ts` must call THAT function so both surfaces share one number.

- [ ] **Step 1: Implement the single-source accessor**

```ts
// server/steward/soulStats.ts
// SINGLE SOURCE of soul level/xp/memories for a gotchi. Both the companion chat and the
// Steward dashboard must read through here so the number is identical on both surfaces.
// Wire `computeSoulDepth` to the existing engine function the chat already uses
// (server/soul/depth.ts). Do not duplicate the depth math — import it.
import { computeSoulDepth } from "../soul/depth"; // confirm the exact exported name/shape

export interface SoulStats { level: number; xpPct: number; memories: number; }

export function soulStatsFor(owner: string, gotchiId: number): SoulStats {
  const depth = computeSoulDepth(owner, String(gotchiId)); // adapt args to the real signature
  // Map the engine's depth output onto the UI shape. Keep this mapping the ONLY place it lives.
  return {
    level: depth.level,
    xpPct: Math.max(0, Math.min(100, Math.round(depth.progressToNext * 100))),
    memories: depth.memoryCount,
  };
}
```

> If `computeSoulDepth`'s real shape differs, adapt the three field reads here only; the contract `SoulStats` stays fixed so the UI never changes.

- [ ] **Step 2: Add the route**

```ts
// server/routes/steward.ts  (add)
import { soulStatsFor } from "../steward/soulStats";

stewardRouter.get("/soul", (req, res) => {
  const owner = String(req.query.owner || "");
  const gotchiId = Number(req.query.gotchiId);
  if (!owner || !Number.isFinite(gotchiId)) return res.status(400).json({ error: "owner + gotchiId required" });
  res.json(soulStatsFor(owner, gotchiId));
});
```

- [ ] **Step 3: Add the hook**

```ts
// src/hooks/useSteward.ts  (add)
export function useSoulStats(owner?: string, gotchiId?: number) {
  return useQuery({
    queryKey: ["steward", "soul", owner, gotchiId],
    queryFn: async () => {
      const r = await fetch(`/api/steward/soul?owner=${owner}&gotchiId=${gotchiId}`);
      if (!r.ok) throw new Error("soul stats failed");
      return r.json() as Promise<{ level: number; xpPct: number; memories: number }>;
    },
    enabled: !!owner && gotchiId !== undefined,
  });
}
```

- [ ] **Step 4: Feed real soul stats into the UI**

In `ManageView.tsx`, replace the `soul` prop wiring with the hook:
```tsx
import { useSoulStats } from "@/hooks/useSteward";
// inside ManageView, after props:
const { data: soul } = useSoulStats(owner, gotchi.id);
```
In `StewardPage.tsx`, set each on-duty card's `soulXpPct` from the same source. Confirm the value on a gotchi's Steward dashboard equals the value shown in that gotchi's companion chat for the same wallet.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck` (exit 0). Manually open a gotchi's companion chat and its Steward dashboard side by side; the soul level/XP must match exactly.
```bash
git add server/steward/soulStats.ts server/routes/steward.ts src/hooks/useSteward.ts src/components/steward/ManageView.tsx src/pages/StewardPage.tsx
git commit -m "feat(steward): single-source soul stats shared with companion chat"
```

---

## Task 4: Optional — work feeds soul memory (phase-2 toggle)

> Spec open-decision #4. Only do this if the soul-as-memory loop is wanted now. Otherwise skip and leave the Steward's log purely informational.

**Files:** Modify the runner's logging path to also append a soul memory when a run does real work.

- [ ] **Step 1: After a successful submit in `runEnrollment` (Plan 2), emit a memory**

In `server/steward/cron.ts`'s `deps()`, wrap `log` so that a `run` action also records a soul memory via the companion/soul memory writer (the same one chat uses), e.g. "Emptied 4 reservoirs (+820 FUD)". Keep the memory text derived from the WorkPlan totals. Verify the gotchi's soul depth/XP increases after runs and the memory shows in chat.

- [ ] **Step 2: Commit**

```bash
git add server/steward/cron.ts
git commit -m "feat(steward): work runs deepen the gotchi's soul (memory feed)"
```

---

## Self-Review

- **Spec coverage:** MCP dogfood — steward actions exposed as agent tools, web app stays customer #1 (Task 2, mirrors Wisp plan 003); soul XP is one number across chat + dashboard (Task 3); optional soul-deepens-from-work loop (Task 4, the spec's open-decision #4).
- **Unit-tested vs live/manual:** `service.ts` preview is unit-tested; MCP tools have a smoke assertion; soul-stats parity is a manual side-by-side check (it depends on the existing engine's real shape, which the executor confirms while wiring).
- **Type consistency:** `SoulStats {level,xpPct,memories}` is defined once in `soulStats.ts` and mirrored by the hook + the `ManageView` `soul` prop; `EnrollmentPreview`/`WorkPlan` reuse Plan-1 types; MCP tools reuse `listEnrollments`/`getLog`/`previewOwner`/`runAllDue` unchanged.
- **Single-source guarantees:** soul depth math is imported from the existing engine (never duplicated); the only new mapping lives in `soulStatsFor`.
