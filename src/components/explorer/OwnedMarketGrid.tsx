import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, Tag, X } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, REALM_DIAMOND_BASE, TILE_DIAMOND_BASE, FORGE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE, ERC1155_MARKETPLACE_ABI, ERC721_MARKETPLACE_ABI } from "@/lib/lending/contracts";
import { GOTCHIVERSE_SUBGRAPH, CORE_SUBGRAPH } from "@/lib/subgraph";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { AssetImage, itemImageCandidates, installationImageCandidates, parcelImageCandidates, tileImageCandidates } from "./AssetImage";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { CreateAuctionButton } from "./CreateAuctionButton";
import wearablesData from "../../../data/wearables.json";

type OwnedKind = "item" | "installation" | "parcel" | "tile" | "wearable" | "forge" | "fakegotchi" | "portal";
type Owned = { id: string; bal: number };

// Baazaar listing category per asset type. Forge items have per-item categories
// (alloy/essence/cores span 7/8/9/11) so they're auction-only here (no single
// bulk-list category). FAKE Gotchis list under 5, closed portals under 0.
const LISTING_CATEGORY: Partial<Record<OwnedKind, number>> = { item: 2, installation: 4, parcel: 4, tile: 5, wearable: 0, fakegotchi: 5, portal: 0 };
// Wearable item ids (category 0) — excluded from the consumable "item" tab.
const WEARABLE_IDS = new Set<number>((wearablesData as { id: number; category: number }[]).filter((w) => w.category === 0).map((w) => w.id));

