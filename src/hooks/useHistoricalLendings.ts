import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { client } from "@/graphql/client";
import { HISTORICAL_LENDINGS } from "@/graphql/lendingQueries";

export type HistoricalLendingGotchi = {
  id: string;
  name: string | null;
  hauntId: number;
  level: number;
  kinship: number;
  baseRarityScore: number;
  modifiedRarityScore: number;
  withSetsRarityScore: number;
  collateral: string;
  numericTraits: number[];
  modifiedNumericTraits: number[];
  equippedWearables: number[];
};

export type HistoricalLending = {
  id: string;
  gotchiTokenId: string;
  gotchiBRS: number;
  period: number;
  upfrontCostWei: string;
  upfrontGhst: number;
  splitOwner: number;
  splitBorrower: number;
  splitOther: number;
  whitelistId: string | null;
  whitelistName: string | null;
  lender: string;
  borrower: string | null;
  cancelled: boolean;
  completed: boolean;
  channellingAllowed: boolean;
  timeAgreed: number;
  timeCreated: number;
  timeEnded: number;
  gotchiName: string | null;
  gotchiModifiedRarityScore: number;
  gotchi: HistoricalLendingGotchi | null;
};

const PAGE = 1000;
const MAX_PAGES = 6; // up to 6000 historical lendings

function normalizeArray(value: unknown, length: number): number[] {
  const arr = Array.isArray(value) ? value : [];
  const result = new Array(length).fill(0);
  for (let i = 0; i < Math.min(length, arr.length); i++) {
    result[i] = Number(arr[i]) || 0;
  }
  return result;
}

function transform(raw: any): HistoricalLending {
  const wei = String(raw.upfrontCost ?? "0");
  let ghst = 0;
  try {
    ghst = Number(BigInt(wei)) / 1e18;
  } catch {
    ghst = 0;
  }
  const g = raw.gotchi;
  return {
    id: raw.id,
    gotchiTokenId: String(raw.gotchiTokenId ?? ""),
    gotchiBRS: Number(raw.gotchiBRS ?? 0),
    period: Number(raw.period ?? 0),
    upfrontCostWei: wei,
    upfrontGhst: ghst,
    splitOwner: Number(raw.splitOwner ?? 0),
    splitBorrower: Number(raw.splitBorrower ?? 0),
    splitOther: Number(raw.splitOther ?? 0),
    whitelistId: raw.whitelistId != null ? String(raw.whitelistId) : null,
    whitelistName: raw.whitelist?.name ?? null,
    lender: String(raw.lender ?? ""),
    borrower: raw.borrower ? String(raw.borrower) : null,
    cancelled: Boolean(raw.cancelled),
    completed: Boolean(raw.completed),
    channellingAllowed: Boolean(raw.channellingAllowed),
    timeAgreed: Number(raw.timeAgreed ?? 0),
    timeCreated: Number(raw.timeCreated ?? 0),
    timeEnded: Number(raw.timeEnded ?? 0),
    gotchiName: g?.name ?? null,
    gotchiModifiedRarityScore: Number(g?.modifiedRarityScore ?? 0),
    gotchi: g
      ? {
          id: g.id,
          name: g.name ?? null,
          hauntId: Number(g.hauntId ?? 1),
          level: Number(g.level ?? 1),
          kinship: Number(g.kinship ?? 0),
          baseRarityScore: Number(g.baseRarityScore ?? 0),
          modifiedRarityScore: Number(g.modifiedRarityScore ?? 0),
          withSetsRarityScore: Number(g.withSetsRarityScore ?? 0),
          collateral: String(g.collateral ?? ""),
          numericTraits: normalizeArray(g.numericTraits, 6),
          modifiedNumericTraits: normalizeArray(g.modifiedNumericTraits, 6),
          equippedWearables: normalizeArray(g.equippedWearables, 16),
        }
      : null,
  };
}

async function fetchAll(sinceUnix: number): Promise<HistoricalLending[]> {
  const all: HistoricalLending[] = [];
  let lastId = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = await client
      .query(HISTORICAL_LENDINGS, {
        lastId,
        first: PAGE,
        since: String(sinceUnix),
      })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    const batch = result.data?.gotchiLendings ?? [];
    if (!batch.length) break;
    for (const raw of batch) all.push(transform(raw));
    if (batch.length < PAGE) break;
    lastId = batch[batch.length - 1].id;
  }
  return all;
}

export function useHistoricalLendings(days = 90) {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.historicalLendings(days),
    queryFn: () => fetchAll(Math.floor(Date.now() / 1000) - days * 24 * 60 * 60),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
  });
  return {
    lendings: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
