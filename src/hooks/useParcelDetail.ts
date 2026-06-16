import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";

import { GOTCHIVERSE_SUBGRAPH, CORE_SUBGRAPH } from "@/lib/subgraph";

// Last Baazaar sale of the parcel (ERC721 category 4 = realm).
async function fetchLastSale(tokenId: string): Promise<{ priceGhst: number; time: number } | null> {
  const res = await fetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($t:String!){ erc721Listings(first:1, where:{tokenId:$t, category:4, timePurchased_gt:0}, orderBy:timePurchased, orderDirection:desc){ priceInWei timePurchased } }`,
      variables: { t: tokenId },
    }),
  });
  const json = await res.json();
  const l = json.data?.erc721Listings?.[0];
  if (!l) return null;
  return { priceGhst: Number(BigInt(l.priceInWei) / 10n ** 18n), time: Number(l.timePurchased) };
}

export type Placed = {
  installationId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  category: number; // installationType: 0 altar, 1 harvester, 2 reservoir, 3 lodge, 6 maker; -1 tile/other
  alch: number; // alchemicaType: 0 FUD, 1 FOMO, 2 ALPHA, 3 KEK; -1 none
  level: number;
};

export type ParcelDetail = {
  tokenId: string;
  parcelId: string;
  name: string; // custom on-chain parcelAddress, e.g. "generating-very-closer"
  district: string;
  size: number;
  x: string;
  y: string;
  surveyRound: number;
  boosts: { fud: number; fomo: number; alpha: number; kek: number };
  remaining: bigint[];
  available: bigint[];
  harvestRate: bigint[];
  capacity: bigint[];
  totalClaimed: bigint[];
  lastChanneled: number;
  accessChanneling: number | null;
  accessReservoir: number | null;
  owner: string;
  rounds: { round: number; amounts: bigint[] }[]; // per surveyed round
  surveying: boolean; // VRF survey in progress
  lastSale: { priceGhst: number; time: number } | null;
  installations: Placed[];
  tiles: Placed[];
};

async function fetchParcelGraph(parcelId: string) {
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($p:ID!,$ps:String!){
        parcel(id:$p){ tokenId parcelId district size coordinateX coordinateY surveyRound
          remainingAlchemica equippedInstallationsBalance equippedTilesBalance
          fudBoost fomoBoost alphaBoost kekBoost }
        installations(first:200, where:{parcel:$ps, equipped:true}){ id x y type{ id name width height installationType alchemicaType level } }
        tiles(first:200, where:{parcel:$ps, equipped:true}){ id x y type{ id name width height } }
      }`,
      variables: { p: parcelId, ps: parcelId },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

const toPlaced = (arr: any[]): Placed[] =>
  (arr ?? []).map((i) => ({
    installationId: i.type.id,
    name: i.type.name,
    x: Number(i.x),
    y: Number(i.y),
    w: Number(i.type.width) || 1,
    h: Number(i.type.height) || 1,
    category: i.type.installationType != null ? Number(i.type.installationType) : -1,
    alch: i.type.alchemicaType != null ? Number(i.type.alchemicaType) : -1,
    level: Number(i.type.level) || 1,
  }));
const arr4 = (r: any): bigint[] =>
  r?.status === "success" ? (r.result as readonly bigint[]).slice() : [0n, 0n, 0n, 0n];

/**
 * Everything the citaadel parcel page shows, sourced on-site: subgraph metadata
 * (size, coords, boosts, equipped installations/tiles) + Realm getters
 * (available reservoir, harvest rates, capacities, total claimed, last channel,
 * access rights). No external links / scraping.
 */
export function useParcelDetail(parcelId: string | null) {
  const graphQuery = useQuery({
    queryKey: ["parcel-detail", parcelId],
    queryFn: () => fetchParcelGraph(parcelId as string),
    enabled: !!parcelId,
    staleTime: 20_000,
  });

  const saleQuery = useQuery({
    queryKey: ["parcel-last-sale", parcelId],
    queryFn: () => fetchLastSale(parcelId as string),
    enabled: !!parcelId,
    staleTime: 60_000,
  });

  const reads = useMemo(() => {
    if (!parcelId) return [];
    const id = BigInt(parcelId);
    const base = { address: REALM_DIAMOND_BASE, abi: REALM_FACET_ABI, chainId: BASE_CHAIN_ID } as const;
    return [
      { ...base, functionName: "getAvailableAlchemica", args: [id] },
      { ...base, functionName: "getHarvestRates", args: [id] },
      { ...base, functionName: "getCapacities", args: [id] },
      { ...base, functionName: "getTotalClaimed", args: [id] },
      { ...base, functionName: "getParcelLastChanneled", args: [id] },
      { ...base, functionName: "getParcelsAccessRights", args: [[id], [0n]] },
      { ...base, functionName: "getParcelsAccessRights", args: [[id], [1n]] },
      { ...base, functionName: "getParcelInfo", args: [id] },
      ...Array.from({ length: 10 }, (_, r) => ({ ...base, functionName: "getRoundAlchemica", args: [id, BigInt(r)] })),
      { ...base, functionName: "isSurveying", args: [id] },
    ];
  }, [parcelId]);

  const { data: chain, isLoading: chainLoading } = useReadContracts({
    contracts: reads as any,
    query: { enabled: reads.length > 0 },
  });

  const detail = useMemo<ParcelDetail | null>(() => {
    const p = graphQuery.data?.parcel;
    if (!p) return null;
    const accessOf = (r: any): number | null =>
      r?.status === "success" ? Number((r.result as readonly bigint[])[0]) : null;
    return {
      tokenId: p.tokenId,
      parcelId: p.parcelId,
      name:
        chain?.[7]?.status === "success"
          ? ((chain[7].result as { parcelAddress?: string }).parcelAddress ?? "")
          : "",
      district: p.district,
      size: Number(p.size),
      x: p.coordinateX,
      y: p.coordinateY,
      surveyRound: p.surveyRound,
      boosts: {
        fud: Number(p.fudBoost ?? 0),
        fomo: Number(p.fomoBoost ?? 0),
        alpha: Number(p.alphaBoost ?? 0),
        kek: Number(p.kekBoost ?? 0),
      },
      remaining: (p.remainingAlchemica ?? []).map((v: string) => BigInt(v)),
      available: arr4(chain?.[0]),
      harvestRate: arr4(chain?.[1]),
      capacity: arr4(chain?.[2]),
      totalClaimed: arr4(chain?.[3]),
      lastChanneled: chain?.[4]?.status === "success" ? Number(chain[4].result as bigint) : 0,
      accessChanneling: accessOf(chain?.[5]),
      accessReservoir: accessOf(chain?.[6]),
      owner:
        chain?.[7]?.status === "success" ? ((chain[7].result as { owner?: string }).owner ?? "") : "",
      rounds: Array.from({ length: 10 }, (_, r) => {
        const res = chain?.[8 + r];
        if (res?.status !== "success") return null;
        const amounts = (res.result as readonly bigint[]).slice();
        if (!amounts.some((v) => v > 0n)) return null;
        return { round: r + 1, amounts };
      }).filter(Boolean) as { round: number; amounts: bigint[] }[],
      surveying: chain?.[18]?.status === "success" ? Boolean(chain[18].result) : false,
      lastSale: saleQuery.data ?? null,
      installations: toPlaced(graphQuery.data?.installations),
      tiles: toPlaced(graphQuery.data?.tiles),
    };
  }, [graphQuery.data, chain, saleQuery.data]);

  return {
    detail,
    isLoading: graphQuery.isLoading || chainLoading,
    error: graphQuery.error ? (graphQuery.error as Error).message : undefined,
  };
}
