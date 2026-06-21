import type { PersonalityInput } from "../../src/lib/companion/types";
import { subgraphFetch } from "../aavegotchi/subgraphFetch";

// Base core subgraph (same endpoint used by server/lending/relist.ts). A
// COMPANION_CORE_SUBGRAPH override is still honoured as the primary; failover to
// SUBGRAPH_URL_BACKUP is handled by subgraphFetch.
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
    const res = await subgraphFetch(
      { query: QUERY, variables: { id: String(tokenId) } },
      { primary: CORE_SUBGRAPH }
    );
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
