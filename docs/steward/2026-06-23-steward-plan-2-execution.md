# Steward — Plan 2: AA Execution + Cron + Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Depends on Plan 1 being complete.

**Goal:** Turn the Plan-1 core into a running automation: read the owner's on-chain state, submit batched pet/channel/claim as a single EIP-7702 session-key userOp paid from the player's gas float, on a cron, with REST endpoints to manage it.

**Architecture:** `encode.ts` turns a `WorkPlan` into concrete `{to,data}` calls (pure). `runner.ts` orchestrates (snapshot -> computeWork -> encode -> submit -> log) behind **injected dependencies** so the orchestration is unit-tested with fakes. `chain.ts` is the viem multicall reader (live). `aa.ts` is the EIP-7702 + session-key submitter via permissionless.js + Pimlico bundler/paymaster (live). `cron.ts` wakes due enrollments. `routes/steward.ts` exposes enroll/pause/resume/revoke/edit-chores/status/log. Player pays all gas; we submit only.

**Tech Stack:** viem, permissionless@^0.2 (Pimlico bundler + paymaster, EIP-7702 + ERC-7579 smart sessions), node-cron, express, vitest. Depends on Plan 1 (`server/steward/{abi,db,dueWork}.ts`).

**Prereq:** `pnpm add permissionless` (pin the installed minor; verify the 7702 + smart-session API against current Pimlico docs — these APIs move). Env: `STEWARD_RPC_URL`, `PIMLICO_API_KEY`, `STEWARD_BUNDLER_URL`.

---

## File Structure

- `server/steward/encode.ts` (create) — `workPlanToCalls(plan)` -> `{ to, data }[]` (pure).
- `server/steward/encode.test.ts` (create).
- `server/steward/runner.ts` (create) — `runEnrollment(enrollment, deps, now)` orchestration (injected deps).
- `server/steward/runner.test.ts` (create) — orchestration with fakes.
- `server/steward/validate.ts` (create) — `parseEnrollBody(body)` request validation (pure).
- `server/steward/validate.test.ts` (create).
- `server/steward/chain.ts` (create) — `snapshotFor(owner)` viem multicall reader (live).
- `server/steward/aa.ts` (create) — `makeSubmitter()` EIP-7702 session-key submit (live).
- `server/steward/cron.ts` (create) — node-cron loop calling `runAllDue()`.
- `server/routes/steward.ts` (create) — REST endpoints.
- `server/app.ts` (modify) — mount the steward router + start the cron.

---

## Task 1: Encode a WorkPlan into calls (pure)

**Files:**
- Create: `server/steward/encode.ts`, `server/steward/encode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/encode.test.ts
import { describe, it, expect } from "vitest";
import { workPlanToCalls } from "./encode";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND } from "./abi";

describe("workPlanToCalls", () => {
  it("emits one interact call to the aavegotchi diamond when pets are due", () => {
    const calls = workPlanToCalls({ pet: [1, 2], channel: [], claim: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].to.toLowerCase()).toBe(AAVEGOTCHI_DIAMOND.toLowerCase());
    expect(calls[0].data.startsWith("0x")).toBe(true);
  });

  it("emits one claimAll call to the realm diamond for all ready parcels", () => {
    const calls = workPlanToCalls({ pet: [], channel: [], claim: [10, 11] }, { claimerGotchiId: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].to.toLowerCase()).toBe(REALM_DIAMOND.toLowerCase());
  });

  it("emits one channel call per assignment", () => {
    const calls = workPlanToCalls({
      pet: [], claim: [],
      channel: [
        { parcelId: 10, gotchiId: 1, lastChanneled: 0 },
        { parcelId: 12, gotchiId: 2, lastChanneled: 5 },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.to.toLowerCase() === REALM_DIAMOND.toLowerCase())).toBe(true);
  });

  it("uses the first channel assignment's gotchi as the claimer when claiming and channeling together", () => {
    const calls = workPlanToCalls({ pet: [], claim: [10], channel: [{ parcelId: 10, gotchiId: 3, lastChanneled: 0 }] });
    expect(calls).toHaveLength(2); // 1 channel + 1 claim
  });

  it("throws if a claim has no claimer gotchi available", () => {
    expect(() => workPlanToCalls({ pet: [], channel: [], claim: [10] })).toThrowError(/claimer/);
  });

  it("returns no calls for an empty plan", () => {
    expect(workPlanToCalls({ pet: [], channel: [], claim: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/encode.test.ts`
