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
  RESERVOIR_COOLDOWN_SEC,
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

type ParcelClaimInfo = { id: bigint; lastClaimed: number };

async function fetchParcelIds(owner: string): Promise<ParcelClaimInfo[]> {
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($o:Bytes!){parcels(first:500,where:{owner:$o}){tokenId lastClaimedAlchemica}}`,
      variables: { o: owner.toLowerCase() },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return (json.data?.parcels ?? []).map((p: { tokenId: string; lastClaimedAlchemica: string }) => ({
    id: BigInt(p.tokenId),
    lastClaimed: Number(p.lastClaimedAlchemica) || 0,
  }));
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
  const [channelStep, setChannelStep] = useState<TxStep>("idle");
  const [channelProgress, setChannelProgress] = useState<{ done: number; total: number } | null>(null);
  const [channelDone, setChannelDone] = useState(0);

  // NOTE: distinct key from useLandParcels' ["land-parcels", owner]. They must
  // NOT collide — this fetcher returns bigint[] while useLandParcels returns
  // parcel objects; sharing a key lets one overwrite the other's cache shape
  // and throws "Cannot convert undefined to a BigInt".
  const parcelsQuery = useQuery({
    queryKey: ["land-parcel-ids", address?.toLowerCase()],
    queryFn: () => fetchParcelIds(address as string),
    enabled: !!address,
    staleTime: 30_000,
  });
  const parcelInfo = useMemo(() => parcelsQuery.data ?? [], [parcelsQuery.data]);
  const parcelIds = useMemo(() => parcelInfo.map((p) => p.id), [parcelInfo]);

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

  // Unix-seconds timestamp at which each parcel's reservoirs can next be emptied
  // (lastClaimed + cooldown). 0 / never-claimed parcels are ready now. Lets the
  // UI show "next reservoir ready in Xh" once everything's been claimed.
  const nextReservoirTimes = useMemo<number[]>(
    () => parcelInfo.map((p) => (p.lastClaimed > 0 ? p.lastClaimed + RESERVOIR_COOLDOWN_SEC : 0)),
    [parcelInfo]
  );

  const { claimable, totalsBySymbol } = useMemo(() => {
    const claimable: bigint[] = [];
    const totals: Record<string, bigint> = {};
    const nowSec = Math.floor(Date.now() / 1000);
    if (availData) {
      availData.forEach((r, i) => {
        if (r.status !== "success") return;
        const amounts = r.result as readonly bigint[];
        // A reservoir can only be emptied once per RESERVOIR_COOLDOWN_SEC.
        // Re-claiming a parcel still on cooldown reverts, and the balance
        // re-accumulates the instant you claim — so gate on the cooldown
        // (lastClaimed + cooldown), NOT on the balance, or every parcel looks
        // "ready" forever and claim-all mostly reverts.
        const lc = parcelInfo[i]?.lastClaimed ?? 0;
        const cooldownReady = lc === 0 || lc + RESERVOIR_COOLDOWN_SEC <= nowSec;
        if (!cooldownReady) return;
        if (!amounts.some((v) => v > 0n)) return;
        claimable.push(parcelIds[i]);
        // Sum only what's actually claimable now, so the headline total matches
        // what clicking "Claim all" will sweep.
        ALCHEMICA_TOKENS_BASE.forEach((tk, j) => {
          totals[tk.symbol] = (totals[tk.symbol] ?? 0n) + (amounts[j] ?? 0n);
        });
      });
    }
    return { claimable, totalsBySymbol: totals };
  }, [availData, parcelIds, parcelInfo]);

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
    let failed = 0;
    let lastErr: unknown = null;
    for (let b = 0; b < batches.length; b++) {
      setStep(b === 0 ? "submitting" : "confirming");
      try {
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "claimAllAvailableAlchemica",
          args: [batches[b], BigInt(claimerGotchiId), "0x"],
        });
        await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1 });
      } catch (e) {
        // Don't abort the whole claim — one bad batch shouldn't strand the rest.
        failed++;
        lastErr = e;
      }
      setProgress({ done: b + 1, total: batches.length });
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: ["land-parcel-ids", address.toLowerCase()] });
    queryClient.invalidateQueries({ queryKey: ["land-parcels"] });
    if (failed >= batches.length) {
      setStep("error");
      setErrorMsg(parseRevert(lastErr));
    } else if (failed > 0) {
      setStep("error");
      setErrorMsg(`Claimed ${batches.length - failed}/${batches.length} batches; ${failed} failed (RPC/cooldown) — click again to retry the rest.`);
    } else {
      setStep("success");
    }
  }, [isConnected, address, claimable, claimerGotchiId, writeContractAsync, publicClient, refetch, queryClient]);

  // Channel every parcel whose cooldown is ready, using the claimer gotchi.
  // Re-reads the gotchi's last-channel before each (its own cooldown updates
  // after a channel), and skips parcels that revert (gotchi on cooldown / lent).
  const channelAll = useCallback(async () => {
    if (!isConnected || !address || !claimerGotchiId || !publicClient) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const ready = parcelIds.filter((_, i) => (nextChannelTimes[i] || 0) <= nowSec);
    if (ready.length === 0) return;
    setErrorMsg(null);
    setChannelStep("submitting");
    setChannelProgress({ done: 0, total: ready.length });
    let ok = 0;
    for (let i = 0; i < ready.length; i++) {
      try {
        const last = (await publicClient.readContract({
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "getLastChanneled",
          args: [BigInt(claimerGotchiId)],
        })) as bigint;
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: REALM_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "channelAlchemica",
          args: [ready[i], BigInt(claimerGotchiId), last, "0x"],
        });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        ok++;
      } catch {
        /* gotchi on cooldown / lent / no access — skip and continue */
      }
      setChannelProgress({ done: i + 1, total: ready.length });
    }
    setChannelDone(ok);
    setChannelStep(ok > 0 ? "success" : "error");
    if (ok === 0) {
      setErrorMsg("No parcels channeled — your gotchi is likely on cooldown or lent/locked (a gotchi can channel once per cooldown).");
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: ["land-parcel-ids", address.toLowerCase()] });
  }, [isConnected, address, claimerGotchiId, publicClient, parcelIds, nextChannelTimes, writeContractAsync, refetch, queryClient]);

  const reset = useCallback(() => {
    setStep("idle");
    setErrorMsg(null);
    setProgress(null);
    setChannelStep("idle");
    setChannelProgress(null);
  }, []);

  return {
    parcelCount: parcelIds.length,
    claimableCount: claimable.length,
    totalsBySymbol,
    nextChannelTimes,
    nextReservoirTimes,
    isLoading: parcelsQuery.isLoading,
    send,
    step,
    errorMsg,
    progress,
    channelAll,
    channelStep,
    channelProgress,
    channelDone,
    reset,
    isOnBase,
    address,
  };
}
