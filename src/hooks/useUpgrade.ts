import { useCallback, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  ERC20_ABI,
  ALCHEMICA_TOKEN_ADDRESSES_BASE,
  INSTALLATION_DIAMOND_BASE,
  REALM_FACET_ABI,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

export type UpgradeStep = "idle" | "approving" | "upgrading" | "finalizing";

/**
 * Upgrade an equipped installation to its next level on the Installation
 * diamond. Pays alchemica (so we approve the 4 tokens first), then queues the
 * upgrade (readyBlock); call finalize() once it's ready, or pass GLTR to skip
 * the wait. geist accepts an empty `0x` signature.
 */
export function useUpgrade(owner?: string) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [step, setStep] = useState<UpgradeStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const ensureApprovals = useCallback(async () => {
    for (const token of ALCHEMICA_TOKEN_ADDRESSES_BASE) {
      const allowance = (await publicClient!.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, INSTALLATION_DIAMOND_BASE],
      })) as bigint;
      if (allowance < 10n ** 24n) {
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [INSTALLATION_DIAMOND_BASE, MAX_UINT256],
        });
        await publicClient!.waitForTransactionReceipt({ hash, confirmations: 1 });
      }
    }
  }, [owner, publicClient, writeContractAsync]);

  const upgrade = useCallback(
    async (parcelId: bigint, installationId: bigint, x: number, y: number, gotchiId: bigint, gltr = 0) => {
      if (!owner || !publicClient) return;
      setBusyKey(`upg:${parcelId}:${installationId}:${x}:${y}`);
      setError(null);
      try {
        setStep("approving");
        await ensureApprovals();
        setStep("upgrading");
        const queue = {
          owner: owner as `0x${string}`,
          coordinateX: x,
          coordinateY: y,
          readyBlock: 0,
          claimed: false,
          parcelId,
          installationId,
        };
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: INSTALLATION_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "upgradeInstallation",
          args: [queue, gotchiId, "0x", gltr],
        });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        queryClient.invalidateQueries({ queryKey: qk.parcelDetail() });
        queryClient.invalidateQueries({ queryKey: qk.landParcels() });
      } catch (e) {
        setError(parseRevert(e));
      } finally {
        setBusyKey(null);
        setStep("idle");
      }
    },
    [owner, publicClient, writeContractAsync, queryClient, ensureApprovals]
  );

  const finalize = useCallback(
    async (parcelId: bigint) => {
      if (!owner || !publicClient) return;
      setBusyKey(`fin:${parcelId}`);
      setError(null);
      try {
        setStep("finalizing");
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: INSTALLATION_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "finalizeUpgradesForParcels",
          args: [[parcelId]],
        });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        queryClient.invalidateQueries({ queryKey: qk.parcelDetail() });
      } catch (e) {
        setError(parseRevert(e));
      } finally {
        setBusyKey(null);
        setStep("idle");
      }
    },
    [owner, publicClient, writeContractAsync, queryClient]
  );

  return { upgrade, finalize, busyKey, step, error };
}