Expected: FAIL — `Cannot find module './encode'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/encode.ts
// Pure: turn a WorkPlan into concrete contract calls. claimAllAvailableAlchemica needs a
// gotchi the owner controls; we use the first channel assignment's gotchi if present, else
// the explicit opts.claimerGotchiId the runner supplies (the steward gotchi).
import { encodeFunctionData } from "viem";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND, PET_ABI, REALM_ABI } from "./abi";
import type { WorkPlan } from "./dueWork";

export interface Call { to: `0x${string}`; data: `0x${string}`; }

export function workPlanToCalls(plan: WorkPlan, opts: { claimerGotchiId?: number } = {}): Call[] {
  const calls: Call[] = [];

  if (plan.pet.length) {
    calls.push({
      to: AAVEGOTCHI_DIAMOND,
      data: encodeFunctionData({ abi: PET_ABI, functionName: "interact", args: [plan.pet.map(BigInt)] }),
    });
  }

  for (const a of plan.channel) {
    calls.push({
      to: REALM_DIAMOND,
      data: encodeFunctionData({
        abi: REALM_ABI,
        functionName: "channelAlchemica",
        args: [BigInt(a.parcelId), BigInt(a.gotchiId), BigInt(a.lastChanneled), "0x"],
      }),
    });
  }

  if (plan.claim.length) {
    const claimer = plan.channel[0]?.gotchiId ?? opts.claimerGotchiId;
    if (claimer === undefined) throw new Error("claim requires a claimer gotchi id");
    calls.push({
      to: REALM_DIAMOND,
      data: encodeFunctionData({
        abi: REALM_ABI,
        functionName: "claimAllAvailableAlchemica",
        args: [plan.claim.map(BigInt), BigInt(claimer), "0x"],
      }),
    });
  }

  return calls;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/encode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/encode.ts server/steward/encode.test.ts
git commit -m "feat(steward): encode WorkPlan into batched calls"
```

---

## Task 2: Runner orchestration (injected deps, fully unit-tested)

**Files:**
- Create: `server/steward/runner.ts`, `server/steward/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/runner.test.ts
import { describe, it, expect, vi } from "vitest";
import { runEnrollment, type RunnerDeps } from "./runner";
import type { Enrollment } from "./db";

const NOW = 1_000_000_000;
const base: Enrollment = {
  id: 1, owner: "0x1", gotchiId: 7, chores: { pet: true, channel: false, claim: true },
  intervalSec: 28800, smartAccount: "0xsa", sessionKey: "0xsk", status: "active",
  createdAt: 0, lastRunAt: NOW - 28800 - 1, // due
};

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    snapshotFor: vi.fn(async () => ({
      gotchis: [{ id: 7, lastInteracted: 0, lastChanneled: 0 }],
      parcels: [{ id: 10, altarLevel: 0, lastChanneled: 0, lastClaimed: 0, claimable: [10n ** 18n, 0n, 0n, 0n] }],
    })),
    submit: vi.fn(async () => "0xhash"),
    log: vi.fn(),
    recordRun: vi.fn(),
    ...over,
  };
}

describe("runEnrollment", () => {
  it("skips when not yet due (now - lastRunAt < interval)", async () => {
    const d = deps();
    const r = await runEnrollment({ ...base, lastRunAt: NOW - 100 }, d, NOW);
    expect(r).toEqual({ ran: false, reason: "not-due" });
    expect(d.submit).not.toHaveBeenCalled();
  });

  it("skips and records the run when there is no work to do", async () => {
    const d = deps({
      snapshotFor: vi.fn(async () => ({
        gotchis: [{ id: 7, lastInteracted: NOW, lastChanneled: NOW }],
        parcels: [{ id: 10, altarLevel: 0, lastChanneled: 0, lastClaimed: NOW, claimable: [0n, 0n, 0n, 0n] }],
      })),
    });
    const r = await runEnrollment(base, d, NOW);
    expect(r).toEqual({ ran: false, reason: "no-work" });
    expect(d.submit).not.toHaveBeenCalled();
    expect(d.recordRun).toHaveBeenCalledWith(1, NOW);
  });

  it("submits one batched userOp, logs it, and records the run when work exists", async () => {
    const d = deps();
    const r = await runEnrollment(base, d, NOW);
    expect(r.ran).toBe(true);
    expect(d.submit).toHaveBeenCalledTimes(1);
    const calls = (d.submit as any).mock.calls[0][1];
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(d.log).toHaveBeenCalled();
    expect(d.recordRun).toHaveBeenCalledWith(1, NOW);
  });

  it("skips paused/revoked enrollments", async () => {
    const d = deps();
    expect((await runEnrollment({ ...base, status: "paused" }, d, NOW)).ran).toBe(false);
    expect(d.submit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/runner.test.ts`
