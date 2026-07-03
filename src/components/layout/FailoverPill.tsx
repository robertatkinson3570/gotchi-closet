import { useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";
import { subscribeRouting, isOnBackup } from "@/graphql/subgraphFailover";

/**
 * Header pill shown ONLY while the app is routed to the backup subgraph mirror
 * (The Graph Network). Hidden in normal operation — failover is a non-event, and
 * the point of the pill is reassurance, not alarm: our data is live even though
 * the community subgraph is degraded.
 */
export function FailoverPill() {
  const onBackup = useSyncExternalStore(subscribeRouting, isOnBackup, () => false);
  if (!onBackup) return null;
  return (
    <span
      title="The community subgraph (Goldsky) is currently degraded. GotchiCloset switched to its own mirror on The Graph Network. Data shown is live."
      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-[11px] font-medium text-sky-600 dark:text-sky-400 cursor-help"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">backup data</span>
    </span>
  );
}
