import { env } from "@/lib/env";

/**
 * Subgraph failover (Phase 1.5 of the subgraph-mirror runbook).
 *
 * Makes GotchiCloset resilient to the primary (Goldsky) subgraph going down or
 * silently stalling, by routing to a backup endpoint. Two mechanisms:
 *   1. Per-request hard fallback (`failoverFetch`) — on a network/HTTP error,
 *      retry the alternate endpoint once.
 *   2. Background freshness poll (`startHealthPolling`) — every ~45s, probe both
 *      endpoints' `_meta` block and pick the freshest healthy one as active. This
 *      catches the *silent stall* case (a subgraph that stops advancing without
 *      erroring).
 *
 * With no backup configured (`VITE_GOTCHI_SUBGRAPH_URL_BACKUP` empty), this is a
 * complete no-op: the active URL is always the primary and behaviour is unchanged.
 */

/** A subgraph is "stale" if its indexed block lags the chain head by more than this. */
export const STALE_BLOCK_THRESHOLD = 25;

export interface Health {
  url: string;
  ok: boolean;
  hasErrors: boolean;
  block: number | null;
}

/**
 * Pure routing decision — which endpoint to use given each one's health.
 * Exported for unit testing.
 *
 * - No backup  -> always primary.
 * - Primary fresh -> primary.
 * - Primary unfresh but backup fresh -> backup (the failover case).
 * - Both unfresh -> the least-stale (higher block), preferring primary on a tie.
 *
 * "Fresh" = reachable, no indexing errors, has a block, and (if `chainHead` is
 * known) within STALE_BLOCK_THRESHOLD of the head.
 */
export function chooseUrl(
  primary: Health,
  backup: Health | null,
  chainHead?: number | null
): string {
  if (!backup) return primary.url;

  const fresh = (h: Health) =>
    h.ok &&
    !h.hasErrors &&
    h.block != null &&
    (chainHead == null || chainHead - h.block <= STALE_BLOCK_THRESHOLD);

  if (fresh(primary)) return primary.url;
  if (fresh(backup)) return backup.url;

  // Both unfresh: serve whoever is least behind; prefer primary on tie/unknown.
  const pb = primary.block ?? -1;
  const bb = backup.block ?? -1;
  return bb > pb ? backup.url : primary.url;
}

const PRIMARY = env.gotchiSubgraphUrl;
const BACKUP = env.gotchiSubgraphUrlBackup; // "" when unconfigured

let activeUrl = PRIMARY;

/** The endpoint the client should currently hit. */
export function getActiveSubgraphUrl(): string {
  return activeUrl;
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

/** Re-probe both endpoints and update the active URL. Returns the new active URL. */
export async function refreshActiveUrl(chainHead?: number | null): Promise<string> {
  if (!BACKUP) {
    activeUrl = PRIMARY;
    return activeUrl;
  }
  const [p, b] = await Promise.all([probeHealth(PRIMARY), probeHealth(BACKUP)]);
  activeUrl = chooseUrl(p, b, chainHead);
  return activeUrl;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start background freshness polling (browser only; no-op without a backup). */
export function startHealthPolling(intervalMs = 45_000): void {
  if (timer || !BACKUP || typeof window === "undefined") return;
  void refreshActiveUrl();
  timer = setInterval(() => void refreshActiveUrl(), intervalMs);
}

export function stopHealthPolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * urql-compatible fetch: hit the active endpoint; on a network/HTTP error, retry
 * the alternate once. `input` (urql's configured url) is ignored in favour of the
 * health-selected active URL.
 */
export const failoverFetch: typeof fetch = async (_input, init) => {
  const active = getActiveSubgraphUrl();
  const other = active === PRIMARY ? BACKUP : PRIMARY;
  try {
    const res = await fetch(active, init);
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