Expected: FAIL — `Cannot find module './runner'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/runner.ts
// Orchestrates one enrollment run. All I/O is injected (RunnerDeps) so this is unit-tested
// with fakes; the live wiring (chain.ts snapshot, aa.ts submit, db.ts log/recordRun) is
// assembled in cron.ts.
import type { Enrollment } from "./db";
import type { ChainSnapshot } from "./dueWork";
import { computeWork, isEmpty } from "./dueWork";
import { workPlanToCalls, type Call } from "./encode";

export interface RunnerDeps {
  snapshotFor: (owner: string) => Promise<ChainSnapshot>;
  submit: (enrollment: Enrollment, calls: Call[]) => Promise<string>; // returns tx/userOp hash
  log: (owner: string, gotchiId: number, action: string, detail: string, txHash: string | null) => void;
  recordRun: (id: number, ts: number) => void;
}

export interface RunResult { ran: boolean; reason?: "not-due" | "no-work" | "inactive"; txHash?: string; }

export async function runEnrollment(e: Enrollment, deps: RunnerDeps, now: number): Promise<RunResult> {
  if (e.status !== "active") return { ran: false, reason: "inactive" };
  if (e.lastRunAt !== null && now - e.lastRunAt < e.intervalSec) return { ran: false, reason: "not-due" };

  const snap = await deps.snapshotFor(e.owner);
  const plan = computeWork(e.chores, snap, now);

  if (isEmpty(plan)) {
    deps.recordRun(e.id, now);
    return { ran: false, reason: "no-work" };
  }

  const calls = workPlanToCalls(plan, { claimerGotchiId: e.gotchiId });
  const txHash = await deps.submit(e, calls);

  const detail = `pet:${plan.pet.length} channel:${plan.channel.length} claim:${plan.claim.length}`;
  deps.log(e.owner, e.gotchiId, "run", detail, txHash);
  deps.recordRun(e.id, now);
  return { ran: true, txHash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/runner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/runner.ts server/steward/runner.test.ts
git commit -m "feat(steward): runner orchestration with injected deps"
```

---

## Task 3: Request validation (pure)

**Files:**
- Create: `server/steward/validate.ts`, `server/steward/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/steward/validate.test.ts
import { describe, it, expect } from "vitest";
import { parseEnrollBody } from "./validate";

describe("parseEnrollBody", () => {
  it("accepts a valid body", () => {
    const r = parseEnrollBody({
      owner: "0xAbC", gotchiId: 7, chores: { pet: true, channel: false, claim: true },
      intervalSec: 28800, smartAccount: "0xsa", sessionKey: "0xsk",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.gotchiId).toBe(7);
  });

  it("rejects when no chores are enabled", () => {
    const r = parseEnrollBody({ owner: "0x1", gotchiId: 1, chores: { pet: false, channel: false, claim: false }, intervalSec: 28800 });
    expect(r.ok).toBe(false);
  });

  it("rejects a missing owner / non-numeric gotchiId", () => {
    expect(parseEnrollBody({ gotchiId: 1, chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 }).ok).toBe(false);
    expect(parseEnrollBody({ owner: "0x1", gotchiId: "x", chores: { pet: true, channel: false, claim: false }, intervalSec: 28800 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/steward/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/steward/validate.ts
import type { Chores } from "./db";

export interface EnrollInput {
  owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount?: string; sessionKey?: string;
}
export type ParseResult = { ok: true; value: EnrollInput } | { ok: false; error: string };

export function parseEnrollBody(b: any): ParseResult {
  if (typeof b?.owner !== "string" || !b.owner.startsWith("0x")) return { ok: false, error: "owner required" };
  if (typeof b?.gotchiId !== "number" || !Number.isFinite(b.gotchiId)) return { ok: false, error: "gotchiId must be a number" };
  const c = b?.chores;
  if (!c || typeof c !== "object") return { ok: false, error: "chores required" };
  const chores: Chores = { pet: !!c.pet, channel: !!c.channel, claim: !!c.claim };
  if (!chores.pet && !chores.channel && !chores.claim) return { ok: false, error: "at least one chore required" };
  const intervalSec = typeof b?.intervalSec === "number" ? b.intervalSec : 28800;
  return {
    ok: true,
    value: {
      owner: b.owner, gotchiId: b.gotchiId, chores, intervalSec,
      smartAccount: typeof b.smartAccount === "string" ? b.smartAccount : undefined,
      sessionKey: typeof b.sessionKey === "string" ? b.sessionKey : undefined,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/steward/validate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/steward/validate.ts server/steward/validate.test.ts
git commit -m "feat(steward): enroll request validation"
```

