import { createClient, cacheExchange, fetchExchange } from "urql";

const subgraphUrl =
  import.meta.env.VITE_GOTCHI_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

export const client = createClient({
  url: subgraphUrl,
  exchanges: [cacheExchange, fetchExchange],
});

