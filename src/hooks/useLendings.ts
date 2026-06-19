import { useEffect, useState } from "react";
import { client } from "@/graphql/client";
import { ACTIVE_LENDINGS } from "@/graphql/lendingQueries";
import { transformLending } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

const PAGE = 1000;
const MAX_PAGES = 4; // soft cap at 4000 active listings

type State = {
  lendings: Lending[];
  loading: boolean;
  error: string | null;
  fetchedAt: number;
};

const initialState: State = {
  lendings: [],
  loading: true,
  error: null,
  fetchedAt: 0,
};

let inflight: Promise<Lending[]> | null = null;
let cache: { data: Lending[]; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchAllActiveLendings(): Promise<Lending[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
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
    cache = { data: all, ts: Date.now() };
    inflight = null;
    return all;
  })();

  return inflight;
}

export function useLendings() {
  const [state, setState] = useState<State>(initialState);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchAllActiveLendings()
      .then((data) => {
        if (cancelled) return;
        setState({ lendings: data, loading: false, error: null, fetchedAt: Date.now() });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          lendings: [],
          loading: false,
          error: err?.message || "Failed to load lendings",
          fetchedAt: 0,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function invalidateLendingsCache() {
  cache = null;
  inflight = null; // also drop any in-flight fetch so a post-tx refetch isn't served stale data
}
