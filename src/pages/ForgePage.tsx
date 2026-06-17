import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Flame, Loader2, Hammer, PackageOpen } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, FORGE_DIAMOND_BASE, FORGE_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import wearablesData from "../../data/wearables.json";

const ITEM_BALANCES_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;

type WData = { id: number; name: string; category: number };
const WMAP = new Map<number, WData>((wearablesData as WData[]).map((w) => [w.id, w]));
const itemImg = (id: number) => `https://dapp.aavegotchi.com/brand/items/${id}.svg`;
const FORGE_ITEM_MIN = 1_000_000_000; // forge materials (alloy/cores/geodes/schematics) live above this

type QueueItem = { owner: string; itemId: bigint; id: bigint; readyBlock: bigint; claimed: boolean };
type Bal = { tokenId: bigint; balance: bigint };

export default function ForgePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [sel, setSel] = useState<Record<number, number>>({}); // wearableId -> qty to smelt
  const [busy, setBusy] = useState(false);

  // Unequipped wallet wearables (smeltable). itemBalances on the Aavegotchi diamond
  // returns wallet balances; equipped wearables aren't included.
  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["forge-wallet-wearables", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEM_BALANCES_ABI, functionName: "itemBalances", args: [address as `0x${string}`] })) as unknown as { itemId: bigint; balance: bigint }[];
      return res.map((b) => ({ id: Number(b.itemId), bal: Number(b.balance) })).filter((b) => b.bal > 0 && WMAP.get(b.id)?.category === 0);
    },
  });

  // Forge material balances (alloy/cores/geodes/schematics).
  const { data: materials, refetch: refetchMaterials } = useQuery({
    queryKey: ["forge-materials", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "balanceOfOwner", args: [address as `0x${string}`] })) as unknown as Bal[];
      return res.map((b) => ({ id: Number(b.tokenId), bal: Number(b.balance) })).filter((b) => b.bal > 0 && b.id >= FORGE_ITEM_MIN);
    },
  });

  // Forge queue — find this owner's ready-to-claim items.
  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["forge-queue", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 20_000,
    queryFn: async () => {
      const [q, block] = await Promise.all([
        publicClient!.readContract({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "getForgeQueue" }) as Promise<readonly QueueItem[]>,
        publicClient!.getBlockNumber(),
      ]);
      const mine = q.filter((x) => x.owner.toLowerCase() === address!.toLowerCase() && !x.claimed);
      return mine.map((x) => ({ id: x.id, itemId: Number(x.itemId), ready: x.readyBlock <= block }));
    },
  });

  const readyIds = useMemo(() => (queue ?? []).filter((q) => q.ready).map((q) => q.id), [queue]);
  const selCount = Object.values(sel).reduce((s, n) => s + n, 0);

  const setQty = (id: number, qty: number, max: number) => setSel((s) => { const n = { ...s }; const v = Math.max(0, Math.min(qty, max)); if (v === 0) delete n[id]; else n[id] = v; return n; });

  const smelt = async () => {
    if (!publicClient || selCount === 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const ids = Object.keys(sel).map(Number);
    const names = ids.map((id) => `${sel[id]}× ${WMAP.get(id)?.name ?? `#${id}`}`).join(", ");
    if (!window.confirm(`Smelt ${names}? This permanently burns these wearables in exchange for Forge materials (alloy/cores). Irreversible.`)) return;
    setBusy(true);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "smeltWearables", args: [ids.map((i) => BigInt(i)), ids.map((i) => BigInt(sel[i]))] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Smelted", description: "Wearables smelted into Forge materials." });
      setSel({});
      refetchWallet(); refetchMaterials();
    } catch (e) {
      toast({ title: "Smelt failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const claim = async () => {
    if (!publicClient || readyIds.length === 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(true);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "claimForgeQueueItems", args: [readyIds] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Claimed", description: `Claimed ${readyIds.length} forged item(s).` });
      refetchQueue(); refetchMaterials();
    } catch (e) {
      toast({ title: "Claim failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <Seo title="Forge — GotchiCloset" description="Smelt and forge Aavegotchi wearables." canonical={siteUrl("/forge")} />
        <Flame className="w-8 h-8 mx-auto mb-2 text-orange-500" />
        <p className="text-sm font-medium mb-3">Connect a wallet to use the Forge</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Forge — GotchiCloset" description="Smelt wearables into Forge materials and claim forged items." canonical={siteUrl("/forge")} />
      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-1"><Flame className="w-6 h-6 text-orange-500" /> Forge</h1>
      <p className="text-sm text-muted-foreground mb-5">Smelt unequipped wearables into Forge materials, and claim items you've forged. All actions are signed in your wallet.</p>

      {(queue ?? []).length > 0 && (
        <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="font-semibold">{readyIds.length}</span> ready to claim · <span className="text-muted-foreground">{(queue ?? []).length - readyIds.length} still forging</span>
          </div>
          <button disabled={busy || readyIds.length === 0} onClick={claim} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />} Claim ready
          </button>
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Hammer className="w-4 h-4" /> Smelt wearables</div>
        {!wallet ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : wallet.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center rounded-lg border border-border/40">No unequipped wearables in your wallet to smelt.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {wallet.map((w) => {
              const picked = sel[w.id] ?? 0;
              return (
                <div key={w.id} className={`rounded-lg border p-2 ${picked ? "border-orange-500 ring-1 ring-orange-500/40 bg-orange-500/5" : "border-border/40"}`}>
                  <span className="block aspect-square rounded bg-muted/30 flex items-center justify-center"><img src={itemImg(w.id)} alt={WMAP.get(w.id)?.name} className="max-w-[80%] max-h-[80%] object-contain" /></span>
                  <div className="mt-1 text-[10px] font-medium truncate text-center" title={WMAP.get(w.id)?.name}>{WMAP.get(w.id)?.name ?? `#${w.id}`}</div>
                  <div className="text-[9px] text-muted-foreground text-center">owned ×{w.bal}</div>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <button onClick={() => setQty(w.id, picked - 1, w.bal)} className="w-5 h-5 rounded bg-muted text-xs disabled:opacity-40" disabled={picked === 0}>−</button>
                    <span className="text-[11px] w-5 text-center tabular-nums">{picked}</span>
                    <button onClick={() => setQty(w.id, picked + 1, w.bal)} className="w-5 h-5 rounded bg-muted text-xs disabled:opacity-40" disabled={picked >= w.bal}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> Forge materials</div>
        {!materials ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : materials.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-border/40">No alloy, cores, geodes or schematics yet — smelt some wearables to earn materials.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {materials.map((m) => (
              <div key={m.id} className="rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-center">
                <div className="text-[10px] text-muted-foreground">Material #{m.id - FORGE_ITEM_MIN}</div>
                <div className="text-base font-bold tabular-nums">{m.bal.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selCount > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs"><span className="font-semibold">{selCount}</span> wearable(s) to smelt</span>
          <button disabled={busy} onClick={smelt} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Smelting…</> : <><Flame className="w-4 h-4" /> Smelt</>}
          </button>
          <button onClick={() => setSel({})} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}
    </div>
  );
}
