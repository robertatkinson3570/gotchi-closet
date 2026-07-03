import { useReadContract } from "wagmi";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";

// Skill points available to spend (AavegotchiGameFacet). Verified on Base.
export const AVAILABLE_SKILL_POINTS_ABI = [
  {
    name: "availableSkillPoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** On-chain unspent skill points. `enabled` gates the read (only needed in respec mode). */
export function useAvailableSkillPoints(
  tokenId: string | undefined,
  enabled: boolean
): number | undefined {
  // BigInt() throws on non-numeric strings, so validate before constructing.
  const isNumericId = !!tokenId && /^\d+$/.test(tokenId);
  const { data } = useReadContract({
    address: AAVEGOTCHI_DIAMOND_BASE,
    abi: AVAILABLE_SKILL_POINTS_ABI,
    functionName: "availableSkillPoints",
    args: isNumericId ? [BigInt(tokenId as string)] : undefined,
    chainId: BASE_CHAIN_ID,
    query: {
      enabled: enabled && isNumericId,
      staleTime: 30_000,
    },
  });
  return data != null ? Number(data) : undefined;
}
