import { createClient, cacheExchange, fetchExchange } from "urql";
import { env } from "@/lib/env";
import { failoverFetch, startHealthPolling } from "./subgraphFailover";

export const client = createClient({
  url: env.gotchiSubgraphUrl,
  // Route through the failover fetch so a stalled/down primary auto-fails-over to the
  // backup mirror. No-op when VITE_GOTCHI_SUBGRAPH_URL_BACKUP is unset.
  fetch: failoverFetch,
  exchanges: [cacheExchange, fetchExchange],
});

// Begin background freshness polling (browser-only; no-op without a backup configured).
startHealthPolling();

