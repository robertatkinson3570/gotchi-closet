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
