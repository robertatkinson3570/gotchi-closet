import { XP_SUBGRAPH } from "@/lib/subgraph";

export type XpDropStatus = {
  dropId: string;
  amount: number;
  createdAt: number;
  claimed: boolean;
  claimedAt: number | null;
};

const QUERY = `
  query($gotchi: BigInt!, $n: Int!) {
    xpdrops(first: $n, orderBy: createdAt, orderDirection: desc) { id amount createdAt }
    claimedXPDrops(first: 100, where: { gotchi: $gotchi }) { drop { id } createdAt }
  }
`;

/** Recent XP merkle drops joined against this gotchi's claim history. */
export async function fetchXpDropStatus(gotchiId: string, recentCount = 10): Promise<XpDropStatus[]> {
  const res = await fetch(XP_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { gotchi: gotchiId, n: recentCount } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");

  const claimedAtByDropId = new Map<string, number>();
  for (const c of json.data?.claimedXPDrops ?? []) {
    const dropId = c.drop?.id;
    if (dropId) claimedAtByDropId.set(dropId, Number(c.createdAt));
  }

  return (json.data?.xpdrops ?? []).map((d: any) => {
    const claimedAt = claimedAtByDropId.get(d.id) ?? null;
    return {
      dropId: d.id,
      amount: Number(d.amount),
      createdAt: Number(d.createdAt),
      claimed: claimedAt != null,
      claimedAt,
    };
  });
}
