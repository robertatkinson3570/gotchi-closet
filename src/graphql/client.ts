import { createClient, cacheExchange, fetchExchange } from "urql";
import { env } from "@/lib/env";

export const client = createClient({
  url: env.gotchiSubgraphUrl,
  exchanges: [cacheExchange, fetchExchange],
});

