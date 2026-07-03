/**
 * Kinship / XP leaderboard reads over the core subgraph.
 * Community ask (Discord general-chat 2026-06-29): "is there even a way to
 * see a kinship leaderboard?" — this module answers it with one query.
 */
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";

export type LeaderboardSort = "kinship" | "experience";
export const LEADERBOARD_PAGE_SIZE = 100;

export type LeaderboardRow = {
  id: string;
  gotchiId: string;
  name: string;
  kinship: number;
  experience: number;
  level: number;
  /** unix seconds of the last pet; 0 when never interacted */
  lastInteracted: number;
  owner: string;
};

/** Pure query builder (unit-tested). status:3 = summoned gotchis only. */
export function buildLeaderboardQuery(sort: LeaderboardSort, first: number, skip: number): string {
  return `{ aavegotchis(first:${first}, skip:${skip}, where:{ status:3 }, orderBy:${sort}, orderDirection:desc){ id gotchiId name kinship experience level lastInteracted owner { id } } }`;
}

export async function fetchLeaderboard(sort: LeaderboardSort, page: number): Promise<LeaderboardRow[]> {
  const query = buildLeaderboardQuery(sort, LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE);
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors[0]?.message ?? "subgraph error");
  return (j.data?.aavegotchis ?? []).map((g: any): LeaderboardRow => ({
    id: String(g.id),
    gotchiId: String(g.gotchiId ?? g.id),
    name: g.name || `Gotchi #${g.gotchiId ?? g.id}`,
    kinship: Number(g.kinship ?? 0),
    experience: Number(g.experience ?? 0),
    level: Number(g.level ?? 0),
    lastInteracted: Number(g.lastInteracted ?? 0),
    owner: g.owner?.id ?? "",
  }));
}
