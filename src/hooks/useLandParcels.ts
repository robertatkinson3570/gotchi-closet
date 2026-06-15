import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";

const GOTCHIVERSE_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";

export type ParcelRow = {
  tokenId: string;
  parcelId: string;
  name: string; // custom on-chain parcelAddress
  district: string;
  size: number;
  x: string;
  y: string;
  surveyRound: number;
  installations: number;
  tiles: number;
  remaining: bigint[]; // in-ground [FUD,FOMO,ALPHA,KEK]
  available: bigint[]; // claimable-now reservoir [FUD,FOMO,ALPHA,KEK]
  lastChanneled: number; // unix seconds (0 = never)
  channelAccess: number; // access mode for channeling (0 owner..)
  reservoirAccess: number; // access mode for emptying reservoirs
  lastClaimed: number; // unix seconds reservoirs last emptied (0 = never)
};

type RawParcel = {
  tokenId: string;
  parcelId: string;
  district: string;
  size: string;
  coordinateX: string;
  coordinateY: string;
  surveyRound: number;
  remainingAlchemica: string[];
  equippedInstallationsBalance: string;
  equippedTilesBalance: string;
};

// Parcel size code -> human label.
export const PARCEL_SIZE_LABEL: Record<number, string> = {
  0: "Humble",
  1: "Reasonable",
  2: "Spacious",
  3: "Spacious",
};

async function fetchParcels(owner: string): Promise<RawParcel[]> {
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($o:Bytes!){ parcels(first:500, orderBy: tokenId, where:{owner:$o}){
        tokenId parcelId district size coordinateX coordinateY surveyRound
        remainingAlchemica equippedInstallationsBalance equippedTilesBalance } }`,
      variables: { o: owner.toLowerCase() },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data?.parcels ?? [];
}

/**
 * Full per-parcel detail for the land management page: subgraph metadata +
 * on-chain claimable reservoir (getAvailableAlchemica) and last-channel
 * timestamp (getParcelLastChanneled), batched through Multicall3.
 *
 * Uses the same react-query key as the claim bar so the subgraph fetch is
 * shared, not duplicated.
 */
export function useLandParcels(owner?: string) {
  const parcelsQuery = useQuery({
    queryKey: ["land-parcels", owner?.toLowerCase()],
    queryFn: () => fetchParcels(owner as string),
    enabled: !!owner,
    staleTime: 30_000,
  });
  const raw = parcelsQuery.data ?? [];
  const ids = useMemo(() => raw.map((p) => BigInt(p.tokenId)), [raw]);

  const reads = useMemo(() => {
    const out: any[] = [];
    for (const id of ids) {
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getAvailableAlchemica",
        args: [id],
        chainId: BASE_CHAIN_ID,
      });
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getParcelLastChanneled",
        args: [id],
        chainId: BASE_CHAIN_ID,
      });
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getParcelInfo",
        args: [id],
        chainId: BASE_CHAIN_ID,
      });
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getParcelsAccessRights",
        args: [[id], [0n]], // channeling
        chainId: BASE_CHAIN_ID,
      });
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getParcelsAccessRights",
        args: [[id], [1n]], // empty reservoir
        chainId: BASE_CHAIN_ID,
      });
      out.push({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "lastClaimedAlchemica",
        args: [id],
        chainId: BASE_CHAIN_ID,
      });
    }
    return out;
  }, [ids]);

  const { data: chain, refetch, isLoading: chainLoading } = useReadContracts({
    contracts: reads,
    query: { enabled: reads.length > 0 },
  });

  const rows = useMemo<ParcelRow[]>(() => {
    const accessOf = (r: any): number =>
      r?.status === "success" ? Number((r.result as readonly bigint[])[0] ?? 0n) : 0;
    return raw.map((p, i) => {
      const avail = chain?.[i * 6];
      const last = chain?.[i * 6 + 1];
      const info = chain?.[i * 6 + 2];
      const accessCh = chain?.[i * 6 + 3];
      const accessRsv = chain?.[i * 6 + 4];
      const claimed = chain?.[i * 6 + 5];
      const available =
        avail?.status === "success"
          ? (avail.result as readonly bigint[]).slice()
          : [0n, 0n, 0n, 0n];
      const lastChanneled =
        last?.status === "success" ? Number(last.result as bigint) : 0;
      const name =
        info?.status === "success"
          ? ((info.result as { parcelAddress?: string }).parcelAddress ?? "")
          : "";
      return {
        tokenId: p.tokenId,
        parcelId: p.parcelId,
        name,
        channelAccess: accessOf(accessCh),
        reservoirAccess: accessOf(accessRsv),
        lastClaimed: claimed?.status === "success" ? Number(claimed.result as bigint) : 0,
        district: p.district,
        size: Number(p.size),
        x: p.coordinateX,
        y: p.coordinateY,
        surveyRound: p.surveyRound,
        installations: Number(p.equippedInstallationsBalance),
        tiles: Number(p.equippedTilesBalance),
        remaining: (p.remainingAlchemica ?? []).map((v) => BigInt(v)),
        available,
        lastChanneled,
      };
    });
  }, [raw, chain]);

  return {
    rows,
    isLoading: parcelsQuery.isLoading || chainLoading,
    error: parcelsQuery.error ? (parcelsQuery.error as Error).message : undefined,
    refetch,
  };
}