const ITEM_BALANCES_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;
const INSTALLATIONS_BALANCES_ABI = [
  { name: "installationsBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "installationId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;
const TILES_BALANCES_ABI = [
  { name: "tilesBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "tileId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;
// Forge items: balanceOfOwner(address) -> (tokenId,balance)[]. FAKE Gotchis are
// ERC721Enumerable-style: tokenIdsOfOwner(address) -> uint32[].
const BALANCE_OF_OWNER_ABI = [
  { name: "balanceOfOwner", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "tokenId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;
const TOKEN_IDS_OF_OWNER_ABI = [
  { name: "tokenIdsOfOwner", type: "function", stateMutability: "view", inputs: [{ name: "_owner", type: "address" }], outputs: [{ type: "uint32[]" }] },
] as const;
const APPROVAL_ABI = [
  { name: "isApprovedForAll", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "setApprovalForAll", type: "function", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
] as const;

// The token contract that actually holds each asset type (for approval + listing).
const TOKEN_CONTRACT: Record<OwnedKind, `0x${string}`> = {
  item: AAVEGOTCHI_DIAMOND_BASE,
  installation: INSTALLATION_DIAMOND_BASE,
  parcel: REALM_DIAMOND_BASE,
  tile: TILE_DIAMOND_BASE,
  wearable: AAVEGOTCHI_DIAMOND_BASE,
  forge: FORGE_DIAMOND_BASE,
  fakegotchi: FAKE_GOTCHIS_NFT_BASE,
  portal: AAVEGOTCHI_DIAMOND_BASE,
};

async function fetchOwned(kind: OwnedKind, address: string, publicClient: NonNullable<ReturnType<typeof usePublicClient>>): Promise<Owned[]> {
  if (kind === "item" || kind === "wearable") {
    const res = (await publicClient.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEM_BALANCES_ABI, functionName: "itemBalances", args: [address as `0x${string}`] })) as unknown as { itemId: bigint; balance: bigint }[];
    // itemBalances returns wearables + consumables together; split by tab.
    // wearable tab = category-0 ids; item tab = everything else (consumables).
    return res
      .map((b) => ({ id: b.itemId.toString(), bal: Number(b.balance) }))
      .filter((b) => b.bal > 0 && (kind === "wearable" ? WEARABLE_IDS.has(Number(b.id)) : !WEARABLE_IDS.has(Number(b.id))));
  }
  if (kind === "installation") {
    const res = (await publicClient.readContract({ address: INSTALLATION_DIAMOND_BASE, abi: INSTALLATIONS_BALANCES_ABI, functionName: "installationsBalances", args: [address as `0x${string}`] })) as unknown as { installationId: bigint; balance: bigint }[];
    return res.map((b) => ({ id: b.installationId.toString(), bal: Number(b.balance) })).filter((b) => b.bal > 0);
  }
  if (kind === "tile") {
    const res = (await publicClient.readContract({ address: TILE_DIAMOND_BASE, abi: TILES_BALANCES_ABI, functionName: "tilesBalances", args: [address as `0x${string}`] })) as unknown as { tileId: bigint; balance: bigint }[];
    return res.map((b) => ({ id: b.tileId.toString(), bal: Number(b.balance) })).filter((b) => b.bal > 0);
  }
  if (kind === "forge") {
    const res = (await publicClient.readContract({ address: FORGE_DIAMOND_BASE, abi: BALANCE_OF_OWNER_ABI, functionName: "balanceOfOwner", args: [address as `0x${string}`] })) as unknown as { tokenId: bigint; balance: bigint }[];
    return res.map((b) => ({ id: b.tokenId.toString(), bal: Number(b.balance) })).filter((b) => b.bal > 0);
  }
  if (kind === "fakegotchi") {
    const ids = (await publicClient.readContract({ address: FAKE_GOTCHIS_NFT_BASE, abi: TOKEN_IDS_OF_OWNER_ABI, functionName: "tokenIdsOfOwner", args: [address as `0x${string}`] })) as unknown as readonly (bigint | number)[];
    return ids.map((id) => ({ id: String(id), bal: 1 }));
  }
  if (kind === "portal") {
    const q = `{ portals(first: 500, where: { owner: "${address}", status_lt: 3 }){ tokenId } }`;
    const r = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json();
    return (j.data?.portals ?? []).map((p: { tokenId: string }) => ({ id: String(p.tokenId), bal: 1 }));
  }
  const q = `{ parcels(first: 500, where: { owner: "${address}" }){ tokenId } }`;
  const r = await fetch(GOTCHIVERSE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const j = await r.json();
  return (j.data?.parcels ?? []).map((p: { tokenId: string }) => ({ id: String(p.tokenId), bal: 1 }));
}

function imgFor(kind: OwnedKind, id: string) {
  if (kind === "installation") return installationImageCandidates(id);
  if (kind === "parcel") return parcelImageCandidates(id);
  if (kind === "tile") return tileImageCandidates(id);
  if (kind === "wearable") return getWearableIconUrlCandidates(Number(id));
  // forge items / fakegotchis / portals have no shared brand-SVG endpoint here;
  // AssetImage falls back to the tile background + #id label.
  if (kind === "fakegotchi" || kind === "portal") return [] as string[];
  return itemImageCandidates(id);
}

/** Owned inventory for a market asset type, with multi-select bulk listing. */
export function OwnedMarketGrid({ itemKind }: { itemKind: OwnedKind }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const erc721 = itemKind === "parcel" || itemKind === "fakegotchi" || itemKind === "portal";
  const tokenContract = TOKEN_CONTRACT[itemKind];
  // Bulk-list is available where a single Baazaar listing category applies
  // (everything except forge, whose items span multiple categories).
  const canList = LISTING_CATEGORY[itemKind] !== undefined;
  // Whitelisted GBM auction kinds on Base (verified from live auctions). Wearables
  // and consumable items are NOT GBM-auctionable, so they get no auction button.
  const auctionKind: "erc721" | "erc1155" | null =
    itemKind === "parcel" || itemKind === "fakegotchi" || itemKind === "portal" ? "erc721"
    : itemKind === "tile" || itemKind === "installation" || itemKind === "forge" ? "erc1155"
    : null;

  const { data: owned, isLoading, refetch } = useQuery({
    queryKey: ["owned-market", itemKind, address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: () => fetchOwned(itemKind, address!.toLowerCase(), publicClient!),
  });

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const listAll = async () => {
    const p = Number(price);
    if (!publicClient || !address || !(p > 0) || selected.size === 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const wei = BigInt(Math.floor(p * 1e18));
    const ids = [...selected];
    setProgress({ done: 0, total: ids.length });
    try {
      const approved = (await publicClient.readContract({ address: tokenContract, abi: APPROVAL_ABI, functionName: "isApprovedForAll", args: [address, AAVEGOTCHI_DIAMOND_BASE] })) as boolean;
      if (!approved) {
        const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: tokenContract, abi: APPROVAL_ABI, functionName: "setApprovalForAll", args: [AAVEGOTCHI_DIAMOND_BASE, true] });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      let ok = 0, failed = 0;
      for (const id of ids) {
        try {
          const item = owned?.find((o) => o.id === id);
          const cat = BigInt(LISTING_CATEGORY[itemKind] ?? 0);
          const hash = erc721
            ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "addERC721Listing", args: [tokenContract, BigInt(id), cat, wei] })
            : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI, functionName: "setERC1155Listing", args: [tokenContract, BigInt(id), BigInt(item?.bal ?? 1), cat, wei] });
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
          ok++;
        } catch (e) {
          failed++;
          if (failed === 1) toast({ title: "A listing failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
        }
        setProgress((pr) => (pr ? { ...pr, done: pr.done + 1 } : pr));
      }
      toast({ title: "Listing complete", description: `Listed ${ok}/${ids.length}${failed ? `, ${failed} failed` : ""} at ${p} GHST.` });
      setSelected(new Set());
      refetch();
    } catch (e) {
      toast({ title: "Approval failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
    } finally {
      setProgress(null);
    }
  };

  const rows = useMemo(() => owned ?? [], [owned]);

  if (!isConnected) return <div className="text-center py-12 text-muted-foreground text-sm">Connect a wallet to see your {itemKind}s.</div>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (rows.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">You don't own any {itemKind}s.</div>;

  return (
    <div className="p-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pb-20">
        {rows.map((o) => {
          const sel = selected.has(o.id);
          return (
            <div
              key={o.id}
              className={`group rounded-xl border p-2 space-y-1.5 transition-all ${sel ? "border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-500/5" : "border-border/40 bg-background/60 hover:border-primary/40"}`}
            >
              <button type="button" onClick={() => canList && toggle(o.id)} className="w-full text-left space-y-1.5" disabled={!canList}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">#{o.id}{o.bal > 1 ? ` ×${o.bal}` : ""}</span>
                  {canList ? (sel ? <span className="text-emerald-500 text-xs">✓ list</span> : <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">tap to list</span>) : <span className="text-[9px] text-muted-foreground">owned</span>}
                </div>
                <div className="h-16 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                  <AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} className="max-h-14 max-w-14 object-contain" />
                </div>
              </button>
              {auctionKind && (
                <CreateAuctionButton
                  kind={auctionKind}
                  category={4}
                  tokenId={o.id}
                  contractAddress={tokenContract}
                  label={`${itemKind} #${o.id}`}
                  maxQuantity={o.bal}
                  compact
                  onCreated={refetch}
                />
              )}
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price each (GHST)" className="h-8 w-36 rounded border border-border bg-background px-2 text-xs" />
          <button disabled={!!progress || !(Number(price) > 0)} onClick={listAll} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
            {progress ? (<><Loader2 className="w-4 h-4 animate-spin" /> Listing {progress.done}/{progress.total}…</>) : (<><Tag className="w-4 h-4" /> List {selected.size}</>)}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
