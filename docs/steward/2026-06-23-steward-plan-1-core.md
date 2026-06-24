# Steward — Plan 1: Backend Core (enrollment + due-work engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the testable, chain-write-free core of Steward: the verified action ABIs, the enrollment store with chore-exclusivity, and the pure due-work engine that decides what a steward should pet/channel/claim.

**Architecture:** Three self-contained server modules under `server/steward/`. `abi.ts` holds the on-chain action fragments (verified live on Base 2026-06-23). `db.ts` is a better-sqlite3 store (mirrors `server/companion/db.ts`) that enforces the rule "each chore belongs to at most one active steward per owner." `dueWork.ts` is a pure function: given the enabled chores, an on-chain snapshot, and `now`, it returns the exact pet/channel/claim work to do, skipping no-ops. No network or chain I/O in this plan — that lands in Plan 2 (AA execution + cron). This is a library slice: fully unit-tested, nothing user-facing yet.

**Tech Stack:** TypeScript (ESM), better-sqlite3, vitest, viem (selector check only). Package manager: pnpm. Tests run with `pnpm test:unit` (= `vitest run`).

**This is Plan 1 of 4.** Follow-ups (not in this plan): Plan 2 — AA/7702 session-key execution + cron loop + routes; Plan 3 — beast-mode frontend (page, card states, wizard, manage view); Plan 4 — MCP dogfood + soul-XP wiring. See `docs/steward/2026-06-23-steward-design.md` for the full spec.

---

## File Structure

- `server/steward/abi.ts` (create) — verified diamond addresses + action ABI fragments + the `Chore` union.
- `server/steward/abi.test.ts` (create) — asserts the action selectors match the verified on-chain signatures.
- `server/steward/db.ts` (create) — enrollment + log store; `enroll`, `claimedChores`, exclusivity, status, log.
- `server/steward/db.test.ts` (create) — chore-exclusivity rules, revoke frees chores, edit re-checks.
- `server/steward/dueWork.ts` (create) — pure `computeWork(chores, snapshot, now)` + `isEmpty`.
- `server/steward/dueWork.test.ts` (create) — cooldown gating, no-op skipping, channel gotchi-rotation.

---

## Task 1: Action ABIs + chore type

**Files:**
- Create: `server/steward/abi.ts`
- Test: `server/steward/abi.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/abi.test.ts
import { describe, it, expect } from "vitest";
import { toFunctionSelector } from "viem";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND, PET_ABI, REALM_ABI, CHORES } from "./abi";

describe("steward abi", () => {
  it("targets the verified Base diamonds", () => {
    expect(AAVEGOTCHI_DIAMOND).toBe("0xA99c4B08201F2913Db8D28e71d020c4298F29dBF");
    expect(REALM_DIAMOND).toBe("0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372");
  });

  it("exposes the three action selectors with their verified signatures", () => {
    // These signatures were confirmed present via DiamondLoupe facetAddress on Base 2026-06-23.
    const sig = (abi: readonly unknown[], name: string) =>
      toFunctionSelector((abi as any[]).find((f) => f.name === name));
    expect(sig(PET_ABI, "interact")).toBe(toFunctionSelector("interact(uint256[])"));
    expect(sig(REALM_ABI, "channelAlchemica")).toBe(
      toFunctionSelector("channelAlchemica(uint256,uint256,uint256,bytes)")
    );
    expect(sig(REALM_ABI, "claimAllAvailableAlchemica")).toBe(
      toFunctionSelector("claimAllAvailableAlchemica(uint256[],uint256,bytes)")
    );
  });

  it("lists the three chores", () => {
    expect([...CHORES]).toEqual(["pet", "channel", "claim"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/abi.test.ts`
Expected: FAIL — `Cannot find module './abi'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/abi.ts
// Action surface for Steward. Addresses + signatures verified live on Base 8453 on
// 2026-06-23 (selectors resolve via DiamondLoupe facetAddress; claim/channel accept a
// "0x" signature on the geist build). See docs/steward/2026-06-23-steward-design.md.

export const AAVEGOTCHI_DIAMOND = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF" as const;
export const REALM_DIAMOND = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372" as const;

export const PET_ABI = [
  {
    name: "interact",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tokenIds", type: "uint256[]" }],
    outputs: [],
  },
] as const;

export const REALM_ABI = [
  {
    name: "channelAlchemica",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmId", type: "uint256" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_lastChanneled", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "claimAllAvailableAlchemica",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_realmIds", type: "uint256[]" },
      { name: "_gotchiId", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const CHORES = ["pet", "channel", "claim"] as const;
export type Chore = (typeof CHORES)[number];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/abi.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/abi.ts server/steward/abi.test.ts
git commit -m "feat(steward): verified action ABIs + chore type"
```

