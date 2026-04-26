import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  LENDING_FACET_ABI,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { invalidateLendingsCache } from "@/hooks/useLendings";

export type RentParams = {
  listingId: string; // uint32
  gotchiTokenId: string; // uint32 (also the erc721 token id)
  upfrontCostWei: string; // uint96 in wei
  periodSeconds: number; // uint32
  splitOwner: number;
  splitBorrower: number;
  splitOther: number;
};

export type RentStep = "idle" | "needs-approval" | "approving" | "ready" | "renting" | "success" | "error";

const POLL_INTERVAL = 2_000;

export function useRentLending(params: RentParams | null) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;

  const [step, setStep] = useState<RentStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const upfrontWei = params ? BigInt(params.upfrontCostWei || "0") : BigInt(0);
  const requiresApproval = upfrontWei > BigInt(0);

  // Check current allowance
  const {
    data: allowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: GHST_TOKEN_BASE,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, AAVEGOTCHI_DIAMOND_BASE] : undefined,
    query: {
      enabled: Boolean(address && isOnBase && requiresApproval),
      refetchInterval: POLL_INTERVAL,
    },
  });

  // Check GHST balance for friendly error messages
  const { data: balance } = useReadContract({
    address: GHST_TOKEN_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && isOnBase && requiresApproval),
      refetchInterval: POLL_INTERVAL,
    },
  });

  const allowanceBig = (allowance as bigint | undefined) ?? BigInt(0);
  const balanceBig = (balance as bigint | undefined) ?? BigInt(0);
  const hasEnoughGhst = !requiresApproval || balanceBig >= upfrontWei;
  const hasEnoughAllowance = !requiresApproval || allowanceBig >= upfrontWei;

  // tx hooks
  const approve = useWriteContract();
  const rent = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const rentReceipt = useWaitForTransactionReceipt({ hash: rent.data });

  // sync top-level step from sub-states
  useEffect(() => {
    if (!params) {
      setStep("idle");
      setErrorMsg(null);
      return;
    }
    if (rent.isPending || rentReceipt.isLoading) {
      setStep("renting");
      return;
    }
    if (rentReceipt.isSuccess) {
      setStep("success");
      invalidateLendingsCache();
      return;
    }
    if (rent.isError) {
      setStep("error");
      setErrorMsg(rent.error?.message || "Rent transaction failed");
      return;
    }
    if (approve.isPending || approveReceipt.isLoading) {
      setStep("approving");
      return;
    }
    if (approve.isError) {
      setStep("error");
      setErrorMsg(approve.error?.message || "Approval failed");
      return;
    }
    if (!hasEnoughAllowance) {
      setStep("needs-approval");
      return;
    }
    setStep("ready");
  }, [
    params,
    rent.isPending,
    rent.isError,
    rent.error,
    rentReceipt.isLoading,
    rentReceipt.isSuccess,
    approve.isPending,
    approve.isError,
    approve.error,
    approveReceipt.isLoading,
    hasEnoughAllowance,
  ]);

  // refetch allowance once approval lands
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
    }
  }, [approveReceipt.isSuccess, refetchAllowance]);

  const sendApproval = useCallback(() => {
    if (!params || !isConnected) return;
    setErrorMsg(null);
    approve.writeContract({
      chainId: BASE_CHAIN_ID,
      address: GHST_TOKEN_BASE,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [AAVEGOTCHI_DIAMOND_BASE, MAX_UINT256],
    });
  }, [params, isConnected, approve]);

  const sendRent = useCallback(() => {
    if (!params || !isConnected) return;
    if (!hasEnoughGhst) {
      setErrorMsg(
        `Need ${(Number(upfrontWei) / 1e18).toFixed(2)} GHST upfront; wallet has ${(Number(balanceBig) / 1e18).toFixed(2)}.`
      );
      setStep("error");
      return;
    }
    setErrorMsg(null);
    rent.writeContract({
      chainId: BASE_CHAIN_ID,
      address: AAVEGOTCHI_DIAMOND_BASE,
      abi: LENDING_FACET_ABI,
      functionName: "agreeGotchiLending",
      args: [
        Number(params.listingId),
        Number(params.gotchiTokenId),
        upfrontWei,
        params.periodSeconds,
        [params.splitOwner, params.splitBorrower, params.splitOther],
      ],
    });
  }, [params, isConnected, isOnBase, rent, hasEnoughGhst, upfrontWei, balanceBig]);

  const reset = useCallback(() => {
    approve.reset();
    rent.reset();
    setStep("idle");
    setErrorMsg(null);
  }, [approve, rent]);

  return {
    step,
    errorMsg,
    isConnected,
    isOnBase,
    hasEnoughGhst,
    hasEnoughAllowance,
    balanceGhst: requiresApproval ? Number(balanceBig) / 1e18 : null,
    requiresApproval,
    approveHash: approve.data,
    rentHash: rent.data,
    sendApproval,
    sendRent,
    reset,
  };
}
