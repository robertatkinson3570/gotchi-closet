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

export type CraftStep = "idle" | "approving" | "crafting";

/**
 * Craft a level-1 installation on the Installation diamond. Crafting pulls
 * alchemica from the wallet, so we first ensure each of the 4 alchemica tokens
 * is approved to the diamond, then call craftInstallations (craftTime 0 → minted
 * immediately). Each token approval + the craft are separate wallet signatures.
 */
export function useCraft(owner?: string) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [step, setStep] = useState<CraftStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const craft = useCallback(
    async (typeId: number) => {
      if (!owner || !publicClient) return;
      setBusyId(typeId);
      setError(null);
      try {
        // Ensure alchemica spending is approved to the installation diamond.
        setStep("approving");
        for (const token of ALCHEMICA_TOKEN_ADDRESSES_BASE) {
          const allowance = (await publicClient.readContract({
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
            await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
          }
        }
        setStep("crafting");
        const hash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: INSTALLATION_DIAMOND_BASE,
          abi: REALM_FACET_ABI,
          functionName: "craftInstallations",
          args: [[typeId], [0]],
        });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        queryClient.invalidateQueries({ queryKey: qk.installationTypes() });
      } catch (e) {
        setError(parseRevert(e));
      } finally {
        setBusyId(null);
        setStep("idle");
      }
    },
    [owner, publicClient, writeContractAsync, queryClient]
  );

  return { craft, busyId, step, error };
}
