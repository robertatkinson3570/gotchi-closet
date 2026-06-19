import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { queryClient } from "@/lib/queryClient";
import { client } from "@/graphql/client";
import { ACTIVE_LENDINGS } from "@/graphql/lendingQueries";
import { transformLending } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

const PAGE = 1000;
const MAX_PAGES = 4; // soft cap at 4000 active listings

async function fetchAllActiveLendings(): Promise<Lending[]> {
  const all: Lending[] = [];
  let lastId = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = await client
      .query(ACTIVE_LENDINGS, { lastId, first: PAGE })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    const batch = result.data?.gotchiLendings ?? [];
    if (!batch.length) break;
    for (const raw of batch) {
      all.push(transformLending(raw));
    }
    if (batch.length < PAGE) break;
    lastId = batch[batch.length - 1].id;
  }
  return all;
}

export function useLendings() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.lendings(),
    queryFn: fetchAllActiveLendings,
    staleTime: 60_000,
  });
  return {
    lendings: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    fetchedAt: dataUpdatedAt,
  };
}

// Drop the cached active-lendings so a post-tx refetch isn't served stale data.
export function invalidateLendingsCache() {
  queryClient.invalidateQueries({ queryKey: qk.lendings() });
}
