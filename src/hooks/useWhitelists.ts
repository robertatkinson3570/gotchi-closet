import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { client } from "@/graphql/client";
import { WHITELISTS_FOR_ADDRESS } from "@/graphql/lendingQueries";
import { qk } from "@/lib/queryKeys";
import { queryClient } from "@/lib/queryClient";

export type WhitelistRef = {
  id: string;
  name: string | null;
  ownerAddress: string;
  maxBorrowLimit: number | null;
};

type WhitelistsData = { asMember: WhitelistRef[]; asOwner: WhitelistRef[] };

export function invalidateWhitelistsCache(address?: string) {
  queryClient.invalidateQueries({
    queryKey: address ? qk.whitelists(address.toLowerCase()) : qk.whitelists(),
  });
}

const transform = (rows: any[] | undefined): WhitelistRef[] =>
  (rows ?? []).map((r) => ({
    id: String(r.id),
    name: r.name ?? null,
    ownerAddress: String(r.ownerAddress ?? ""),
    maxBorrowLimit: r.maxBorrowLimit != null ? Number(r.maxBorrowLimit) : null,
  }));

async function fetchWhitelists(lower: string): Promise<WhitelistsData> {
  const res = await client.query(WHITELISTS_FOR_ADDRESS, { address: lower }).toPromise();
  if (res.error) throw new Error(res.error.message);
  return {
    asMember: transform(res.data?.asMember),
    asOwner: transform(res.data?.asOwner),
  };
}

export function useWhitelistsForAddress(address: string | null | undefined) {
  const lower = address ? address.toLowerCase() : null;
  const { data, isLoading, error } = useQuery({
    queryKey: qk.whitelists(lower),
    queryFn: () => fetchWhitelists(lower!),
    enabled: !!lower,
    staleTime: 60_000,
  });
  return {
    asMember: data?.asMember ?? [],
    asOwner: data?.asOwner ?? [],
    loading: !!lower && isLoading,
    error: error ? (error as Error).message : null,
  };
}

export function useMyWhitelistMemberIds(): Set<string> | null {
  const { address } = useAccount();
  const { asMember } = useWhitelistsForAddress(address ?? null);
  if (!address) return null;
  return new Set(asMember.map((w) => w.id));
}
