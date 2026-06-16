import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { REALM_DIAMOND_BASE, REALM_FACET_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

export type TxStep = "idle" | "submitting" | "confirming" | "success" | "error";

/**
 * Per-parcel Realm actions on the Gotchiverse diamond (Base/geist build, where
 * the LibSignature backend check was removed — so an empty `0x` signature is
 * accepted). Exposes claim / channel / survey / equip / unequip and tracks
 * which parcel+action is in flight via `activeKey` for row-level busy state.
 */
export function useRealmActions() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
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
  const [activeKey, setActiveKey] = useState<string | null>(null);

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
  }, [tx.isPending, tx.isError, tx.error, tx.data, receipt.isLoading, receipt.isSuccess, receipt.isError, receipt.error]);

  useEffect(() => {
    if (step === "success") {
      queryClient.invalidateQueries({ queryKey: ["land-parcels"] });
      queryClient.invalidateQueries({ queryKey: ["parcel-detail"] });
    }
  }, [step, queryClient]);

  const write = useCallback(
    (key: string, functionName: any, args: any[]) => {
      if (!isConnected) return;
      setActiveKey(key);
      tx.writeContract({
        chainId: BASE_CHAIN_ID,
        address: REALM_DIAMOND_BASE,
        abi: REALM_FACET_ABI,
        functionName,
        args,
      } as any);
    },
    [isConnected, tx]
  );

  const claim = useCallback(
    (realmId: bigint, gotchiId: bigint) =>
      write(`claim:${realmId}`, "claimAvailableAlchemica", [realmId, gotchiId, "0x"]),
    [write]
  );

  // Channel pre-flights a simulate so an on-cooldown gotchi ("Gotchi can't
  // channel yet") surfaces as a clear message instead of a failed wallet tx.
  const channel = useCallback(
    async (realmId: bigint, gotchiId: bigint, lastChanneled: bigint) => {
      if (!isConnected || !address || !publicClient) return;
      setActiveKey(`channel:${realmId}`);
      setErrorMsg(null);
      const args = [realmId, gotchiId, lastChanneled, "0x"] as const;
      try {
        await publicClient.simulateContract({ address: REALM_DIAMOND_BASE, abi: REALM_FACET_ABI, functionName: "channelAlchemica", args, account: address });
      } catch (e) {
        setStep("error");
        setErrorMsg(parseRevert(e));
        return;
      }
      tx.writeContract({ chainId: BASE_CHAIN_ID, address: REALM_DIAMOND_BASE, abi: REALM_FACET_ABI, functionName: "channelAlchemica", args } as any);
    },
    [isConnected, address, publicClient, tx]
  );

  const survey = useCallback(
    (realmId: bigint) => write(`survey:${realmId}`, "startSurveying", [realmId]),
    [write]
  );

  const equip = useCallback(
    (realmId: bigint, gotchiId: bigint, installationId: bigint, x: bigint, y: bigint) =>
      write(`equip:${realmId}`, "equipInstallation", [realmId, gotchiId, installationId, x, y, "0x"]),
    [write]
  );

  const unequip = useCallback(
    (realmId: bigint, gotchiId: bigint, installationId: bigint, x: bigint, y: bigint) =>
      write(
        `unequip:${realmId}:${installationId}:${x}:${y}`,
        "unequipInstallation",
        [realmId, gotchiId, installationId, x, y, "0x"]
      ),
    [write]
  );

  const reset = useCallback(() => {
    tx.reset();
    setStep("idle");
    setErrorMsg(null);
    setActiveKey(null);
  }, [tx]);

  return { claim, channel, survey, equip, unequip, step, errorMsg, activeKey, reset, isOnBase };
}