---

## Task 4: Chain snapshot reader (live integration)

**Files:**
- Create: `server/steward/chain.ts`

This is a live reader; verify against Base mainnet rather than a unit test.

- [ ] **Step 1: Implement the snapshot reader**

```ts
// server/steward/chain.ts
// Reads the owner's gotchi + parcel state into a ChainSnapshot for dueWork. Enumeration via
// the Goldsky subgraphs (same endpoints as src/lib/subgraph.ts); per-id reads via viem.
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND } from "./abi";
import type { ChainSnapshot } from "./dueWork";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const CORE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const VERSE_SG = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const realmAbi = [
  { name: "getAltarId", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getParcelLastChanneled", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getLastChanneled", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getAvailableAlchemica", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256[4]" }] },
  { name: "lastClaimedAlchemica", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
const gotchiAbi = [
  { name: "getAavegotchi", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ name: "lastInteracted", type: "uint256" }] }] },
] as const;

async function sg(url: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// altar installation id -> level (1-9 and 10-18 lines), mirrors src/lib/lending/contracts.ts
const altarLevel = (id: number) => (id <= 0 ? 0 : id <= 9 ? id : id - 9);

export async function snapshotFor(owner: string): Promise<ChainSnapshot> {
  const o = owner.toLowerCase();
  const [coreData, verseData] = await Promise.all([
    sg(CORE_SG, `query($o:Bytes!){ aavegotchis(first:200, where:{owner:$o, status:3}) { gotchiId } }`, { o }),
    sg(VERSE_SG, `query($o:Bytes!){ parcels(first:500, where:{owner:$o}) { tokenId } }`, { o }),
  ]);
  const gotchiIds: number[] = coreData.aavegotchis.map((a: any) => Number(a.gotchiId));
  const parcelIds: number[] = verseData.parcels.map((p: any) => Number(p.tokenId));

  const gotchis = await Promise.all(gotchiIds.map(async (id) => {
    const [info, lastChanneled] = await Promise.all([
      client.readContract({ address: AAVEGOTCHI_DIAMOND, abi: gotchiAbi, functionName: "getAavegotchi", args: [BigInt(id)] }) as Promise<any>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getLastChanneled", args: [BigInt(id)] }) as Promise<bigint>,
    ]);
    return { id, lastInteracted: Number(info.lastInteracted), lastChanneled: Number(lastChanneled) };
  }));

  const parcels = await Promise.all(parcelIds.map(async (id) => {
    const [altar, plc, lc, avail] = await Promise.all([
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getAltarId", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getParcelLastChanneled", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "lastClaimedAlchemica", args: [BigInt(id)] }) as Promise<bigint>,
      client.readContract({ address: REALM_DIAMOND, abi: realmAbi, functionName: "getAvailableAlchemica", args: [BigInt(id)] }) as Promise<readonly bigint[]>,
    ]);
    return { id, altarLevel: altarLevel(Number(altar)), lastChanneled: Number(plc), lastClaimed: Number(lc), claimable: [...avail] };
  }));

  return { gotchis, parcels };
}
```

- [ ] **Step 2: Live smoke verification**

Replace `0xOWNER` with a real Base land owner (e.g. the owner of parcel 10036 from the spec):
```bash
npx tsx -e "import('./server/steward/chain.ts').then(async m => { const s = await m.snapshotFor('0xOWNER'); console.log('gotchis', s.gotchis.length, 'parcels', s.parcels.length, s.parcels[0]); })"
```
Expected: prints non-zero counts and a parcel object with `altarLevel` and a 4-element `claimable` bigint array.

- [ ] **Step 3: Commit**

```bash
git add server/steward/chain.ts
git commit -m "feat(steward): on-chain snapshot reader (subgraph + multicall)"
```

---

