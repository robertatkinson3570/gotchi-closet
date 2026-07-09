import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, Tag, X } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, REALM_DIAMOND_BASE, TILE_DIAMOND_BASE, FORGE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE, FAKE_CARDS_DIAMOND_BASE, GUARDIAN_SKINS_DIAMOND_BASE, WEARABLE_DIAMOND_BASE, ERC1155_MARKETPLACE_ABI, ERC721_MARKETPLACE_ABI } from "@/lib/lending/contracts";
import { GOTCHIVERSE_SUBGRAPH, CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { AssetImage, itemImageCandidates, forgeImageCandidates, installationImageCandidates, parcelImageCandidates, tileImageCandidates } from "./AssetImage";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";
import { CreateAuctionButton } from "./CreateAuctionButton";
import { RecentSales } from "./RecentSales";
import { ParcelDetailModal } from "@/components/lending/ParcelDetailModal";
import { fetchOwnedListings, type ListedMap } from "./detail/ownedListings";
import { itemMetaSync } from "@/lib/explorer/itemMeta";
import { useDetailNav } from "./detail/useDetailNav";
import { DetailDialogShell } from "./detail/DetailDialogShell";
import { Wearable3DThumb } from "@/components/viewer3d/Wearable3DThumb";
import wearablesData from "../../../data/wearables.json";

const fmtGhst = (wei: string) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

type OwnedKind = "item" | "installation" | "parcel" | "tile" | "wearable" | "forge" | "fakegotchi" | "portal" | "fakecard" | "guardian";
type Owned = { id: string; bal: number };

// Baazaar listing category per asset type. Forge items span categories 7/8/9/11
// by tokenId (see forgeCategory) so they're handled per-item, not via this map.
// FAKE Gotchis 5, portals 0, FAKE Cards 6, Guardian Skins 12.
const LISTING_CATEGORY: Partial<Record<OwnedKind, number>> = { item: 2, installation: 4, parcel: 4, tile: 5, wearable: 0, fakegotchi: 5, portal: 0, fakecard: 6, guardian: 12 };

// Forge Baazaar listing category from tokenId (verified from live listings):
// <1e9 schematic(8), =1e9 alloy(7), 1e9+1..1e9+7 geode(9), >=1e9+8 core(11).
function forgeCategory(id: number): number {
  if (id < 1_000_000_000) return 8;
  if (id === 1_000_000_000) return 7;
  if (id <= 1_000_000_007) return 9;
  return 11;
}
// Owned-enumeration id ranges for collections that expose only balanceOf/Batch.
const FAKECARD_IDS = Array.from({ length: 30 }, (_, i) => i);        // 0..29
const GUARDIAN_IDS = Array.from({ length: 40 }, (_, i) => i + 1);    // 1..40
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
// FAKE Cards / Guardian Skins expose no enumeration — scan a fixed id range.
const BALANCE_OF_BATCH_ABI = [
  { name: "balanceOfBatch", type: "function", stateMutability: "view", inputs: [{ name: "accounts", type: "address[]" }, { name: "ids", type: "uint256[]" }], outputs: [{ type: "uint256[]" }] },
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
  fakecard: FAKE_CARDS_DIAMOND_BASE,
  guardian: GUARDIAN_SKINS_DIAMOND_BASE,
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
    const r = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json();
    return (j.data?.portals ?? []).map((p: { tokenId: string }) => ({ id: String(p.tokenId), bal: 1 }));
  }
  if (kind === "fakecard" || kind === "guardian") {
    // No on-chain enumeration — scan a fixed id range via balanceOfBatch.
    const ids = kind === "fakecard" ? FAKECARD_IDS : GUARDIAN_IDS;
    const addr = address as `0x${string}`;
    const bals = (await publicClient.readContract({ address: TOKEN_CONTRACT[kind], abi: BALANCE_OF_BATCH_ABI, functionName: "balanceOfBatch", args: [ids.map(() => addr), ids.map((i) => BigInt(i))] })) as unknown as bigint[];
    return ids.map((id, i) => ({ id: String(id), bal: Number(bals[i] ?? 0n) })).filter((b) => b.bal > 0);
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
  // Forge items use a dedicated /brand/forge scheme (schematic/alloy/essence/
  // geode/core art) keyed by rarity+slot, not the wearable /items/{id} path.
  if (kind === "forge") return forgeImageCandidates(id);
  // fakegotchi / portal / fakecard / guardian have no shared brand-SVG endpoint
  // here; AssetImage falls back to the tile background + #id label.
  if (kind === "fakegotchi" || kind === "portal" || kind === "fakecard" || kind === "guardian") return [] as string[];
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
  const [sort, setSort] = useState<"id-desc" | "id-asc" | "qty-desc">("id-desc");
  const [dPrice, setDPrice] = useState("");
  const [dBusy, setDBusy] = useState<"" | "list" | "cancel">("");
  const [price, setPrice] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const erc721 = itemKind === "parcel" || itemKind === "fakegotchi" || itemKind === "portal";
  const tokenContract = TOKEN_CONTRACT[itemKind];
  // Bulk-list is available for everything (forge derives its category per-item
  // via forgeCategory; all others have a single Baazaar listing category).
  const canList = itemKind === "forge" || LISTING_CATEGORY[itemKind] !== undefined;
  // Whitelisted GBM auction kinds on Base (verified from live auctions). Wearables
  // ARE auctionable (erc1155) but via the WEARABLE_DIAMOND, not the aavegotchi
  // diamond that holds itemBalances. Consumable items have no live auctions, so
  // they stay excluded.
  const auctionKind: "erc721" | "erc1155" | null =
    itemKind === "parcel" || itemKind === "fakegotchi" || itemKind === "portal" ? "erc721"
    : itemKind === "tile" || itemKind === "installation" || itemKind === "forge" || itemKind === "wearable" ? "erc1155"
    : null;
  // GBM auction category: 4 for every whitelisted non-gotchi asset (verified on Base).
  const auctionCategory = 4;
  // Wearables auction on the WEARABLE_DIAMOND; everything else on its own token contract.
  const auctionContract = itemKind === "wearable" ? WEARABLE_DIAMOND_BASE : tokenContract;
  // Single Baazaar listing category for this asset (forge spans several per-item,
  // so its per-token listings aren't enrichable here — bulk-list still works).
  const listingCategory = itemKind === "forge" ? null : (LISTING_CATEGORY[itemKind] ?? null);

  const { data: owned, isLoading, refetch } = useQuery({
    queryKey: ["owned-market", itemKind, address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: () => fetchOwned(itemKind, address!.toLowerCase(), publicClient!),
  });

  // The connected wallet's active listings for these tokens (price + edit/cancel).
  const { data: listedMap } = useQuery<ListedMap>({
    queryKey: ["owned-listings", itemKind, address?.toLowerCase()],
    enabled: !!address && listingCategory != null,
    staleTime: 30_000,
    queryFn: () => fetchOwnedListings(erc721 ? "erc721" : "erc1155", address!, listingCategory!, tokenContract),
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
          const cat = BigInt(itemKind === "forge" ? forgeCategory(Number(id)) : (LISTING_CATEGORY[itemKind] ?? 0));
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

  // Single-parcel list / cancel from the detail card.
  const listOne = async (id: string) => {
    const p = Number(dPrice);
    if (!publicClient || !address || !(p > 0)) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setDBusy("list");
    try {
      const wei = BigInt(Math.round(p * 1e6)) * 10n ** 12n;
      const approved = (await publicClient.readContract({ address: tokenContract, abi: APPROVAL_ABI, functionName: "isApprovedForAll", args: [address, AAVEGOTCHI_DIAMOND_BASE] })) as boolean;
      if (!approved) { const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: tokenContract, abi: APPROVAL_ABI, functionName: "setApprovalForAll", args: [AAVEGOTCHI_DIAMOND_BASE, true] }); await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 }); }
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "addERC721Listing", args: [tokenContract, BigInt(id), BigInt(LISTING_CATEGORY[itemKind] ?? 4), wei] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Listed", description: `#${id} listed at ${p} GHST.` }); setDPrice(""); refetch();
    } catch (e) { toast({ title: "List failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
  };
  const cancelOne = async (id: string) => {
    if (!publicClient || !address) return;
    setDBusy("cancel");
    try {
      const cat = LISTING_CATEGORY[itemKind] ?? 4;
      const q = `{ erc721Listings(first:1, where:{ tokenId:"${id}", seller:"${address.toLowerCase()}", category:${cat}, cancelled:false, timePurchased:"0" }){ id } }`;
      const r = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const lid = (await r.json()).data?.erc721Listings?.[0]?.id;
      if (!lid) { toast({ title: "No active listing found" }); return; }
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "cancelERC721Listing", args: [BigInt(lid)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Listing cancelled" }); refetch();
    } catch (e) { toast({ title: "Cancel failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
  };

  // List a single owned token at `dPrice` (erc721 or erc1155), from the detail dialog.
  const listSingle = async (o: Owned) => {
    const p = Number(dPrice);
    if (!publicClient || !address || !(p > 0) || listingCategory == null) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setDBusy("list");
    try {
      const wei = BigInt(Math.round(p * 1e6)) * 10n ** 12n;
      const approved = (await publicClient.readContract({ address: tokenContract, abi: APPROVAL_ABI, functionName: "isApprovedForAll", args: [address, AAVEGOTCHI_DIAMOND_BASE] })) as boolean;
      if (!approved) { const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: tokenContract, abi: APPROVAL_ABI, functionName: "setApprovalForAll", args: [AAVEGOTCHI_DIAMOND_BASE, true] }); await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 }); }
      const hash = erc721
        ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "addERC721Listing", args: [tokenContract, BigInt(o.id), BigInt(listingCategory), wei] })
        : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI, functionName: "setERC1155Listing", args: [tokenContract, BigInt(o.id), BigInt(o.bal), BigInt(listingCategory), wei] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Listed", description: `#${o.id} listed at ${p} GHST.` }); setDPrice(""); refetch();
    } catch (e) { toast({ title: "List failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
  };
  // Cancel an existing listing by its known id (erc721 or erc1155).
  const cancelListing = async (listed: { listingId: string }) => {
    if (!publicClient || !address) return;
    setDBusy("cancel");
    try {
      const hash = erc721
        ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC721_MARKETPLACE_ABI, functionName: "cancelERC721Listing", args: [BigInt(listed.listingId)] })
        : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ERC1155_MARKETPLACE_ABI, functionName: "cancelERC1155Listing", args: [BigInt(listed.listingId)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Listing cancelled" }); refetch();
    } catch (e) { toast({ title: "Cancel failed", description: parseRevert(e).slice(0, 140), variant: "destructive" }); } finally { setDBusy(""); }
  };
  // Edit = cancel the old listing, then re-list at the new price (no single-tx update on Base).
  const editListing = async (o: Owned, listed: { listingId: string }) => { await cancelListing(listed); await listSingle(o); };

  const rows = useMemo(() => {
    const r = [...(owned ?? [])];
    if (sort === "id-asc") r.sort((a, b) => Number(a.id) - Number(b.id));
    else if (sort === "qty-desc") r.sort((a, b) => b.bal - a.bal || Number(b.id) - Number(a.id));
    else r.sort((a, b) => Number(b.id) - Number(a.id)); // id-desc (default)
    return r;
  }, [owned, sort]);
  const nav = useDetailNav({ items: rows, getId: (o) => o.id, asset: itemKind });

  if (!isConnected) return <div className="text-center py-12 text-muted-foreground text-sm">Connect a wallet to see your {itemKind}s.</div>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (rows.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">You don't own any {itemKind}s.</div>;

  return (
    <div className="p-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-[11px] text-muted-foreground">{rows.length} owned</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-7 rounded-md border border-border/50 bg-background px-2 text-[11px]">
          <option value="id-desc">ID ↓ (newest)</option>
          <option value="id-asc">ID ↑</option>
          <option value="qty-desc">Quantity ↓</option>
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pb-20">
        {rows.map((o) => {
          const sel = selected.has(o.id);
          return (
            <div
              key={o.id}
              className={`group rounded-xl border p-2 space-y-1.5 transition-all ${sel ? "border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-500/5" : "border-border/40 bg-background/60 hover:border-primary/40"}`}
            >
              <button type="button" onClick={() => canList && toggle(o.id)} disabled={!canList} className="w-full flex items-center justify-between text-left">
                <span className="text-[10px] font-mono text-muted-foreground">#{o.id}{o.bal > 1 ? ` ×${o.bal}` : ""}</span>
                {canList ? (sel ? <span className="text-emerald-500 text-xs">✓ list</span> : <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">tap to list</span>) : <span className="text-[9px] text-muted-foreground">owned</span>}
              </button>
              <div onClick={() => { nav.openItem(o); setDPrice(""); }} title="View details" className="cursor-pointer h-16 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 hover:from-primary/5 hover:to-primary/15 transition-colors">
                {itemKind === "wearable" ? (
                  <Wearable3DThumb wearableId={o.id} fallback={<AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} className="max-h-14 max-w-14 object-contain" />} />
                ) : (
                  <AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} className="max-h-14 max-w-14 object-contain" />
                )}
              </div>
              {itemKind !== "forge" && itemMetaSync(o.id)?.name && (
                <div className="text-[9px] text-muted-foreground text-center truncate" title={itemMetaSync(o.id)!.name}>{itemMetaSync(o.id)!.name}</div>
              )}
              {listingCategory != null && (
                listedMap?.[o.id]
                  ? <div className="text-[10px] text-emerald-500 font-semibold text-center">{fmtGhst(listedMap[o.id].priceWei)} GHST</div>
                  : <div className="text-[9px] text-muted-foreground text-center">Not listed</div>
              )}
              {auctionKind && (
                <CreateAuctionButton
                  kind={auctionKind}
                  category={auctionCategory}
                  tokenId={o.id}
                  contractAddress={auctionContract}
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

      {nav.open && itemKind === "parcel" && (
        <ParcelDetailModal
          parcelId={nav.open.id}
          onClose={() => nav.close()}
          onPrev={nav.prev} onNext={nav.next} hasPrev={nav.hasPrev} hasNext={nav.hasNext} shareUrl={nav.shareUrl}
          marketPanel={(
            <>
              <div className="text-sm font-semibold">Sell this parcel</div>
              <div className="flex items-center gap-1.5">
                <input type="number" value={dPrice} onChange={(e) => setDPrice(e.target.value)} placeholder="Price (GHST)" className="h-9 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                <button disabled={dBusy !== "" || !(Number(dPrice) > 0)} onClick={() => nav.open && listOne(nav.open.id)} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{dBusy === "list" ? "Listing…" : "List"}</button>
                <button disabled={dBusy !== ""} onClick={() => nav.open && cancelOne(nav.open.id)} className="h-9 px-3 rounded border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50 shrink-0">{dBusy === "cancel" ? "…" : "Cancel"}</button>
              </div>
              <CreateAuctionButton kind="erc721" category={4} tokenId={nav.open.id} contractAddress={tokenContract} label={`Parcel #${nav.open.id}`} onCreated={refetch} />
              <RecentSales kind="erc721" tokenId={nav.open.id} />
            </>
          )}
        />
      )}

      {nav.open && itemKind !== "parcel" && (() => {
        const o = nav.open;
        const listed = listedMap?.[o.id];
        const meta = itemKind !== "forge" ? itemMetaSync(o.id) : undefined;
        return (
          <DetailDialogShell
            title={<>{meta?.name ?? itemKind} <span className="text-muted-foreground font-mono text-sm">#{o.id}</span></>}
            onClose={() => nav.close()} onPrev={nav.prev} onNext={nav.next} hasPrev={nav.hasPrev} hasNext={nav.hasNext} shareUrl={nav.shareUrl}
            widthClass="w-[min(440px,96vw)]"
          >
            {itemKind === "wearable" ? (
              <div className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                <Wearable3DThumb wearableId={o.id} interactive autoRotate className="w-full h-full" fallback={
                  <div className="w-full h-full flex items-center justify-center [&_img]:max-h-28 [&_img]:max-w-28 [&_img]:object-contain"><AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} /></div>
                } />
              </div>
            ) : (
            <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 flex items-center justify-center [&_img]:max-h-28 [&_img]:max-w-28 [&_img]:object-contain">
              <AssetImage candidates={imgFor(itemKind, o.id)} alt={`#${o.id}`} />
            </div>
            )}
            {o.bal > 1 && <div className="text-center text-xs text-muted-foreground">You own ×{o.bal}</div>}
            {listingCategory != null && (
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="text-sm font-semibold">Your listing</div>
                {listed ? (
                  <>
                    <div className="text-2xl font-bold text-emerald-500 text-center">{fmtGhst(listed.priceWei)} GHST</div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" value={dPrice} onChange={(e) => setDPrice(e.target.value)} placeholder="New price (GHST)" className="h-9 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                      <button disabled={dBusy !== "" || !(Number(dPrice) > 0)} onClick={() => editListing(o, listed)} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{dBusy === "list" ? "Saving…" : "Edit"}</button>
                      <button disabled={dBusy !== ""} onClick={() => cancelListing(listed)} className="h-9 px-3 rounded border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50 shrink-0">{dBusy === "cancel" ? "…" : "Cancel"}</button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={dPrice} onChange={(e) => setDPrice(e.target.value)} placeholder="Price (GHST)" className="h-9 flex-1 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                    <button disabled={dBusy !== "" || !(Number(dPrice) > 0)} onClick={() => listSingle(o)} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">{dBusy === "list" ? "Listing…" : "List"}</button>
                  </div>
                )}
              </div>
            )}
            {auctionKind && <CreateAuctionButton kind={auctionKind} category={auctionCategory} tokenId={o.id} contractAddress={auctionContract} label={`${itemKind} #${o.id}`} maxQuantity={o.bal} onCreated={refetch} />}
            <RecentSales kind={erc721 ? "erc721" : "erc1155"} tokenId={o.id} />
          </DetailDialogShell>
        );
      })()}
    </div>
  );
}
