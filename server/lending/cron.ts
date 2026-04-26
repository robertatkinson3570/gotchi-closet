import cron from "node-cron";
import { listEnabledTemplates, recordRelist, isSubscriptionActive, getSubscription } from "./db";
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

  // Every 2 minutes, scan enabled templates and relist any whose tokens have
  // no active listing — but ONLY for tokens with an active paid subscription.
  // Strict expiry: once expires_at passes, this token is silently skipped
  // until the user pays again to extend. Never auto-renews past paid term.
  cron.schedule("*/2 * * * *", async () => {
    try {
      const templates = listEnabledTemplates();
      if (templates.length === 0) return;
      let active = 0;
      let skippedNoSub = 0;
      for (const t of templates) {
        if (!isSubscriptionActive(t.token_id)) {
          skippedNoSub += 1;
          continue;
        }
        active += 1;
        const { success, txHash, error } = await maybeRelist(t);
        if (error === "already-active") continue;
        recordRelist(t.token_id, txHash, success, success ? null : error);
        if (success) {
          const sub = getSubscription(t.token_id);
          const daysLeft = sub
            ? Math.max(0, Math.floor((sub.expires_at - Date.now() / 1000) / 86400))
            : 0;
          console.log(`[autorenew] relisted #${t.token_id} tx=${txHash} (${daysLeft}d sub left)`);
        } else {
          console.warn(`[autorenew] failed #${t.token_id}: ${error}`);
        }
      }
      if (active === 0 && skippedNoSub > 0) {
        // Quiet log so it's obvious that templates exist but none are paid
        console.log(`[autorenew] tick · 0 active subscriptions (${skippedNoSub} templates without paid sub)`);
      } else if (active > 0) {
        console.log(`[autorenew] tick · ${active} active${skippedNoSub ? ` (${skippedNoSub} unpaid skipped)` : ""}`);
      }
    } catch (err) {
      console.error("[autorenew] cron error:", err);
    }
  });
}
