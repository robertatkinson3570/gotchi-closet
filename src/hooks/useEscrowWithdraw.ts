import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  ESCROW_FACET_ABI,
  ALCHEMICA_TOKENS_BASE,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { invalidateLendingsCache } from "@/hooks/useLendings";
import { invalidateMyLendings } from "@/hooks/useMyLendings";

export type EscrowBalance = {
  tokenId: number;
  erc20: `0x${string}`;
  symbol: string;
  amount: bigint;
};

/**
 * Read alchemica balances held in each gotchi's per-token escrow contract.
 *
 * Wagmi's useReadContracts auto-batches via Multicall3 when available on the
 * connected chain (Base has it), so even 11 gotchis × 4 alchemica tokens
 * resolve as a single RPC round-trip.
 */
export function useEscrowBalances(tokenIds: number[]) {
  const contracts = useMemo(() => {
    const out: {
      address: `0x${string}`;
      abi: typeof ESCROW_FACET_ABI;
      functionName: "escrowBalance";
      args: [bigint, `0x${string}`];
      chainId: number;
    }[] = [];
    for (const id of tokenIds) {
      for (const tk of ALCHEMICA_TOKENS_BASE) {
        out.push({
          address: AAVEGOTCHI_DIAMOND_BASE,
          abi: ESCROW_FACET_ABI,
          functionName: "escrowBalance",
          args: [BigInt(id), tk.address],
          chainId: BASE_CHAIN_ID,
        });
      }
    }
    return out;
  }, [tokenIds]);

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const balances = useMemo<EscrowBalance[]>(() => {
    if (!data) return [];
    const rows: EscrowBalance[] = [];
    let i = 0;
    for (const tokenId of tokenIds) {
      for (const tk of ALCHEMICA_TOKENS_BASE) {
        const r = data[i++];
        const amount = r?.status === "success" ? (r.result as bigint) : BigInt(0);
        if (amount > BigInt(0)) {
          rows.push({ tokenId, erc20: tk.address, symbol: tk.symbol, amount });
        }
      }
    }
    return rows;
  }, [data, tokenIds]);

  // Totals per alch token, for the action-bar summary.
  const totalsBySymbol = useMemo<Record<string, bigint>>(() => {
    const t: Record<string, bigint> = {};
    for (const b of balances) t[b.symbol] = (t[b.symbol] ?? BigInt(0)) + b.amount;
    return t;
  }, [balances]);

  return { balances, totalsBySymbol, isLoading, error, refetch };
}

export type TxStep = "idle" | "submitting" | "confirming" | "success" | "error";

/**
 * One-shot batch-transferEscrow: takes a list of EscrowBalance rows and
 * sweeps every one to the provided recipient in a single transaction.
 *
 * Reverts mid-rental — the diamond's onlyUnlocked modifier rejects any
 * tokenId whose lending lock is set. Caller should pre-filter to gotchis
 * known to be unlocked (i.e. not in an active rental).
 */
export function useBatchTransferEscrow() {
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
  const [step, setStep] = useState<TxStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tx.isError) {
      setStep("error");
      setErrorMsg(parseRevert(tx.error));
      return;
    }
    if (tx.isPending) {
      setStep("submitting");
      return;
    }
    if (tx.data && receipt.isError) {
      setStep("error");
      setErrorMsg(parseRevert(receipt.error));
      return;
    }
    if (tx.data && receipt.isSuccess) {
      setStep("success");
      return;
    }
    if (tx.data && receipt.isLoading) {
      setStep("confirming");
      return;
    }
  }, [
    tx.isPending,
    tx.isError,
    tx.error,
    tx.data,
    receipt.isLoading,
    receipt.isSuccess,
    receipt.isError,
    receipt.error,
  ]);

  const send = useCallback(
    (rows: EscrowBalance[], recipient: `0x${string}`) => {
      if (!isConnected || rows.length === 0) return;
      const tokenIds = rows.map((r) => BigInt(r.tokenId));
      const erc20s = rows.map((r) => r.erc20);
      const recipients = rows.map(() => recipient);
      const amounts = rows.map((r) => r.amount);
      tx.writeContract({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: ESCROW_FACET_ABI,
        functionName: "batchTransferEscrow",
        args: [tokenIds, erc20s, recipients, amounts],
      });
    },
    [isConnected, tx]
  );

  useEffect(() => {
    if (step === "success") {
      invalidateLendingsCache();
      invalidateMyLendings();
      queryClient.invalidateQueries({ queryKey: ["gotchis"] });
    }
  }, [step, queryClient]);

  const reset = useCallback(() => {
    tx.reset();
    setStep("idle");
    setErrorMsg(null);
  }, [tx]);

  return { send, step, errorMsg, reset, tx, address, isOnBase };
}
