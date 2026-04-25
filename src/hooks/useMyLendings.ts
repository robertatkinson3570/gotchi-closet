import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { client } from "@/graphql/client";
import { MY_LENDINGS_AS_LENDER, MY_LENDINGS_AS_BORROWER } from "@/graphql/myLendingsQueries";
import { transformLending } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

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
      client.query(MY_LENDINGS_AS_LENDER, { address: address.toLowerCase() }).toPromise(),
      client.query(MY_LENDINGS_AS_BORROWER, { address: address.toLowerCase() }).toPromise(),
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
  }, [address]);

  return { lender, borrower, loading, error };
}

export function useMyConnectedLendings() {
  const { address } = useAccount();
  return useMyLendings(address ?? null);
}
