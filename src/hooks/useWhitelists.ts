import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { client } from "@/graphql/client";
import { WHITELISTS_FOR_ADDRESS } from "@/graphql/lendingQueries";

export type WhitelistRef = {
  id: string;
  name: string | null;
  ownerAddress: string;
  maxBorrowLimit: number | null;
};

type State = {
  asMember: WhitelistRef[];
  asOwner: WhitelistRef[];
  loading: boolean;
  error: string | null;
};

const initial: State = { asMember: [], asOwner: [], loading: false, error: null };

const cache = new Map<string, { ts: number; data: State }>();
const CACHE_TTL_MS = 60_000;

export function useWhitelistsForAddress(address: string | null | undefined) {
  const [state, setState] = useState<State>(initial);

  useEffect(() => {
    if (!address) {
      setState(initial);
      return;
    }
    const lower = address.toLowerCase();
    const cached = cache.get(lower);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setState(cached.data);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    client
      .query(WHITELISTS_FOR_ADDRESS, { address: lower })
      .toPromise()
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setState({ asMember: [], asOwner: [], loading: false, error: res.error.message });
          return;
        }
        const transform = (rows: any[] | undefined): WhitelistRef[] =>
          (rows ?? []).map((r) => ({
            id: String(r.id),
            name: r.name ?? null,
            ownerAddress: String(r.ownerAddress ?? ""),
            maxBorrowLimit: r.maxBorrowLimit != null ? Number(r.maxBorrowLimit) : null,
          }));
        const next: State = {
          asMember: transform(res.data?.asMember),
          asOwner: transform(res.data?.asOwner),
          loading: false,
          error: null,
        };
        cache.set(lower, { ts: Date.now(), data: next });
        setState(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          asMember: [],
          asOwner: [],
          loading: false,
          error: err?.message || "Failed to load whitelists",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return state;
}

export function useMyWhitelistMemberIds(): Set<string> | null {
  const { address } = useAccount();
  const { asMember } = useWhitelistsForAddress(address ?? null);
  if (!address) return null;
  return new Set(asMember.map((w) => w.id));
}