---

## Task 2: Enrollment store with chore-exclusivity

**Files:**
- Create: `server/steward/db.ts`
- Test: `server/steward/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStewardDb, closeStewardDb, enroll, listEnrollments, getEnrollment,
  setStatus, editChores, claimedChores, ChoreConflictError,
} from "./db";

const ALL = { pet: true, channel: true, claim: true };

beforeEach(() => { process.env.STEWARD_DB_PATH = ":memory:"; getStewardDb(); });
afterEach(() => { closeStewardDb(); });

describe("steward db chore-exclusivity", () => {
  it("enrolls a steward as active and stores its chores", () => {
    const e = enroll({ owner: "0xAbC", gotchiId: 42, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    expect(e.status).toBe("active");
    expect(e.owner).toBe("0xabc"); // lowercased
    expect(e.chores).toEqual({ pet: true, channel: false, claim: false });
    expect(listEnrollments("0xABC")).toHaveLength(1);
  });

  it("clamps interval to the 8h floor", () => {
    const e = enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 60 });
    expect(e.intervalSec).toBe(8 * 60 * 60);
  });

  it("lets two stewards split non-overlapping chores", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    const zeke = enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: true, claim: true }, intervalSec: 28800 });
    expect(zeke.status).toBe("active");
    expect([...claimedChores("0x1")].sort()).toEqual(["channel", "claim", "pet"]);
  });

  it("rejects a second steward that re-claims an owned chore", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    expect(() =>
      enroll({ owner: "0x1", gotchiId: 2, chores: { pet: true, channel: true, claim: false }, intervalSec: 28800 })
    ).toThrowError(ChoreConflictError);
  });

  it("blocks any new steward once one holds all three chores", () => {
    enroll({ owner: "0x1", gotchiId: 1, chores: ALL, intervalSec: 28800 });
    expect(() =>
      enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: false, claim: true }, intervalSec: 28800 })
    ).toThrowError(ChoreConflictError);
  });

  it("frees chores when a steward is revoked", () => {
    const a = enroll({ owner: "0x1", gotchiId: 1, chores: ALL, intervalSec: 28800 });
    setStatus(a.id, "revoked");
    expect(claimedChores("0x1").size).toBe(0);
    const b = enroll({ owner: "0x1", gotchiId: 2, chores: ALL, intervalSec: 28800 });
    expect(b.status).toBe("active");
  });

  it("editChores re-checks exclusivity but ignores the steward's own current chores", () => {
    const a = enroll({ owner: "0x1", gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 });
    enroll({ owner: "0x1", gotchiId: 2, chores: { pet: false, channel: true, claim: false }, intervalSec: 28800 });
    // a may add claim (free) but not channel (taken by gotchi 2)
    expect(editChores(a.id, { pet: true, channel: false, claim: true }).chores.claim).toBe(true);
    expect(() => editChores(a.id, { pet: true, channel: true, claim: true })).toThrowError(ChoreConflictError);
  });

  it("getEnrollment round-trips", () => {
    const e = enroll({ owner: "0x9", gotchiId: 7, chores: { pet: true, channel: false, claim: false }, intervalSec: 43200 });
    expect(getEnrollment(e.id)?.gotchiId).toBe(7);
    expect(getEnrollment(999_999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/db.test.ts`
Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/db.ts
// Steward enrollment + log store. Mirrors server/companion/db.ts (better-sqlite3, WAL,
// prepared statements). Invariant: each chore (pet|channel|claim) is held by at most one
// ACTIVE enrollment per owner. Tests use STEWARD_DB_PATH=":memory:".
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { CHORES, type Chore } from "./abi";

export type Status = "active" | "paused" | "revoked";
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }
export interface Enrollment {
  id: number; owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount: string | null; sessionKey: string | null; status: Status;
  createdAt: number; lastRunAt: number | null;
}

export const MIN_INTERVAL_SEC = 8 * 60 * 60;

export class ChoreConflictError extends Error {
  constructor(public conflicts: Chore[]) {
    super(`chores already assigned to another active steward: ${conflicts.join(", ")}`);
    this.name = "ChoreConflictError";
  }
}

