import { env } from "@/lib/env";

/**
 * Subgraph failover (Phase 1.5 of the subgraph-mirror runbook).
 *
 * Makes GotchiCloset resilient to the primary (Goldsky) subgraph going down or
 * silently stalling, by routing to a backup endpoint. Two mechanisms:
 *   1. Per-request hard fallback (`failoverFetch`) — on a network/HTTP error,
 *      retry the alternate endpoint once.
 *   2. Background freshness poll (`startHealthPolling`) — every ~45s, probe the
 *      primary's `_meta` block, and the backup's only when the primary looks
 *      unhealthy or stalled (the backup is a metered gateway), then route to the
 *      freshest healthy one. Because the two endpoints mirror the same chain, a
 *      *silent stall* is detected by comparing their block heights to each other
 *      (no chain-head lookup needed).
 *
 * With no backup configured (`VITE_GOTCHI_SUBGRAPH_URL_BACKUP` empty), this is a
 * complete no-op: the active URL is always the primary and behaviour is unchanged.
 */

/** Fail over if the backup leads a reachable primary by more than this many blocks. */
export const STALE_BLOCK_THRESHOLD = 25;

export interface Health {
  url: string;
  ok: boolean;
  hasErrors: boolean;
  block: number | null;
}

const reachable = (h: Health) => h.ok && !h.hasErrors && h.block != null;

/**
 * Pure routing decision (exported for unit testing). The endpoints mirror the same
 * chain, so a silently-stalled primary is caught by comparing block heights:
 *   - no backup           -> primary
 *   - both reachable      -> backup only if it leads primary by > STALE_BLOCK_THRESHOLD
 *   - one reachable       -> the reachable one
 *   - neither reachable   -> the higher block (least stale), primary on a tie
 */
export function chooseUrl(primary: Health, backup: Health | null): string {
  if (!backup) return primary.url;

  const pOk = reachable(primary);
  const bOk = reachable(backup);

  if (pOk && bOk) {
    return backup.block! - primary.block! > STALE_BLOCK_THRESHOLD
      ? backup.url
      : primary.url;
  }
  if (pOk) return primary.url;
  if (bOk) return backup.url;

  return (backup.block ?? -1) > (primary.block ?? -1) ? backup.url : primary.url;
}

/**
 * Decide whether the metered backup endpoint needs probing this cycle (exported
 * for unit testing). The backup (The Graph gateway) counts every request against
 * the monthly query quota, so it is only touched when the primary can't be
 * trusted on its own:
 *   - the active URL is already the backup (need the comparison to detect recovery)
 *   - the primary is unreachable / erroring / blockless
 *   - the primary's block number did not advance since the previous poll (silent
 *     stall — Base produces a block every ~2s, so a healthy poll window must advance)
 */
export function shouldProbeBackup(
  primary: Health,
  prevPrimaryBlock: number | null,
  activeIsPrimary: boolean
): boolean {
  if (!activeIsPrimary) return true;
  if (!reachable(primary)) return true;
  return prevPrimaryBlock != null && primary.block! <= prevPrimaryBlock;
}

const PRIMARY = env.gotchiSubgraphUrl;
const BACKUP = env.gotchiSubgraphUrlBackup; // "" when unconfigured

let activeUrl = PRIMARY;

const routingListeners = new Set<() => void>();

/**
 * Subscribe to routing changes (React: pair with `isOnBackup` in
 * `useSyncExternalStore`). Returns an unsubscribe function.
 */
export function subscribeRouting(listener: () => void): () => void {
  routingListeners.add(listener);
  return () => routingListeners.delete(listener);
}

/** True while the app is routed to the backup mirror (drives the header pill). */
export function isOnBackup(): boolean {
  return activeUrl !== PRIMARY;
}

/** Change the active endpoint, notifying subscribers only on an actual switch. */
function setActiveUrl(url: string): void {
  if (url === activeUrl) return;
  activeUrl = url;
  console.info(
    `[subgraph] routing -> ${url === PRIMARY ? "primary (Goldsky)" : "backup (The Graph Network)"}`
  );
  for (const listener of routingListeners) listener();
}

const META_QUERY = `{ _meta { block { number } hasIndexingErrors } }`;

/** Probe one endpoint's `_meta` freshness. Never throws. */
export async function probeHealth(url: string): Promise<Health> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: META_QUERY }),
    });
    if (!res.ok) return { url, ok: false, hasErrors: false, block: null };
    const json = await res.json();
    const block = Number(json?.data?._meta?.block?.number);
    const hasErrors =
      Boolean(json?.data?._meta?.hasIndexingErrors) || Array.isArray(json?.errors);
    return { url, ok: true, hasErrors, block: Number.isFinite(block) ? block : null };
  } catch {
    return { url, ok: false, hasErrors: false, block: null };
  }
}

let lastPrimaryBlock: number | null = null;

/** Re-probe endpoints (backup only when needed) and update the active URL. */
export async function refreshActiveUrl(): Promise<string> {
  if (!BACKUP) {
    setActiveUrl(PRIMARY);
    return activeUrl;
  }
  const p = await probeHealth(PRIMARY);
  const prevBlock = lastPrimaryBlock;
  if (p.block != null) lastPrimaryBlock = p.block;
  if (!shouldProbeBackup(p, prevBlock, activeUrl === PRIMARY)) {
    setActiveUrl(PRIMARY);
    return activeUrl;
  }
  const b = await probeHealth(BACKUP);
  setActiveUrl(chooseUrl(p, b));
  return activeUrl;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start background freshness polling (browser only; no-op without a backup). */
export function startHealthPolling(intervalMs = 45_000): void {
  if (timer || !BACKUP || typeof window === "undefined") return;
  void refreshActiveUrl();
  timer = setInterval(() => void refreshActiveUrl(), intervalMs);
}

/**
 * urql-compatible fetch: hit the active endpoint; on a network/HTTP error, retry
 * the alternate once. `input` (urql's configured url) is ignored in favour of the
 * health-selected active URL.
 */
export const failoverFetch: typeof fetch = async (_input, init) => {
  const other = activeUrl === PRIMARY ? BACKUP : PRIMARY;
  try {
    const res = await fetch(activeUrl, init);
    if (res.ok || !other) return res;
    return await fetch(other, init); // hard HTTP error + alternate exists
  } catch (err) {
    if (other) {
      try {
        return await fetch(other, init);
      } catch {
        /* fall through to original error */
      }
    }
    throw err;
  }
};
