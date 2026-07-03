import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";

/** A wallet's balance of a single wearable, for the "Top holders" section. */
export type HolderRow = { owner: string; balance: number };

const TOP_HOLDERS_QUERY = `
  query TopHolders($id: String!) {
    itemTypeOwnerships(
      first: 10
      where: { itemType: $id, balance_gt: 0 }
      orderBy: balance
      orderDirection: desc
    ) {
      owner
      balance
    }
  }
`;

/** Top 10 wallets holding a wearable, ordered by balance descending. */
export async function fetchTopHolders(wearableId: number): Promise<HolderRow[]> {
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: TOP_HOLDERS_QUERY,
      variables: { id: String(wearableId) },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  const rows: Array<{ owner: string; balance: string }> = json.data?.itemTypeOwnerships ?? [];
  return rows.map((r) => ({ owner: r.owner, balance: Number(r.balance) }));
}

const OWNED_BALANCES_QUERY = `
  query OwnedWearableBalances($owner: String!) {
    itemTypeOwnerships(first: 1000, where: { owner: $owner, balance_gt: 0 }) {
      itemType { id }
      balance
    }
  }
`;

/** Every wearable (and its balance) a wallet currently holds. */
export async function fetchOwnedWearableBalances(owner: string): Promise<Map<number, number>> {
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: OWNED_BALANCES_QUERY,
      variables: { owner: owner.toLowerCase() },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  const rows: Array<{ itemType: { id: string }; balance: string }> = json.data?.itemTypeOwnerships ?? [];
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(Number(r.itemType.id), Number(r.balance));
  }
  return map;
}
