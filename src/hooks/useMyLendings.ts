import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { client } from "@/graphql/client";
import { MY_LENDINGS_AS_LENDER, MY_LENDINGS_AS_BORROWER } from "@/graphql/myLendingsQueries";
import { transformLending } from "@/lib/lending/transform";
import { qk } from "@/lib/queryKeys";
import { queryClient } from "@/lib/queryClient";
import type { Lending } from "@/lib/lending/types";

/**
 * Bust the /lending/me cache so all `useMyLendings` consumers refetch.
 *
 * Goldsky's subgraph typically takes 5-15s to index a new lending event, so
 * we schedule three invalidations (immediate, 6s, 20s) to cover most indexer
 * lag without making the user wait.
 */
export function invalidateMyLendings() {
  const bump = () => queryClient.invalidateQueries({ queryKey: qk.myLendings() });
  bump();
  setTimeout(bump, 6_000);
  setTimeout(bump, 20_000);
}

type Extended = Lending & {
  borrower: string | null;
  cancelled: boolean;
  completed: boolean;
  timeAgreed: number;
  timeEnded: number;
};

function transform(raw: any): Extended {
  return {
    ...transformLending(raw),
    borrower: raw.borrower ?? null,
    cancelled: Boolean(raw.cancelled),
    completed: Boolean(raw.completed),
    timeAgreed: Number(raw.timeAgreed ?? 0),
    timeEnded: Number(raw.timeEnded ?? 0),
  };
}

async function fetchMyLendings(lower: string): Promise<{ lender: Extended[]; borrower: Extended[] }> {
  const [asLender, asBorrower] = await Promise.all([
    client.query(MY_LENDINGS_AS_LENDER, { address: lower }, { requestPolicy: "network-only" }).toPromise(),
    client.query(MY_LENDINGS_AS_BORROWER, { address: lower }, { requestPolicy: "network-only" }).toPromise(),
  ]);
  if (asLender.error) throw new Error(asLender.error.message);
  if (asBorrower.error) throw new Error(asBorrower.error.message);
  return {
    lender: (asLender.data?.gotchiLendings ?? []).map(transform),
    borrower: (asBorrower.data?.gotchiLendings ?? []).map(transform),
  };
}

export function useMyLendings(address: string | null | undefined) {
  const lower = address ? address.toLowerCase() : null;
  const { data, isLoading, error } = useQuery({
    queryKey: qk.myLendings(lower),
    queryFn: () => fetchMyLendings(lower!),
    enabled: !!lower,
    // network-only equivalent: always treat as stale so a mount or a post-tx
    // invalidation refetches; the urql queries above also bypass its cache.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  return {
    lender: data?.lender ?? [],
    borrower: data?.borrower ?? [],
    loading: !!lower && isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useMyConnectedLendings() {
  const { address } = useAccount();
  return useMyLendings(address ?? null);
}
