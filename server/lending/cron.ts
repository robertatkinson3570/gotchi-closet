import cron from "node-cron";
import { listEnabledTemplates, recordRelist } from "./db";
import { initWallet, maybeRelist, getOperatorAddress } from "./relist";

let started = false;

export function startAutoRenewCron() {
  if (started) return;

  const ok = initWallet();
  if (!ok) {
    console.log("[autorenew] disabled (no AUTORENEW_HOT_WALLET_KEY)");
    return;
  }
  started = true;
  console.log(`[autorenew] enabled · operator=${getOperatorAddress()}`);

  // Every 2 minutes, scan enabled templates and relist any whose tokens have no active listing
  cron.schedule("*/2 * * * *", async () => {
    try {
      const templates = listEnabledTemplates();
      if (templates.length === 0) return;
      console.log(`[autorenew] tick · ${templates.length} templates`);
      for (const t of templates) {
        const { success, txHash, error } = await maybeRelist(t);
        if (error === "already-active") continue;
        recordRelist(t.token_id, txHash, success, success ? null : error);
        if (success) {
          console.log(`[autorenew] relisted #${t.token_id} tx=${txHash}`);
        } else {
          console.warn(`[autorenew] failed #${t.token_id}: ${error}`);
        }
      }
    } catch (err) {
      console.error("[autorenew] cron error:", err);
    }
  });
}