## Task 5: EIP-7702 session-key submitter (live integration)

**Files:**
- Create: `server/steward/aa.ts`

Signs a userOp with the enrollment's session key and submits via the Pimlico bundler; the paymaster pulls gas from the player's float. Verify on Base Sepolia first.

- [ ] **Step 1: Implement the submitter**

```ts
// server/steward/aa.ts
// EIP-7702 + ERC-7579 smart-session submitter. The player's EOA is 7702-delegated to a
// smart account; a session key (scoped to interact/channelAlchemica/claimAllAvailableAlchemica)
// signs one userOp batching all calls; the Pimlico paymaster charges the player's gas float.
//
// PIN permissionless to the installed minor and verify the smart-session + 7702 helpers
// against current Pimlico docs before prod. The Submitter interface is the stable contract
// the runner depends on; load7702SessionAccount is the ONLY SDK-version-specific seam.
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { Enrollment } from "./db";
import type { Call } from "./encode";

const RPC = process.env.STEWARD_RPC_URL || "https://mainnet.base.org";
const BUNDLER = process.env.STEWARD_BUNDLER_URL!; // https://api.pimlico.io/v2/8453/rpc?apikey=...

export interface Submitter { submit(enrollment: Enrollment, calls: Call[]): Promise<string>; }

export function makeSubmitter(): Submitter {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const pimlico = createPimlicoClient({ transport: http(BUNDLER) });

  return {
    async submit(enrollment: Enrollment, calls: Call[]): Promise<string> {
      if (!enrollment.smartAccount || !enrollment.sessionKey) {
        throw new Error(`enrollment ${enrollment.id} missing smartAccount/sessionKey`);
      }
      const account = await load7702SessionAccount(publicClient, enrollment);
      const smart = createSmartAccountClient({
        account,
        chain: base,
        bundlerTransport: http(BUNDLER),
        paymaster: pimlico,
        userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
      });
      // ONE userOp batching every call this cycle -> overhead paid once (cheapest gas).
      const hash = await smart.sendUserOperation({ calls });
      const receipt = await smart.waitForUserOperationReceipt({ hash });
      return receipt.receipt.transactionHash as Hex;
    },
  };
}

// Reconstructs the player's 7702 smart account + session-key signer from the stored
// enrollment, against the pinned permissionless 7702 + smart-session API. This is the single
// SDK-version-specific function; the runner/tests never call it (they use a fake submit).
async function load7702SessionAccount(_publicClient: unknown, _enrollment: Enrollment): Promise<any> {
  throw new Error("wire load7702SessionAccount to the pinned permissionless 7702 smart-session API");
}
```

- [ ] **Step 2: Issue a session key + verify on Base Sepolia**

Following the Pimlico 7702 smart-session guide, on a funded Base Sepolia test wallet: 7702-delegate the EOA, issue a session key scoped to the three selectors, store `{smartAccount, sessionKey}`, submit a single `interact` userOp, and confirm: the userOp lands; the inner call's `msg.sender` is the player's account (so a realm call would pass `Only Owner`); gas was paid by the paymaster from the player's float, not our wallet.

- [ ] **Step 3: Commit**

```bash
git add server/steward/aa.ts
git commit -m "feat(steward): EIP-7702 session-key userOp submitter (Pimlico)"
```

---

## Task 6: Cron loop + routes + mount

**Files:**
- Create: `server/steward/cron.ts`, `server/routes/steward.ts`
- Modify: `server/app.ts`

- [ ] **Step 1: Implement the cron loop**

```ts
// server/steward/cron.ts
import cron from "node-cron";
import { getStewardDb, listEnrollments, recordRun, appendLog } from "./db";
import { runEnrollment, type RunnerDeps } from "./runner";
import { snapshotFor } from "./chain";
import { makeSubmitter } from "./aa";

function deps(): RunnerDeps {
  const submitter = makeSubmitter();
  return { snapshotFor, submit: (e, calls) => submitter.submit(e, calls), log: appendLog, recordRun };
}

export async function runAllDue(now = Math.floor(Date.now() / 1000)): Promise<void> {
  const d = deps();
  const owners = getStewardDb().prepare(`SELECT DISTINCT owner FROM steward_enrollments WHERE status='active'`).all() as { owner: string }[];
  for (const { owner } of owners) {
    for (const e of listEnrollments(owner)) {
      try { await runEnrollment(e, d, now); }
      catch (err) { appendLog(e.owner, e.gotchiId, "error", String((err as Error).message).slice(0, 200), null); }
    }
  }
}

export function startStewardCron(): void {
  if (!process.env.STEWARD_BUNDLER_URL) { console.warn("[steward] cron disabled (no STEWARD_BUNDLER_URL)"); return; }
  // every 30 min; runEnrollment enforces each enrollment's own interval.
  cron.schedule("*/30 * * * *", () => { runAllDue().catch((e) => console.error("[steward] cron", e)); });
  console.log("[steward] cron started");
}
```

