import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  LENDING_FACET_ABI,
  WHITELIST_FACET_ABI,
} from "@/lib/lending/contracts";
import { invalidateLendingsCache } from "@/hooks/useLendings";

export type TxStep = "idle" | "submitting" | "confirming" | "success" | "error";

export type ListingParams = {
  tokenId: number;
  initialCostWei: bigint;
  periodSeconds: number;
  splitOwner: number;
  splitBorrower: number;
  splitOther: number;
  originalOwner: `0x${string}`;
  thirdParty: `0x${string}`;
  whitelistId: number;
  revenueTokens: `0x${string}`[];
  permissions: bigint;
};

function useTxBase() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: tx.data });
  const [step, setStep] = useState<TxStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tx.isPending) setStep("submitting");
    else if (receipt.isLoading) setStep("confirming");
    else if (receipt.isSuccess) setStep("success");
    else if (tx.isError) {
      setStep("error");
      setErrorMsg(tx.error?.message || "Transaction failed");
    }
  }, [tx.isPending, tx.isError, tx.error, receipt.isLoading, receipt.isSuccess]);

  const reset = useCallback(() => {
    tx.reset();
    setStep("idle");
    setErrorMsg(null);
  }, [tx]);

  return {
    address,
    isConnected,
    isOnBase,
    tx,
    receipt,
    step,
    errorMsg,
    reset,
    canWrite: isConnected && isOnBase,
  };
}

export function useCancelLending() {
  const base = useTxBase();
  const send = useCallback(
    (gotchiTokenId: number) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "cancelGotchiLendingByToken",
        args: [gotchiTokenId],
      });
    },
    [base]
  );
  useEffect(() => {
    if (base.step === "success") invalidateLendingsCache();
  }, [base.step]);
  return { ...base, send };
}

export function useClaimAndEndLending() {
  const base = useTxBase();
  const send = useCallback(
    (gotchiTokenId: number) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "claimAndEndGotchiLending",
        args: [gotchiTokenId],
      });
    },
    [base]
  );
  useEffect(() => {
    if (base.step === "success") invalidateLendingsCache();
  }, [base.step]);
  return { ...base, send };
}

export function useClaimLending() {
  const base = useTxBase();
  const send = useCallback(
    (gotchiTokenId: number) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "claimGotchiLending",
        args: [gotchiTokenId],
      });
    },
    [base]
  );
  return { ...base, send };
}

export function useAddListing() {
  const base = useTxBase();
  const send = useCallback(
    (p: ListingParams) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "addGotchiListing",
        args: [
          {
            tokenId: p.tokenId,
            initialCost: p.initialCostWei,
            period: p.periodSeconds,
            revenueSplit: [p.splitOwner, p.splitBorrower, p.splitOther] as const,
            originalOwner: p.originalOwner,
            thirdParty: p.thirdParty,
            whitelistId: p.whitelistId,
            revenueTokens: p.revenueTokens,
            permissions: p.permissions,
          } as any,
        ],
      });
    },
    [base]
  );
  useEffect(() => {
    if (base.step === "success") invalidateLendingsCache();
  }, [base.step]);
  return { ...base, send };
}

export function useCreateWhitelist() {
  const base = useTxBase();
  const send = useCallback(
    (name: string, addresses: `0x${string}`[]) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: WHITELIST_FACET_ABI,
        functionName: "createWhitelist",
        args: [name, addresses],
      });
    },
    [base]
  );
  return { ...base, send };
}

export function useSetLendingOperator() {
  const base = useTxBase();
  const send = useCallback(
    (operator: `0x${string}`, tokenId: number, approved: boolean) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "setLendingOperator",
        args: [operator, tokenId, approved],
      });
    },
    [base]
  );
  return { ...base, send };
}

export function useTransferWhitelist() {
  const base = useTxBase();
  const send = useCallback(
    (whitelistId: number, newOwner: `0x${string}`) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: WHITELIST_FACET_ABI,
        functionName: "transferOwnershipOfWhitelist",
        args: [whitelistId, newOwner],
      });
    },
    [base]
  );
  return { ...base, send };
}

export function useUpdateWhitelist() {
  const base = useTxBase();
  const add = useCallback(
    (whitelistId: number, addresses: `0x${string}`[]) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: WHITELIST_FACET_ABI,
        functionName: "updateWhitelist",
        args: [whitelistId, addresses],
      });
    },
    [base]
  );
  const remove = useCallback(
    (whitelistId: number, addresses: `0x${string}`[]) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: WHITELIST_FACET_ABI,
        functionName: "removeAddressesFromWhitelist",
        args: [whitelistId, addresses],
      });
    },
    [base]
  );
  const setLimit = useCallback(
    (whitelistId: number, limit: bigint) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: WHITELIST_FACET_ABI,
        functionName: "setBorrowLimit",
        args: [whitelistId, limit],
      });
    },
    [base]
  );
  return { ...base, add, remove, setLimit };
}
