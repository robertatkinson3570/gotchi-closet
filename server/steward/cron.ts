// server/steward/cron.ts
import cron from "node-cron";
import { getStewardDb, listEnrollmentsForRun, recordRun, appendLog, type Enrollment } from "./db";
import { runEnrollment, type RunnerDeps, type RunResult } from "./runner";
import { snapshotFor, simulateCalls } from "./chain";
import { computeWork } from "./dueWork";
import { makeSubmitter } from "./aa";
import { petAsOperator } from "./petRelayer";

function deps(): RunnerDeps {
  const submitter = makeSubmitter();
  return {
    snapshotFor,
    submit: (e, calls) => submitter.submit(e, calls),
    log: appendLog,
    recordRun,
    // Drop reverting actions before paying for a userOp; skip if the account is unknown.
    simulate: (e, calls) => (e.smartAccount ? simulateCalls(e.smartAccount, calls) : Promise.resolve(calls)),
  };
}

// Operator-mode (Ledger fallback): pet-only, executed by the relayer via setPetOperatorForAll.
async function runOperatorPet(e: Enrollment, now: number, force = false): Promise<RunResult> {
  // Same status gate as runEnrollment: a paused/revoked enrollment must never run (the
  // relayer would otherwise keep petting for owners who fired their steward).
  if (e.status !== "active") return { ran: false, reason: "inactive" };
  if (!force && e.lastRunAt !== null && now - e.lastRunAt < e.intervalSec) return { ran: false, reason: "not-due" };
  const snap = await snapshotFor(e.owner);
  const plan = computeWork({ pet: true, channel: false, claim: false }, snap, now);
  if (!plan.pet.length) { recordRun(e.id, now); return { ran: false, reason: "no-work" }; }
  const hash = await petAsOperator(e.owner, plan.pet);
  appendLog(e.owner, e.gotchiId, "run", `pet:${plan.pet.length} (operator)`, hash);
  recordRun(e.id, now);
  return { ran: true, txHash: hash };
}

// Run ONE enrollment immediately — used by manual "run now" and by each cron iteration. `force`
// skips the per-enrollment interval gate (on-chain cooldowns still apply). `d` is passed in by
// the cron so a tick reuses one submitter; manual calls let it default.
export async function runOne(e: Enrollment, now = Math.floor(Date.now() / 1000), opts: { force?: boolean } = {}, d?: RunnerDeps): Promise<RunResult> {
  if (e.authMode === "operator") return runOperatorPet(e, now, opts.force);
  return runEnrollment(e, d ?? deps(), now, opts);
}

// In-memory guards: never let a slow run overlap the next tick, and back a persistently-failing
// enrollment off (exponential) instead of retrying — and log-spamming — every cycle.
let running = false;
const failures = new Map<number, { count: number; nextAttempt: number }>();
const BACKOFF_BASE_MS = 30 * 60 * 1000;
const BACKOFF_MAX_MS = 12 * 60 * 60 * 1000;

// Wall-clock cap per enrollment: without it a single hung await inside runOne would keep
// `running` true forever and every later tick would skip — the whole cron silently dead.
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export async function runAllDue(now = Math.floor(Date.now() / 1000)): Promise<void> {
  if (running) { console.warn("[steward] previous run still in progress; skipping tick"); return; }
  running = true;
  try {
    const d = deps();
    const nowMs = now * 1000;
    const owners = getStewardDb().prepare(`SELECT DISTINCT owner FROM steward_enrollments WHERE status='active'`).all() as { owner: string }[];
    for (const { owner } of owners) {
      for (const e of listEnrollmentsForRun(owner)) {
        const fail = failures.get(e.id);
        if (fail && nowMs < fail.nextAttempt) continue; // backing off after repeated failures
        try {
          await withTimeout(runOne(e, now, {}, d), RUN_TIMEOUT_MS, `steward enrollment ${e.id}`);
          failures.delete(e.id); // recovered
        } catch (err) {
          const count = (fail?.count ?? 0) + 1;
          const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (count - 1));
          failures.set(e.id, { count, nextAttempt: nowMs + delay });
          appendLog(e.owner, e.gotchiId, "error", `${String((err as Error).message).slice(0, 180)} (retry in ${Math.round(delay / 60000)}m)`, null);
        }
      }
    }
  } finally {
    running = false;
  }
}

export function startStewardCron(): void {
  // Session mode needs the bundler; operator (Ledger) mode needs the pet relayer. Start if either.
  if (!process.env.STEWARD_BUNDLER_URL && !process.env.STEWARD_PET_RELAYER_KEY) {
    console.warn("[steward] cron disabled (no STEWARD_BUNDLER_URL or STEWARD_PET_RELAYER_KEY)");
    return;
  }
  // every 30 min; runEnrollment enforces each enrollment's own interval, runAllDue de-dups overlaps.
  cron.schedule("*/30 * * * *", () => { runAllDue().catch((e) => console.error("[steward] cron", e)); });
  console.log("[steward] cron started");
}
