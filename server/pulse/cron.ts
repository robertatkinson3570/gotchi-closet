import cron from "node-cron";
import { ensureStarted, nightlyRefresh } from "./service";

let started = false;

export function startPulseCron() {
  if (started) return;
  started = true;
  // Kick the initial backfill (or instant disk load) without blocking boot.
  ensureStarted();
  // 03:10 UTC nightly: re-settle recent days + take forward-accruing snapshots.
  cron.schedule(
    "10 3 * * *",
    () => {
      nightlyRefresh().catch((err) => console.error("[pulse] nightly refresh failed:", err));
    },
    { timezone: "UTC" }
  );
}
