import { env } from "@/lib/env";

/**
 * Subgraph failover (Phase 1.5 of the subgraph-mirror runbook).
 *
 * Makes GotchiCloset resilient to the primary (Goldsky) subgraph going down or
 * silently stalling, by routing to a backup endpoint. Two mechanisms:
 *   1. Per-request hard fallback (`failoverFetch`) — on a network/HTTP error,
 *      retry the alternate endpoint once.
 *   2. Background freshness poll (`startHealthPolling`) — every ~45s, probe both
 *      endpoints' `_meta` block and route to the freshest healthy one. Because the
 *      two endpoints mirror the same chain, a *silent stall* is detected by
 *      comparing their block heights to each other (no chain-head lookup needed).
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

const PRIMARY = env.gotchiSubgraphUrl;
const BACKUP = env.gotchiSubgraphUrlBackup; // "" when unconfigured

let activeUrl = PRIMARY;

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

/** Re-probe both endpoints and update the active URL. Returns the new active URL. */
export async function refreshActiveUrl(): Promise<string> {
  if (!BACKUP) {
    activeUrl = PRIMARY;
    return activeUrl;
  }
  const [p, b] = await Promise.all([probeHealth(PRIMARY), probeHealth(BACKUP)]);
  activeUrl = chooseUrl(p, b);
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
