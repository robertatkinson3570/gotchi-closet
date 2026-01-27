import { searchGotchis } from "@/graphql/fetchers";
import type { Gotchi } from "@/types";
import { useQuery } from "@tanstack/react-query";

type GotchiSearchState = {
  results: Gotchi[];
  isLoading: boolean;
  error?: string;
};

const EMPTY_RESULTS: Gotchi[] = [];

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error).message?.toLowerCase() || "";
  return msg.includes("abort") || msg.includes("cancel");
}

export function useGotchiSearch(search: string, enabled: boolean = true): GotchiSearchState {
  const trimmed = search.trim();
  
  const query = useQuery<Gotchi[]>({
    queryKey: ["gotchi-search", trimmed],
    queryFn: () => searchGotchis(trimmed, 10),
    enabled: enabled && trimmed.length >= 2,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (isAbortError(error)) return false;
      return failureCount < 1;
    },
    placeholderData: EMPTY_RESULTS,
  });

  const error = query.error && !isAbortError(query.error) 
    ? (query.error as Error).message 
    : undefined;

  return {
    results: query.data ?? EMPTY_RESULTS,
    isLoading: query.isLoading && trimmed.length >= 2,
    error,
  };
}
