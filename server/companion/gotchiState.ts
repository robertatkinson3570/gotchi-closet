import type { PersonalityInput } from "../../src/lib/companion/types";

// Base core subgraph (same endpoint used by server/lending/relist.ts).
const CORE_SUBGRAPH =
  process.env.COMPANION_CORE_SUBGRAPH ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const QUERY = `query($id: ID!){
  aavegotchi(id: $id){
    name numericTraits modifiedNumericTraits withSetsNumericTraits
    kinship level createdAt equippedWearables
    owner { id }
  }
}`;

function nums(a: unknown): number[] | undefined {
  return Array.isArray(a) ? a.map((x) => Number(x)) : undefined;
}

export interface GotchiState extends PersonalityInput {
  equippedWearables: number[];
  owner?: string;
}

export async function fetchGotchiState(tokenId: string): Promise<GotchiState | null> {
  try {
    const res = await fetch(CORE_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: String(tokenId) } }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const g = json?.data?.aavegotchi;
    if (!g) return null;
    return {
      name: g.name || `Gotchi #${tokenId}`,
      numericTraits: nums(g.numericTraits) ?? [50, 50, 50, 50, 0, 0],
      modifiedNumericTraits: nums(g.modifiedNumericTraits),
      withSetsNumericTraits: nums(g.withSetsNumericTraits),
      kinship: g.kinship != null ? Number(g.kinship) : undefined,
      level: g.level != null ? Number(g.level) : undefined,
      createdAt: g.createdAt != null ? Number(g.createdAt) : undefined,
      equippedWearables: nums(g.equippedWearables) ?? [],
      owner: g.owner?.id ? String(g.owner.id).toLowerCase() : undefined,
    };
  } catch {
    return null;
  }
}
