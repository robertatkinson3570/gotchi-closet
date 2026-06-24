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
