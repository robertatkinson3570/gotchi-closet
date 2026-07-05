import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, Shirt } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { fetchOutfitsForOwner, type OnchainOutfit } from "@/lib/explorer/wardrobe";
import { itemMetaSync } from "@/lib/explorer/itemMeta";
import { useToast } from "@/ui/use-toast";

const EQUIP_ABI = [
  { name: "equipWearables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_wearablesToEquip", type: "uint16[16]" }], outputs: [] },
] as const;

function outfitSummary(wearables: number[]): string {
  return wearables
    .filter((id) => id > 0)
    .map((id) => itemMetaSync(id)?.name ?? `#${id}`)
    .join(", ");
}

/** On-chain saved outfits (WearablesConfig, e.g. named presets from the official
 *  dapp) for the connected owner, applicable to this gotchi in one click. */
export function OnchainOutfits({ gotchiId, ownerAddress, locked }: { gotchiId: string; ownerAddress: string; locked?: boolean }) {
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["onchain-outfits", ownerAddress],
    queryFn: () => fetchOutfitsForOwner(ownerAddress),
    staleTime: 60_000,
    enabled: !!ownerAddress,
  });

  const apply = async (outfit: OnchainOutfit) => {
    if (!publicClient) return;
    if (!isOnBase) return toast({ title: "Switch to Base", description: "Applying an outfit requires the Base network." });
    setApplyingId(outfit.id);
    try {
      const padded = [...outfit.wearables.slice(0, 16), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16).map((n) => Number(n)) as unknown as readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: EQUIP_ABI, functionName: "equipWearables", args: [BigInt(gotchiId), padded] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Outfit applied", description: `${outfit.name} is now equipped on gotchi #${gotchiId}.` });
    } catch (e) {
      toast({ title: "Failed to apply outfit", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">On-chain outfits</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No outfits saved on-chain. (Saved outfits from the official dapp appear here.)</div>
      ) : (
        <div className="space-y-1.5">
          {data.map((outfit) => {
            const busy = applyingId === outfit.id;
            return (
              <div key={outfit.id} className="flex items-center gap-2 rounded-lg border border-border/40 px-2.5 py-1.5">
                <Shirt className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{outfit.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{outfitSummary(outfit.wearables) || "No wearables"}</div>
                </div>
                <button
                  disabled={busy || !!locked}
                  onClick={() => apply(outfit)}
                  title={locked ? "This gotchi is locked, unlock it to apply outfits" : undefined}
                  className="h-7 px-2.5 rounded-md bg-primary/15 text-primary text-[11px] font-semibold disabled:opacity-50 hover:bg-primary/25 shrink-0"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
