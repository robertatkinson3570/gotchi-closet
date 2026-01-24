import { fetchGotchisByOwner } from "@/graphql/fetchers";
import type { Gotchi } from "@/types";
import { useQuery } from "@tanstack/react-query";

type GotchiFetchState = {
  gotchis: Gotchi[];
  isLoading: boolean;
  error?: string;
};

const EMPTY_GOTCHIS: Gotchi[] = [];

export function useGotchisByOwner(owner?: string): GotchiFetchState {
  const query = useQuery<Gotchi[]>({
    queryKey: ["gotchis", owner],
    queryFn: () => fetchGotchisByOwner(owner as string),
    enabled: !!owner,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
    placeholderData: EMPTY_GOTCHIS,
  });

  return {
    gotchis: query.data ?? EMPTY_GOTCHIS,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : undefined,
  };
}