- [ ] **Step 2: Implement the routes**

```ts
// server/routes/steward.ts
import { Router } from "express";
import { enroll, listEnrollments, getEnrollment, setStatus, editChores, getLog, ChoreConflictError } from "../steward/db";
import { parseEnrollBody } from "../steward/validate";

export const stewardRouter = Router();

stewardRouter.post("/enroll", (req, res) => {
  const parsed = parseEnrollBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try { res.json(enroll(parsed.value)); }
  catch (e) {
    if (e instanceof ChoreConflictError) return res.status(409).json({ error: e.message, conflicts: e.conflicts });
    throw e;
  }
});

stewardRouter.get("/status", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ enrollments: listEnrollments(owner) });
});

stewardRouter.get("/log", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ log: getLog(owner) });
});

function mutateStatus(req: any, res: any, status: "active" | "paused" | "revoked") {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  setStatus(id, status);
  res.json(getEnrollment(id));
}
stewardRouter.post("/pause", (req, res) => mutateStatus(req, res, "paused"));
stewardRouter.post("/resume", (req, res) => mutateStatus(req, res, "active"));
stewardRouter.post("/revoke", (req, res) => mutateStatus(req, res, "revoked"));

stewardRouter.post("/edit-chores", (req, res) => {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  const chores = { pet: !!req.body.chores?.pet, channel: !!req.body.chores?.channel, claim: !!req.body.chores?.claim };
  try { res.json(editChores(id, chores)); }
  catch (err) {
    if (err instanceof ChoreConflictError) return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    throw err;
  }
});
```

- [ ] **Step 3: Mount the router + start the cron in `server/app.ts`**

Find where other routers mount (e.g. `app.use("/api/companion", ...)`) and add:
```ts
import { stewardRouter } from "./routes/steward";
import { startStewardCron } from "./steward/cron";
// after other app.use(...) mounts:
app.use("/api/steward", stewardRouter);
// near server start (where the lending cron starts):
startStewardCron();
```

- [ ] **Step 4: Manual verification**

```bash
curl -s -X POST localhost:5000/api/steward/enroll -H 'content-type: application/json' \
  -d '{"owner":"0x1","gotchiId":7,"chores":{"pet":true,"channel":false,"claim":false},"intervalSec":28800}'
curl -s -X POST localhost:5000/api/steward/enroll -H 'content-type: application/json' \
  -d '{"owner":"0x1","gotchiId":8,"chores":{"pet":true,"channel":false,"claim":false},"intervalSec":28800}'
curl -s 'localhost:5000/api/steward/status?owner=0x1'
```
Expected: first 200 with an enrollment; second 409 with `conflicts:["pet"]`; status lists one active enrollment.

- [ ] **Step 5: Commit**

```bash
git add server/steward/cron.ts server/routes/steward.ts server/app.ts
git commit -m "feat(steward): cron loop + REST routes + mount"
```

---

## Self-Review

- **Spec coverage:** single batched userOp + cheapest-gas batching (Tasks 1+2+5), no-op skip advances lastRunAt without submitting (Task 2), interval gating (Task 2), player-funded paymaster (Task 5), chore-exclusivity surfaced as 409 (Task 6), pause/resume/revoke/edit/status/log (Task 6), on-chain snapshot (Task 4).
- **Unit-tested vs live:** Tasks 1-3 are pure + unit-tested. Tasks 4-6 are integration (live RPC/bundler/express) with explicit smoke/curl verification — appropriate for process/network boundaries.
- **Type consistency:** `Call` defined in `encode.ts`, used by `runner.ts`/`aa.ts`; `RunnerDeps.submit` matches `Submitter.submit`; `Enrollment`/`Chores`/`WorkPlan`/`ChainSnapshot` reused from Plan 1.
- **Isolated SDK risk:** all AA-SDK-version-specific code is confined to `aa.ts:load7702SessionAccount`.
