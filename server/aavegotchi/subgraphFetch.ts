/**
 * Server-side subgraph fetch with primary -> backup failover (Phase 1.5, server half).
 *
 * Mirrors the client failover (src/graphql/subgraphFailover.ts) for the Express
 * routes that query the core subgraph directly (lending auto-renew, companion state).
 * POSTs to the primary endpoint; on a network error or non-ok HTTP status, retries
 * the backup once. Callers keep their own GraphQL-error handling on the returned
 * Response. With `SUBGRAPH_URL_BACKUP` unset, this is a no-op (single request).
 */

const ENV_PRIMARY =
  process.env.SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const ENV_BACKUP = process.env.SUBGRAPH_URL_BACKUP || "";

export async function subgraphFetch(
  body: unknown,
  opts: { primary?: string; backup?: string } = {}
): Promise<Response> {
  const primary = opts.primary ?? ENV_PRIMARY;
  const backup = opts.backup ?? ENV_BACKUP;
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
  try {
    const res = await fetch(primary, init);
    if (res.ok || !backup) return res;
    return await fetch(backup, init); // hard HTTP error + backup configured
  } catch (err) {
    if (backup) {
      try {
        return await fetch(backup, init);
      } catch {
        /* fall through to original error */
      }
    }
    throw err;
  }
}
