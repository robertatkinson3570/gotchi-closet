import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

// Minimal ItemType tuple — only the fields we display, but viem needs the full
// shape to decode getItemTypes correctly.
const ITEM_TYPE_COMPONENTS = [
  { name: "name", type: "string" }, { name: "description", type: "string" }, { name: "author", type: "address" },
  { name: "traitModifiers", type: "int8[6]" }, { name: "slotPositions", type: "bool[16]" }, { name: "allowedCollaterals", type: "uint16[]" },
  { name: "dimensions", type: "tuple", components: [{ name: "x", type: "uint8" }, { name: "y", type: "uint8" }, { name: "width", type: "uint8" }, { name: "height", type: "uint8" }] },
  { name: "ghstPrice", type: "uint256" }, { name: "maxQuantity", type: "uint256" }, { name: "totalQuantity", type: "uint256" }, { name: "svgId", type: "uint32" },
  { name: "rarityScoreModifier", type: "uint8" }, { name: "canPurchaseWithGhst", type: "bool" }, { name: "minLevel", type: "uint16" }, { name: "canBeTransferred", type: "bool" },
  { name: "category", type: "uint8" }, { name: "kinshipBonus", type: "int16" }, { name: "experienceBonus", type: "uint32" },
] as const;

const ITEMS_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
  { name: "getItemTypes", type: "function", stateMutability: "view", inputs: [{ name: "_itemIds", type: "uint256[]" }], outputs: [{ type: "tuple[]", components: ITEM_TYPE_COMPONENTS }] },
  { name: "useConsumables", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_itemIds", type: "uint256[]" }, { name: "_quantities", type: "uint256[]" }], outputs: [] },
] as const;

const itemImg = (id: string) => `https://app.aavegotchi.com/images/items/${id}.svg`;

type Consumable = { id: string; name: string; bal: number; xp: number; kinship: number };

/** Use a consumable (XP/kinship potion, etc.) on the managed gotchi. Lists the
 *  connected wallet's category-2 items with their effect, signed via useConsumables. */
export function UseConsumablesBody({ gotchiId }: { gotchiId: string }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  const { data: consumables, isLoading, refetch } = useQuery({
    queryKey: ["my-consumables", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: async (): Promise<Consumable[]> => {
      const bals = (await publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEMS_ABI, functionName: "itemBalances", args: [address as `0x${string}`] })) as unknown as { itemId: bigint; balance: bigint }[];
      const held = bals.filter((b) => Number(b.balance) > 0);
      if (held.length === 0) return [];
      const ids = held.map((b) => b.itemId);
      const types = (await publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEMS_ABI, functionName: "getItemTypes", args: [ids] })) as unknown as { name: string; category: number; kinshipBonus: number; experienceBonus: number }[];
      const out: Consumable[] = [];
      types.forEach((t, i) => {
        if (Number(t.category) === 2) out.push({ id: ids[i].toString(), name: t.name, bal: Number(held[i].balance), xp: Number(t.experienceBonus), kinship: Number(t.kinshipBonus) });
      });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const list = useMemo(() => consumables ?? [], [consumables]);

  const use = async (c: Consumable) => {
    if (!publicClient) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const n = Math.max(1, Math.min(c.bal, qty[c.id] || 1));
    setBusyId(c.id);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEMS_ABI, functionName: "useConsumables", args: [BigInt(gotchiId), [BigInt(c.id)], [BigInt(n)]] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Consumable used", description: `${n}× ${c.name} on #${gotchiId}` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["my-consumables"] });
    } catch (e) {
      toast({ title: "Failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>;
  if (list.length === 0) return <p className="text-[11px] text-muted-foreground">You don't hold any consumables to use.</p>;

  return (
    <div className="space-y-1.5">
      {list.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 p-1.5">
          <img src={itemImg(c.id)} alt={c.name} className="w-8 h-8 object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{c.name}</div>
            <div className="text-[10px] text-muted-foreground">{c.xp > 0 ? `XP +${c.xp}` : ""}{c.xp > 0 && c.kinship > 0 ? " · " : ""}{c.kinship !== 0 ? `Kinship +${c.kinship}` : ""} · own {c.bal}</div>
          </div>
          <input type="number" min={1} max={c.bal} value={qty[c.id] ?? 1} onChange={(e) => setQty((q) => ({ ...q, [c.id]: Math.max(1, Math.min(c.bal, Number(e.target.value) || 1)) }))} className="h-8 w-14 rounded border border-border/60 bg-background px-2 text-xs" />
          <button disabled={busyId === c.id} onClick={() => use(c)} className="h-8 px-3 rounded-md bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1">
            {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Use"}
          </button>
        </div>
      ))}
    </div>
  );
}
