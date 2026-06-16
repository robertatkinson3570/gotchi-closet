import { useCallback, useEffect, useRef, useState } from "react";
import { qk } from "@/lib/queryKeys";
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, LENDING_FACET_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { invalidateLendingsCache } from "@/hooks/useLendings";
import { invalidateMyLendings } from "@/hooks/useMyLendings";

export type AgreeParams = {
  listingId: number;
  tokenId: number;
  initialCostWei: bigint;
  periodSeconds: number;
  splitOwner: number;
  splitBorrower: number;
  splitOther: number;
};

export type AgreeStatus = "queued" | "submitting" | "confirming" | "success" | "error";
export type AgreeProgress = {
  index: number;
  total: number;
  current: AgreeParams | null;
  results: { params: AgreeParams; status: AgreeStatus; error?: string; hash?: `0x${string}` }[];
  done: boolean;
};

/**
 * Sequential signer for agreeGotchiLending. Aavegotchi's diamond does NOT
 * expose a batch-agree, so any "bulk rent" UX must loop singular calls.
 * This hook signs one tx, waits for receipt, then advances to the next.
 *
 * The user will see N wallet prompts back-to-back. We surface progress
 * (currently-on, results so far, error/skip), and stop on the first
 * unrecoverable error so a single bad listing doesn't burn N gas attempts.
 *
 * For consumers: call `start(items)` once. Watch `progress` for state.
 * Call `reset()` to clear.
 */
export function useSequentialAgreeLending() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const queryClient = useQueryClient();

  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: tx.data,
    confirmations: 1,
    pollingInterval: 2_000,
    retryCount: 60,
  });

  const queueRef = useRef<AgreeParams[]>([]);
  const [progress, setProgress] = useState<AgreeProgress>({
    index: 0,
    total: 0,
    current: null,
    results: [],
    done: false,
  });
  const [running, setRunning] = useState(false);
  const advancingRef = useRef(false);

  const submitOne = useCallback(
    (p: AgreeParams) => {
      tx.reset();
      tx.writeContract({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "agreeGotchiLending",
        args: [
          p.listingId,
          p.tokenId,
          p.initialCostWei,
          p.periodSeconds,
          [p.splitOwner, p.splitBorrower, p.splitOther] as const,
        ],
      });
    },
    [tx]
  );

  const start = useCallback(
    (items: AgreeParams[]) => {
      if (!isConnected || items.length === 0 || running) return;
      queueRef.current = items;
      setProgress({
        index: 0,
        total: items.length,
        current: items[0],
        results: items.map((params) => ({ params, status: "queued" })),
        done: false,
      });
      setRunning(true);
      // Submit the first immediately. Subsequent submits happen in the
      // useEffect below as each receipt confirms.
      submitOne(items[0]);
    },
    [isConnected, running, submitOne]
  );

  const reset = useCallback(() => {
    tx.reset();
    queueRef.current = [];
    setProgress({ index: 0, total: 0, current: null, results: [], done: false });
    setRunning(false);
    advancingRef.current = false;
  }, [tx]);

  // Mirror tx state into the current item's status for the UI.
  useEffect(() => {
    if (!running) return;
    setProgress((prev) => {
      if (!prev.current) return prev;
      const i = prev.index;
      const updated = [...prev.results];
      let status: AgreeStatus = updated[i]?.status ?? "queued";
      if (tx.isPending) status = "submitting";
      else if (tx.data && receipt.isLoading) status = "confirming";
      else if (tx.data && receipt.isSuccess) status = "success";
      else if (tx.isError || (tx.data && receipt.isError))
        status = "error";
      updated[i] = {
        ...updated[i],
        status,
        hash: tx.data ?? updated[i]?.hash,
        error:
          status === "error"
            ? parseRevert(tx.error ?? receipt.error)
            : updated[i]?.error,
      };
      return { ...prev, results: updated };
    });
  }, [
    running,
    tx.isPending,
    tx.isError,
    tx.error,
    tx.data,
    receipt.isLoading,
    receipt.isSuccess,
    receipt.isError,
    receipt.error,
  ]);

  // Advance to next when current succeeds. Stop on error so a malformed
  // listing or wallet rejection doesn't spam the user with prompts.
  useEffect(() => {
    if (!running) return;
    if (advancingRef.current) return;
    const success = Boolean(tx.data && receipt.isSuccess);
    const failed = tx.isError || Boolean(tx.data && receipt.isError);

    if (success) {
      advancingRef.current = true;
      const nextIndex = progress.index + 1;
      if (nextIndex >= queueRef.current.length) {
        setProgress((p) => ({ ...p, done: true, current: null }));
        setRunning(false);
        invalidateLendingsCache();
        invalidateMyLendings();
        queryClient.invalidateQueries({ queryKey: qk.gotchis() });
        advancingRef.current = false;
        return;
      }
      // Small breath so wagmi resets between writeContract calls cleanly,
      // and the wallet popup queue doesn't stack on top of the previous
      // confirmation animation.
      const next = queueRef.current[nextIndex];
      setTimeout(() => {
        setProgress((p) => ({ ...p, index: nextIndex, current: next }));
        submitOne(next);
        advancingRef.current = false;
      }, 400);
      return;
    }

    if (failed) {
      // Stop the queue. User can call start(remaining) to retry from here.
      setRunning(false);
      setProgress((p) => ({ ...p, done: true }));
    }
  }, [
    running,
    tx.data,
    tx.isError,
    receipt.isSuccess,
    receipt.isError,
    progress.index,
    submitOne,
    queryClient,
  ]);

  return {
    start,
    reset,
    progress,
    running,
    address,
    isOnBase,
    txHash: tx.data,
  };
}
