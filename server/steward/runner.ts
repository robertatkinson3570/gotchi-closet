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
  // Optional: drop calls that would revert (stale cooldown, Not Altar, lent gotchi, etc.) so we
  // never submit — and pay gas for — a reverting userOp. Returns the calls that pass simulation.
  simulate?: (enrollment: Enrollment, calls: Call[]) => Promise<Call[]>;
}

export interface RunResult { ran: boolean; reason?: "not-due" | "no-work" | "inactive"; txHash?: string; }

export async function runEnrollment(e: Enrollment, deps: RunnerDeps, now: number, opts: { force?: boolean } = {}): Promise<RunResult> {
  if (e.status !== "active") return { ran: false, reason: "inactive" };
  // `force` (manual "run now") skips the per-enrollment interval gate, but on-chain cooldowns
  // still apply: computeWork only includes due work, and simulate drops anything that'd revert.
  if (!opts.force && e.lastRunAt !== null && now - e.lastRunAt < e.intervalSec) return { ran: false, reason: "not-due" };

  const snap = await deps.snapshotFor(e.owner);
  const plan = computeWork(e.chores, snap, now);

  if (isEmpty(plan)) {
    deps.recordRun(e.id, now);
    return { ran: false, reason: "no-work" };
  }

  let calls = workPlanToCalls(plan, { claimerGotchiId: e.gotchiId });
  if (deps.simulate) {
    calls = await deps.simulate(e, calls);
    if (!calls.length) { deps.recordRun(e.id, now); return { ran: false, reason: "no-work" }; }
  }
  const txHash = await deps.submit(e, calls);

  const detail = `pet:${plan.pet.length} channel:${plan.channel.length} claim:${plan.claim.length}`;
  deps.log(e.owner, e.gotchiId, "run", detail, txHash);
  deps.recordRun(e.id, now);
  return { ran: true, txHash };
}
