import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  ERC1155_MARKETPLACE_ABI,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { qk } from "@/lib/queryKeys";
import type { SaveStep } from "@/lib/savePlan";

const EQUIP_ABI = [
  { name: "equipWearables", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_wearablesToEquip", type: "uint16[16]" }], outputs: [] },
] as const;
const RESPEC_ABI = [
  { name: "resetSkillPoints", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
] as const;

export type SaveProgress =
  | { phase: "idle" }
  | { phase: "running"; stepIndex: number; total: number; label: string }
  | { phase: "success" }
  | { phase: "error"; stepIndex: number; label: string; message: string };

export function stepLabel(step: SaveStep): string {
  switch (step.kind) {
    case "buy": return `Buying wearable #${step.wearableId}`;
    case "resetSkillPoints": return "Respec: resetting skill points";
    case "spendSkillPoints": return "Respec: spending skill points";
    case "unequip": return `Removing from gotchi #${step.gotchiId}`;
    case "equip": return `Equipping gotchi #${step.gotchiId}`;
  }
}

type Slots16 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export type StepWriteArgs =
  | { address: `0x${string}`; abi: typeof ERC1155_MARKETPLACE_ABI; functionName: "executeERC1155ListingToRecipient"; args: readonly [bigint, `0x${string}`, bigint, bigint, bigint, `0x${string}`] }
  | { address: `0x${string}`; abi: typeof RESPEC_ABI; functionName: "resetSkillPoints"; args: readonly [number] }
  | { address: `0x${string}`; abi: typeof RESPEC_ABI; functionName: "spendSkillPoints"; args: readonly [bigint, [number, number, number, number]] }
  | { address: `0x${string}`; abi: typeof EQUIP_ABI; functionName: "equipWearables"; args: readonly [bigint, Slots16] };

/**
 * Pure mapping from a SaveStep to the exact contract write it produces
 * (unit-tested in useSaveOutfit.test.ts). The GHST-approval pre-step for buys
 * is handled separately by the executor.
 */
export function stepToWriteArgs(
  step: SaveStep,
  targetGotchiId: string,
  recipient: `0x${string}`
): StepWriteArgs {
  switch (step.kind) {
    case "buy":
      return {
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: ERC1155_MARKETPLACE_ABI,
        functionName: "executeERC1155ListingToRecipient",
        args: [BigInt(step.listingId), AAVEGOTCHI_DIAMOND_BASE, BigInt(step.wearableId), BigInt(step.quantity), BigInt(step.priceInWei), recipient],
      };
    case "resetSkillPoints":
      // resetSkillPoints takes uint32 — Number, not BigInt.
      return {
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: RESPEC_ABI,
        functionName: "resetSkillPoints",
        args: [Number(targetGotchiId)],
      };
    case "spendSkillPoints":
      return {
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: RESPEC_ABI,
        functionName: "spendSkillPoints",
        args: [BigInt(targetGotchiId), step.values as [number, number, number, number]],
      };
    case "unequip":
    case "equip":
      // unequip and equip are both equipWearables calls
      return {
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: EQUIP_ABI,
        functionName: "equipWearables",
        args: [BigInt(step.gotchiId), step.slots16 as unknown as Slots16],
      };
  }
}

/** Executes a SavePlan sequentially; each step waits for its receipt. Aborts on the first failure. */
export function useSaveOutfit() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [progress, setProgress] = useState<SaveProgress>({ phase: "idle" });

  const reset = useCallback(() => setProgress({ phase: "idle" }), []);

  const execute = useCallback(
    async (targetGotchiId: string, steps: SaveStep[]) => {
      if (!isConnected || !address || !publicClient) {
        setProgress({ phase: "error", stepIndex: 0, label: "Wallet", message: "Connect your wallet first" });
        return false;
      }
      if (chainId !== BASE_CHAIN_ID) {
        setProgress({ phase: "error", stepIndex: 0, label: "Network", message: "Switch to Base" });
        return false;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgress({ phase: "running", stepIndex: i, total: steps.length, label: stepLabel(step) });
        try {
          if (step.kind === "buy") {
            // GHST-approval pre-step (not part of stepToWriteArgs).
            const price = BigInt(step.priceInWei);
            const allowance = (await publicClient.readContract({
              address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "allowance",
              args: [address, AAVEGOTCHI_DIAMOND_BASE],
            })) as bigint;
            if (allowance < price) {
              const ah = await writeContractAsync({
                chainId: BASE_CHAIN_ID, address: GHST_TOKEN_BASE, abi: ERC20_ABI,
                functionName: "approve", args: [AAVEGOTCHI_DIAMOND_BASE, MAX_UINT256],
              });
              await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
            }
          }
          const w = stepToWriteArgs(step, targetGotchiId, address);
          const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, ...w } as Parameters<typeof writeContractAsync>[0]);
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        } catch (e) {
          setProgress({ phase: "error", stepIndex: i, label: stepLabel(step), message: parseRevert(e).slice(0, 160) });
          // Refetch so partial progress (e.g. bought but not equipped) shows truthfully.
          queryClient.invalidateQueries({ queryKey: qk.gotchis() });
          queryClient.invalidateQueries({ queryKey: ["wallet-item-balances"] });
          return false;
        }
      }
      setProgress({ phase: "success" });
      queryClient.invalidateQueries({ queryKey: qk.gotchis() });
      queryClient.invalidateQueries({ queryKey: ["wallet-item-balances"] });
      queryClient.invalidateQueries({ queryKey: ["cheapest-wearable-listings"] });
      return true;
    },
    [isConnected, address, publicClient, chainId, writeContractAsync, queryClient]
  );

  return { execute, progress, reset };
}
