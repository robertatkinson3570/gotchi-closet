import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  REALM_DIAMOND_BASE,
  REALM_FACET_ABI,
  ALCHEMICA_TOKENS_BASE,
  CHANNEL_COOLDOWN_SEC,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

// Gotchiverse (land) subgraph on Base. The app's urql client points at the
// core subgraph, which doesn't index parcels — so query this one directly.
const GOTCHIVERSE_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn";

// claimAllAvailableAlchemica with the full parcel set can exceed the block gas
// limit, so claims are sent in batches. Each batch is one wallet signature.
const CLAIM_BATCH = 20;

export type TxStep = "idle" | "submitting" | "confirming" | "success" | "error";

async function fetchParcelIds(owner: string): Promise<bigint[]> {
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($o:Bytes!){parcels(first:500,where:{owner:$o}){tokenId}}`,
      variables: { o: owner.toLowerCase() },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return (json.data?.parcels ?? []).map((p: { tokenId: string }) => BigInt(p.tokenId));
}

/**
 * Enumerate the connected owner's parcels, read each parcel's claimable
 * reservoir alchemica, and expose a one-click batched claim that sweeps every
 * non-empty reservoir to the owner's wallet (signed in the browser wallet).
 *
 * `claimerGotchiId` must be a gotchi the owner controls; on owner-only parcels
 * any owned gotchi works, including ones currently locked in a rental.
 */
export function useLandAlchemica(claimerGotchiId?: number) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<TxStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const parcelsQuery = useQuery({
    queryKey: ["land-parcels", address?.toLowerCase()],
    queryFn: () => fetchParcelIds(address as string),
    enabled: !!address,
    staleTime: 30_000,
  });
  const parcelIds = parcelsQuery.data ?? [];

  // Multicall getAvailableAlchemica for every parcel (Base has Multicall3).
  const availContracts = useMemo(
    () =>
      parcelIds.map((id) => ({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getAvailableAlchemica" as const,
        args: [id] as const,
        chainId: BASE_CHAIN_ID,
      })),
    [parcelIds]
  );
  const { data: availData, refetch } = useReadContracts({
    contracts: availContracts,
    query: { enabled: availContracts.length > 0 },
  });

  // Per-parcel channeling cooldown: read each parcel's last-channeled
  // timestamp (Multicall3) and derive when it can next be channeled.
  const channeledContracts = useMemo(
    () =>
      parcelIds.map((id) => ({
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName: "getParcelLastChanneled" as const,
        args: [id] as const,
        chainId: BASE_CHAIN_ID,
      })),
    [parcelIds]
  );
  const { data: channeledData } = useReadContracts({
    contracts: channeledContracts,
    query: { enabled: channeledContracts.length > 0 },
  });

  // Unix-seconds timestamp at which each parcel can next be channeled
  // (lastChanneled + cooldown). 0 / never-channeled parcels are ready now.
  const nextChannelTimes = useMemo<number[]>(() => {
    if (!channeledData) return [];
    return channeledData.map((r) => {
      if (r.status !== "success") return 0;
      const last = Number(r.result as bigint);
      return last > 0 ? last + CHANNEL_COOLDOWN_SEC : 0;
    });
  }, [channeledData]);

  const { claimable, totalsBySymbol } = useMemo(() => {
    const claimable: bigint[] = [];
    const totals: Record<string, bigint> = {};
    if (availData) {
      availData.forEach((r, i) => {
        if (r.status !== "success") return;
        const amounts = r.result as readonly bigint[];
        if (amounts.some((v) => v > 0n)) claimable.push(parcelIds[i]);
        ALCHEMICA_TOKENS_BASE.forEach((tk, j) => {
          totals[tk.symbol] = (totals[tk.symbol] ?? 0n) + (amounts[j] ?? 0n);
        });
      });
    }
    return { claimable, totalsBySymbol: totals };
  }, [availData, parcelIds]);

  const send = useCallback(async () => {
    if (!isConnected || !address || claimable.length === 0) return;
    if (!claimerGotchiId) {
      setStep("error");
      setErrorMsg("No gotchi found in this wallet to claim with.");
      return;
    }
    const batches: bigint[][] = [];
    for (let i = 0; i < claimable.length; i += CLAIM_BATCH) {
      batches.push(claimable.slice(i, i + CLAIM_BATCH));
    }
    setErrorMsg(null);
    setProgress({ done: 0, total: batches.length });
    try {
      for (let b = 0; b < batches.length; b++) {
        setStep("submitting");
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "claimAllAvailableAlchemica",
          args: [batches[b], BigInt(claimerGotchiId), "0x"],
        });
        setStep("confirming");
        await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1 });
        setProgress({ done: b + 1, total: batches.length });
      }
      setStep("success");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["land-parcels", address.toLowerCase()] });
    } catch (e) {
      setStep("error");
      setErrorMsg(parseRevert(e));
    }
  }, [isConnected, address, claimable, claimerGotchiId, writeContractAsync, publicClient, refetch, queryClient]);

  const reset = useCallback(() => {
    setStep("idle");
    setErrorMsg(null);
    setProgress(null);
  }, []);

  return {
    parcelCount: parcelIds.length,
    claimableCount: claimable.length,
    totalsBySymbol,
    nextChannelTimes,
    isLoading: parcelsQuery.isLoading,
    send,
    step,
    errorMsg,
    progress,
    reset,
    isOnBase,
    address,
  };
}