let db: Database.Database | null = null;
function dbPath(): string { return process.env.STEWARD_DB_PATH || path.resolve("./data/steward.db"); }
export function closeStewardDb(): void { if (db) { db.close(); db = null; } }

export function getStewardDb(): Database.Database {
  if (db) return db;
  const p = dbPath();
  if (p !== ":memory:") {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS steward_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL, gotchi_id INTEGER NOT NULL,
      chores TEXT NOT NULL, interval_sec INTEGER NOT NULL,
      smart_account TEXT, session_key TEXT,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, last_run_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_steward_owner ON steward_enrollments(owner, status);
    CREATE TABLE IF NOT EXISTS steward_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL, gotchi_id INTEGER NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL, tx_hash TEXT, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steward_log_owner ON steward_log(owner, id);
  `);
  return db;
}

interface Row {
  id: number; owner: string; gotchi_id: number; chores: string; interval_sec: number;
  smart_account: string | null; session_key: string | null; status: Status;
  created_at: number; last_run_at: number | null;
}
function toEnrollment(r: Row): Enrollment {
  return {
    id: r.id, owner: r.owner, gotchiId: r.gotchi_id, chores: JSON.parse(r.chores),
    intervalSec: r.interval_sec, smartAccount: r.smart_account, sessionKey: r.session_key,
    status: r.status, createdAt: r.created_at, lastRunAt: r.last_run_at,
  };
}

export function claimedChores(owner: string, excludeId?: number): Set<Chore> {
  const rows = getStewardDb()
    .prepare(`SELECT id, chores FROM steward_enrollments WHERE owner=? AND status='active'`)
    .all(owner.toLowerCase()) as { id: number; chores: string }[];
  const set = new Set<Chore>();
  for (const r of rows) {
    if (excludeId !== undefined && r.id === excludeId) continue;
    const c = JSON.parse(r.chores) as Chores;
    for (const k of CHORES) if (c[k]) set.add(k);
  }
  return set;
}

function conflictsAgainst(owner: string, want: Chores, excludeId?: number): Chore[] {
  const taken = claimedChores(owner, excludeId);
  return CHORES.filter((k) => want[k] && taken.has(k));
}

export function enroll(input: {
  owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount?: string; sessionKey?: string;
}): Enrollment {
  const owner = input.owner.toLowerCase();
  const interval = Math.max(MIN_INTERVAL_SEC, Math.floor(input.intervalSec));
  const conflicts = conflictsAgainst(owner, input.chores);
  if (conflicts.length) throw new ChoreConflictError(conflicts);
  const info = getStewardDb()
    .prepare(
      `INSERT INTO steward_enrollments
       (owner, gotchi_id, chores, interval_sec, smart_account, session_key, status, created_at, last_run_at)
       VALUES (?,?,?,?,?,?, 'active', ?, NULL)`
    )
    .run(owner, input.gotchiId, JSON.stringify(input.chores), interval,
      input.smartAccount ?? null, input.sessionKey ?? null, Date.now());
  return getEnrollment(Number(info.lastInsertRowid))!;
}

export function getEnrollment(id: number): Enrollment | null {
  const r = getStewardDb().prepare(`SELECT * FROM steward_enrollments WHERE id=?`).get(id) as Row | undefined;
  return r ? toEnrollment(r) : null;
}

export function listEnrollments(owner: string): Enrollment[] {
  return (getStewardDb()
    .prepare(`SELECT * FROM steward_enrollments WHERE owner=? ORDER BY id`)
    .all(owner.toLowerCase()) as Row[]).map(toEnrollment);
}

export function setStatus(id: number, status: Status): void {
  getStewardDb().prepare(`UPDATE steward_enrollments SET status=? WHERE id=?`).run(status, id);
}

export function editChores(id: number, chores: Chores): Enrollment {
  const cur = getEnrollment(id);
  if (!cur) throw new Error(`enrollment ${id} not found`);
  const conflicts = conflictsAgainst(cur.owner, chores, id);
  if (conflicts.length) throw new ChoreConflictError(conflicts);
  getStewardDb().prepare(`UPDATE steward_enrollments SET chores=? WHERE id=?`).run(JSON.stringify(chores), id);
  return getEnrollment(id)!;
}

export function recordRun(id: number, ts: number): void {
  getStewardDb().prepare(`UPDATE steward_enrollments SET last_run_at=? WHERE id=?`).run(ts, id);
}

export interface LogEntry { action: string; detail: string; txHash: string | null; ts: number; }
export function appendLog(owner: string, gotchiId: number, action: string, detail: string, txHash: string | null): void {
  getStewardDb()
    .prepare(`INSERT INTO steward_log (owner, gotchi_id, action, detail, tx_hash, ts) VALUES (?,?,?,?,?,?)`)
    .run(owner.toLowerCase(), gotchiId, action, detail, txHash, Date.now());
}
export function getLog(owner: string, limit = 50): LogEntry[] {
  return (getStewardDb()
    .prepare(`SELECT action, detail, tx_hash as txHash, ts FROM steward_log WHERE owner=? ORDER BY id DESC LIMIT ?`)
    .all(owner.toLowerCase(), limit) as LogEntry[]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/db.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/db.ts server/steward/db.test.ts
git commit -m "feat(steward): enrollment store with chore-exclusivity"
```

---

## Task 3: Pure due-work engine

**Files:**
- Create: `server/steward/dueWork.ts`
- Test: `server/steward/dueWork.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/dueWork.test.ts
import { describe, it, expect } from "vitest";
import { computeWork, isEmpty, PET_COOLDOWN_SEC, RESERVOIR_COOLDOWN_SEC, CLAIM_DUST_MIN } from "./dueWork";

const NOW = 1_000_000_000;
const dust = CLAIM_DUST_MIN;
const big = dust * 5n;

function snap() {
  return {
    gotchis: [
      { id: 1, lastInteracted: NOW - PET_COOLDOWN_SEC - 1, lastChanneled: 0 },          // pet due, channel-ready
      { id: 2, lastInteracted: NOW - 60, lastChanneled: NOW - 60 },                      // pet NOT due, channel on cd
    ],
    parcels: [
      { id: 10, altarLevel: 9, lastChanneled: 0, lastClaimed: NOW - RESERVOIR_COOLDOWN_SEC - 1, claimable: [big, 0n, 0n, 0n] },
      { id: 11, altarLevel: 0, lastChanneled: 0, lastClaimed: 0, claimable: [0n, 0n, 0n, 0n] }, // no altar, empty
    ],
  };
}

describe("computeWork", () => {
  it("pets only gotchis past the 12h cooldown", () => {
    const w = computeWork({ pet: true, channel: false, claim: false }, snap(), NOW);
    expect(w.pet).toEqual([1]);
    expect(w.channel).toEqual([]);
    expect(w.claim).toEqual([]);
  });

  it("claims only parcels off-cooldown with above-dust balance", () => {
    const w = computeWork({ pet: false, channel: false, claim: true }, snap(), NOW);
    expect(w.claim).toEqual([10]); // 11 has no balance
  });

  it("skips claim when balance is below dust", () => {
    const s = snap();
    s.parcels[0].claimable = [dust - 1n, 0n, 0n, 0n];
    const w = computeWork({ pet: false, channel: false, claim: true }, s, NOW);
    expect(w.claim).toEqual([]);
  });

  it("assigns an off-cooldown gotchi to each altared parcel, highest altar first, one gotchi per run", () => {
    const w = computeWork({ pet: false, channel: true, claim: false }, snap(), NOW);
    // only parcel 10 has an altar; only gotchi 1 is off channel-cooldown
    expect(w.channel).toEqual([{ parcelId: 10, gotchiId: 1, lastChanneled: 0 }]);
  });

  it("disabled chores produce empty arrays", () => {
    const w = computeWork({ pet: false, channel: false, claim: false }, snap(), NOW);
    expect(isEmpty(w)).toBe(true);
  });

  it("isEmpty is false when any work exists", () => {
    expect(isEmpty(computeWork({ pet: true, channel: false, claim: false }, snap(), NOW))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/dueWork.test.ts`
Expected: FAIL — `Cannot find module './dueWork'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/dueWork.ts
// Pure due-work computation for one Steward enrollment. No I/O: the caller supplies a
// ChainSnapshot (on-chain reads) and `now`, so this is fully deterministic + unit-tested.
// Cooldown constants mirror src/lib/lending/contracts.ts; kept local so this server module
// does not pull the src "@/..." import graph. The Plan-2 runner still simulateContract's
// every action before submitting, so these filters are a best-effort gas-saver, not the
// final safety gate.

export const PET_COOLDOWN_SEC = 12 * 60 * 60;
export const RESERVOIR_COOLDOWN_SEC = 8 * 60 * 60;
export const CLAIM_DUST_MIN = 10n ** 18n; // 1 whole token in any reservoir before it's worth a claim
export const CHANNEL_COOLDOWN_SEC_BY_ALTAR: Record<number, number> = {
  1: 24 * 3600, 2: 18 * 3600, 3: 12 * 3600, 4: 10 * 3600, 5: 8 * 3600,
  6: 4 * 3600, 7: 3 * 3600, 8: 2 * 3600, 9: 1 * 3600,
};

export interface GotchiState { id: number; lastInteracted: number; lastChanneled: number; }
export interface ParcelState {
  id: number; altarLevel: number; lastChanneled: number; lastClaimed: number; claimable: bigint[];
}
export interface ChainSnapshot { gotchis: GotchiState[]; parcels: ParcelState[]; }
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }

export interface ChannelAssignment { parcelId: number; gotchiId: number; lastChanneled: number; }
export interface WorkPlan { pet: number[]; channel: ChannelAssignment[]; claim: number[]; }

export function computeWork(chores: Chores, snap: ChainSnapshot, now: number): WorkPlan {
  const pet = chores.pet
    ? snap.gotchis.filter((g) => now - g.lastInteracted >= PET_COOLDOWN_SEC).map((g) => g.id)
    : [];

  const claim = chores.claim
    ? snap.parcels
        .filter((p) => now - p.lastClaimed >= RESERVOIR_COOLDOWN_SEC)
        .filter((p) => p.claimable.some((v) => v >= CLAIM_DUST_MIN))
        .map((p) => p.id)
    : [];

  const channel: ChannelAssignment[] = [];
  if (chores.channel) {
    const altared = snap.parcels.filter((p) => p.altarLevel > 0).sort((a, b) => b.altarLevel - a.altarLevel);
    const used = new Set<number>();
    for (const p of altared) {
      const cd = CHANNEL_COOLDOWN_SEC_BY_ALTAR[p.altarLevel] ?? RESERVOIR_COOLDOWN_SEC;
      const g = snap.gotchis.find((g) => !used.has(g.id) && now - g.lastChanneled >= cd);
      if (!g) continue; // no free, off-cooldown gotchi left for this parcel
      used.add(g.id);
      channel.push({ parcelId: p.id, gotchiId: g.id, lastChanneled: g.lastChanneled });
    }
  }

  return { pet, channel, claim };
}

export function isEmpty(w: WorkPlan): boolean {
  return w.pet.length === 0 && w.channel.length === 0 && w.claim.length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/dueWork.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/dueWork.ts server/steward/dueWork.test.ts
git commit -m "feat(steward): pure due-work engine (cooldown gating + channel rotation)"
```

---

## Task 4: Typecheck, lint, and full suite green

**Files:** none (verification task)

- [ ] **Step 1: Run the full steward unit suite**

Run: `npx vitest run server/steward`
Expected: PASS — 3 files, 17 tests.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0 (no errors).

- [ ] **Step 3: Lint the new files**

Run: `npx eslint server/steward --ext ts`
Expected: exit 0 (no warnings).

- [ ] **Step 4: Commit any lint/type fixups**

```bash
git add -A server/steward
git commit -m "chore(steward): plan-1 core green (typecheck + lint + tests)"
```

---

## Self-Review (done while writing)

- **Spec coverage (Plan-1 slice):** verified action ABIs (Task 1), chore-exclusivity incl. all-3-blocks-new and revoke-frees (Task 2), cooldown-gated + no-op-skipping + channel-rotation due-work (Task 3). Cadence/interval floor is stored + clamped (Task 2); the interval is *consumed* by the cron in Plan 2.
- **Deferred to later plans (by design, noted in header):** AA/7702 session-key submission + paymaster + cron loop (Plan 2), REST routes (Plan 2), frontend (Plan 3), MCP + soul-XP (Plan 4). No chain writes in Plan 1.
- **Type consistency:** `Chore`/`CHORES` defined in `abi.ts`, imported by `db.ts`; `Chores` shape `{pet,channel,claim}` identical across `db.ts` and `dueWork.ts`; `WorkPlan`/`ChannelAssignment` defined once in `dueWork.ts`.
- **No placeholders:** every step has complete code + exact run command + expected result.
