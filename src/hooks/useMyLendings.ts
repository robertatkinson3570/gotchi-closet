import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { client } from "@/graphql/client";
import { MY_LENDINGS_AS_LENDER, MY_LENDINGS_AS_BORROWER } from "@/graphql/myLendingsQueries";
import { transformLending } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

// Global cache-bust counter. Bumped after any successful lending tx so the
// /lending/me page refetches without a hard refresh. Subscribers re-run their
// effect whenever the version changes.
let myLendingsVersion = 0;
const myLendingsSubscribers = new Set<() => void>();

/**
 * Bust the /lending/me cache so all `useMyLendings` consumers refetch.
 *
 * Goldsky's subgraph typically takes 5-15s to index a new lending event, so
 * we schedule three bumps (immediate, 6s, 20s) to cover most indexer lag
 * without making the user wait.
 */
export function invalidateMyLendings() {
  const bump = () => {
    myLendingsVersion += 1;
    myLendingsSubscribers.forEach((fn) => fn());
  };
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

export function useMyLendings(address: string | null | undefined) {
  const [lender, setLender] = useState<Extended[]>([]);
  const [borrower, setBorrower] = useState<Extended[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Subscribe to global invalidation so a successful tx triggers refetch.
  const [version, setVersion] = useState(myLendingsVersion);
  useEffect(() => {
    const fn = () => setVersion(myLendingsVersion);
    myLendingsSubscribers.add(fn);
    return () => {
      myLendingsSubscribers.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setLender([]);
      setBorrower([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      client.query(MY_LENDINGS_AS_LENDER, { address: address.toLowerCase() }, { requestPolicy: "network-only" }).toPromise(),
      client.query(MY_LENDINGS_AS_BORROWER, { address: address.toLowerCase() }, { requestPolicy: "network-only" }).toPromise(),
    ])
      .then(([asLender, asBorrower]) => {
        if (cancelled) return;
        if (asLender.error) {
          setError(asLender.error.message);
          setLoading(false);
          return;
        }
        if (asBorrower.error) {
          setError(asBorrower.error.message);
          setLoading(false);
          return;
        }
        setLender((asLender.data?.gotchiLendings ?? []).map(transform));
        setBorrower((asBorrower.data?.gotchiLendings ?? []).map(transform));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, version]);

  return { lender, borrower, loading, error };
}

export function useMyConnectedLendings() {
  const { address } = useAccount();
  return useMyLendings(address ?? null);
}
