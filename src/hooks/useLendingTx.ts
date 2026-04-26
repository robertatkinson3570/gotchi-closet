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
  ERC20_ABI,
  GHST_TOKEN_BASE,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
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
  // Poll every 2s with explicit confirmations:1 + a generous retry window.
  // The default polling occasionally stalls on Base public RPC.
  const receipt = useWaitForTransactionReceipt({
    hash: tx.data,
    confirmations: 1,
    pollingInterval: 2_000,
    retryCount: 60, // ~2 min of retries before giving up
  });
  const [step, setStep] = useState<TxStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Order matters. Errors first so a wallet rejection is surfaced rather
    // than masked by a stale `receipt.isLoading=true` (wagmi defaults that
    // to true even when there's no tx hash).
    if (tx.isError) {
      setStep("error");
      setErrorMsg(parseRevert(tx.error));
      return;
    }
    if (tx.isPending) {
      setStep("submitting");
      return;
    }
    // CRITICAL: only enter "confirming" when we actually have a tx hash.
    // Otherwise wagmi's default `receipt.isLoading=true` traps the user in
    // a fake confirming state when the wallet popup closes without
    // broadcasting (silent cancel, wallet glitch, network drop).
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
    // No hash + no error + not pending = idle (e.g. just after reset() or
    // wallet popup dismissed without a clear error). Caller can retry.
  }, [tx.isPending, tx.isError, tx.error, tx.data, receipt.isLoading, receipt.isSuccess, receipt.isError, receipt.error]);

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

function listingParamsToTuple(p: ListingParams) {
  return {
    tokenId: p.tokenId,
    initialCost: p.initialCostWei,
    period: p.periodSeconds,
    revenueSplit: [p.splitOwner, p.splitBorrower, p.splitOther] as const,
    originalOwner: p.originalOwner,
    thirdParty: p.thirdParty,
    whitelistId: p.whitelistId,
    revenueTokens: p.revenueTokens,
    permissions: p.permissions,
  };
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
        args: [listingParamsToTuple(p) as any],
      });
    },
    [base]
  );
  useEffect(() => {
    if (base.step === "success") invalidateLendingsCache();
  }, [base.step]);
  return { ...base, send };
}

export function useBatchAddListing() {
  const base = useTxBase();
  const send = useCallback(
    (listings: ListingParams[]) => {
      if (!base.canWrite || listings.length === 0) return;
      const tuples = listings.map(listingParamsToTuple);
      base.tx.writeContract({
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: LENDING_FACET_ABI,
        functionName: "batchAddGotchiListing",
        args: [tuples as any],
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

// Transfers GHST from the connected wallet — used to pay an auto-renew
// subscription to the operator hot wallet. The backend verifies the resulting
// txHash matches expected (to, amount) before crediting the subscription.
export function useTransferGhst() {
  const base = useTxBase();
  const send = useCallback(
    (to: `0x${string}`, amountWei: bigint) => {
      if (!base.canWrite) return;
      base.tx.writeContract({
        address: GHST_TOKEN_BASE,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amountWei],
      });
    },
    [base]
  );
  return { ...base, send, txHash: base.tx.data };
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
