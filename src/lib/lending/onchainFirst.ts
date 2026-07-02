/** Shape of one wagmi/viem multicall entry we care about. */
type MulticallRead = { status: "success" | "failure"; result?: unknown } | undefined;

/**
 * Resolve a unix-seconds timestamp preferring a successful on-chain read over
 * the subgraph's value. The gotchiverse subgraph can lag hours behind chain
 * head, so cooldown gates (reservoir empty / channel) driven by subgraph
 * timestamps show actions as "ready" that the contract will revert — the chain
 * value is authoritative whenever the read succeeded (even when it's 0).
 */
export function onchainFirstSeconds(read: MulticallRead, subgraphValue?: string | number): number {
  if (read?.status === "success") return Number(read.result as bigint);
  return Number(subgraphValue) || 0;
}
