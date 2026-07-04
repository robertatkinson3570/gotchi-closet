import cron from "node-cron";
import { getActiveGoals, hasCredits, burnCredit, logAction } from "./db";
import { listEnrollments } from "../steward/db";
import { runOne } from "../steward/cron";
import { runUpkeep } from "./actions";

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

// Live deps: goals + enrollments + the SAME allowlist-scoped runUpkeep executor the Act path uses.
// isEnrolled gates on an active Steward session key — zero enrollments ⇒ the pass is a no-op.
function liveDeps(): AutoDeps {
  return {
    getActiveGoals: () => getActiveGoals().map((g) => ({ wallet: g.wallet, tokenId: g.tokenId, goal: g.goal })),
    isEnrolled: (w) => listEnrollments(w).some((e) => e.status === "active"),
    runUpkeep: (w, id) => runUpkeep(w, id, { listEnrollments, runOne, hasCredits, burnCredit, logAction }),
    log: (wallet, tokenId, kind, detail, txHash) => logAction(wallet, tokenId, kind, detail, txHash),
  };
}

let running = false;
// Gated on HERMES_AUTONOMOUS=1 AND real enrollments — dormant/no-op until Task 6 (delegated
// signing) is live. Every ~30 min; runUpkeep's own cooldowns keep it from acting too often.
export function startHermesAutonomousCron(): void {
  if (process.env.HERMES_AUTONOMOUS !== "1") {
    console.warn("[hermes] autonomous cron disabled (HERMES_AUTONOMOUS != 1)");
    return;
  }
  cron.schedule("*/30 * * * *", () => {
    if (running) { console.warn("[hermes] previous autonomous pass still running; skipping tick"); return; }
    running = true;
    runAutonomousPass(liveDeps())
      .then((s) => console.log(`[hermes] autonomous pass: acted=${s.acted} skipped=${s.skipped}`))
      .catch((e) => console.error("[hermes] autonomous cron", e))
      .finally(() => { running = false; });
  });
  console.log("[hermes] autonomous cron started");
}
