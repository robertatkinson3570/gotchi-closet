import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { BASE_CHAIN_ID } from "@/lib/chains";

const ITEM_BALANCES_ABI = [
  {
    name: "itemBalances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "itemId", type: "uint256" },
          { name: "balance", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/**
 * Combined on-chain ERC1155 item balances across the given wallets
 * (raw — includes consumables/badges; filter by wearable category at the
 * consumer before treating these as owned wearables).
 */
export function useWalletItemBalances(wallets: string[]) {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  // Dedupe (I-5): the same address entered twice (connected + manual, or
  // differing case) must not double every balance.
  const uniqueWallets = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const key = [...uniqueWallets].sort().join("|");
  return useQuery({
    queryKey: ["wallet-item-balances", key],
    enabled: uniqueWallets.length > 0 && !!publicClient,
    staleTime: 60_000,
    queryFn: async () => {
      const combined: Record<number, number> = {};
      for (const wallet of uniqueWallets) {
        const res = (await publicClient!.readContract({
          address: AAVEGOTCHI_DIAMOND_BASE,
          abi: ITEM_BALANCES_ABI,
          functionName: "itemBalances",
          args: [wallet as `0x${string}`],
        })) as { itemId: bigint; balance: bigint }[];
        for (const b of res) {
          const id = Number(b.itemId);
          combined[id] = (combined[id] || 0) + Number(b.balance);
        }
      }
      return combined;
    },
  });
}
