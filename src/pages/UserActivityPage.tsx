import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, Tag, HandCoins, Gavel, ShoppingCart, Receipt, Coins, Inbox } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { shortAddress as short } from "@/lib/format";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, GBM_DIAMOND_BASE, REALM_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, TILE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE, WEARABLE_DIAMOND_BASE, FORGE_DIAMOND_BASE, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { CORE_SUBGRAPH, GBM_SUBGRAPH, GOTCHIVERSE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "@/components/explorer/AssetImage";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { GbmEarningsPanel } from "@/components/explorer/GbmEarningsPanel";

// Marketplace cancel calls live on the Aavegotchi diamond; auction claim/cancel
// on the GBM diamond. Exact signatures verified from the live dapp bundle.
const MARKET_ABI = [
  { name: "cancelERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  { name: "cancelERC1155Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  { name: "cancelERC721BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }], outputs: [] },
  { name: "cancelERC1155BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }], outputs: [] },
  // Re-pricing an active listing = call add/set again with the new price (the
  // diamond updates the existing listing in place).
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_category", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
  { name: "setERC1155Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc1155TokenAddress", type: "address" }, { name: "_erc1155TypeId", type: "uint256" }, { name: "_quantity", type: "uint256" }, { name: "_category", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
  // Fill a buy order made on an asset you own (accept an offer).
  { name: "executeERC721BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }, { name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
  { name: "executeERC1155BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }, { name: "_erc1155TokenAddress", type: "address" }, { name: "_erc1155TokenId", type: "uint256" }, { name: "_category", type: "uint256" }, { name: "_priceInWei", type: "uint256" }, { name: "_quantity", type: "uint256" }], outputs: [] },
  { name: "isApprovedForAll", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "setApprovalForAll", type: "function", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
] as const;

// Token contract that holds an asset, by (kind, baazaar category). Needed for
// re-pricing (add/set listing) and accepting offers (execute buy order).
function contractFor(kind: "erc721" | "erc1155", category: number): `0x${string}` {
  if (kind === "erc721") {
    if (category === BAAZAAR_CATEGORY.REALM) return REALM_DIAMOND_BASE;       // parcel
    if (category === 5) return FAKE_GOTCHIS_NFT_BASE;                          // fake gotchi
    return AAVEGOTCHI_DIAMOND_BASE;                                            // gotchi (3) / portal (0)
  }
  if (category === BAAZAAR_CATEGORY.INSTALLATION) return INSTALLATION_DIAMOND_BASE;
  if (category === BAAZAAR_CATEGORY.TILE) return TILE_DIAMOND_BASE;
  return AAVEGOTCHI_DIAMOND_BASE;                                             // wearable (0) / item (2)
}
const GBM_MANAGE_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionID", type: "uint256" }], outputs: [] },
  { name: "cancelAuction", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionID", type: "uint256" }], outputs: [] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";
const ghst = (wei: string) => {
  const v = Number(wei) / 1e18;
  if (v > 0 && v < 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 1 : 0 });
};
function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const m = Math.floor(Math.abs(s) / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const v = d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "just now";
  return v === "just now" ? v : s < 0 ? `in ${v}` : `${v} ago`;
}
async function gql(url: string, query: string, variables?: any) {
  const res = await coreSubgraphFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

type TabKey = "listings" | "offers" | "received" | "auctions" | "bids" | "purchases" | "sales" | "earnings";
type Item = {
  id: string;
  refId: string;
  kind: "erc721" | "erc1155";
  category: number;
  contract?: string;
  tokenId: string;
  quantity: number;
  priceWei: string;
  counterparty?: string;
  time: number;
  status?: string;
  action?: "cancelListing" | "cancelOffer" | "claim" | "cancelAuction" | "acceptOffer";
  auctionType?: string;
};

async function fetchListings(addr: string): Promise<Item[]> {
  const d = await gql(CORE_SUBGRAPH, `query($a: String!){
    erc721Listings(first: 200, where: { seller: $a, cancelled: false, timePurchased: "0" }, orderBy: timeCreated, orderDirection: desc){ id category tokenId priceInWei timeCreated }
    erc1155Listings(first: 200, where: { seller: $a, cancelled: false, sold: false }, orderBy: timeCreated, orderDirection: desc){ id category erc1155TypeId quantity priceInWei timeCreated }
  }`, { a: addr });
  const a: Item[] = (d?.erc721Listings ?? []).map((l: any) => ({ id: `l721-${l.id}`, refId: l.id, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1, priceWei: l.priceInWei, time: Number(l.timeCreated), status: "Listed", action: "cancelListing" as const }));
  const b: Item[] = (d?.erc1155Listings ?? []).map((l: any) => ({ id: `l1155-${l.id}`, refId: l.id, kind: "erc1155" as const, category: Number(l.category), tokenId: l.erc1155TypeId, quantity: Number(l.quantity) || 1, priceWei: l.priceInWei, time: Number(l.timeCreated), status: "Listed", action: "cancelListing" as const }));
  return [...a, ...b].sort((x, y) => y.time - x.time);
}

async function fetchOffersMade(addr: string): Promise<Item[]> {
  const d = await gql(CORE_SUBGRAPH, `query($a: String!){
    erc721BuyOrders(first: 200, where: { buyer: $a, canceled: false }, orderBy: createdAt, orderDirection: desc){ id category erc721TokenId priceInWei createdAt duration executedAt }
    erc1155BuyOrders(first: 200, where: { buyer: $a, canceled: false }, orderBy: createdAt, orderDirection: desc){ id category erc1155TokenId quantity priceInWei createdAt duration completedAt }
  }`, { a: addr });
  const now = Math.floor(Date.now() / 1000);
  const open721 = (d?.erc721BuyOrders ?? []).filter((o: any) => o.executedAt == null && (Number(o.duration) === 0 || Number(o.createdAt) + Number(o.duration) > now));
  const open1155 = (d?.erc1155BuyOrders ?? []).filter((o: any) => o.completedAt == null && (Number(o.duration) === 0 || Number(o.createdAt) + Number(o.duration) > now));
  const a: Item[] = open721.map((o: any) => ({ id: `o721-${o.id}`, refId: o.id, kind: "erc721" as const, category: Number(o.category), tokenId: o.erc721TokenId, quantity: 1, priceWei: o.priceInWei, time: Number(o.createdAt), status: "Open", action: "cancelOffer" as const }));
  const b: Item[] = open1155.map((o: any) => ({ id: `o1155-${o.id}`, refId: o.id, kind: "erc1155" as const, category: Number(o.category), tokenId: o.erc1155TypeId, quantity: Number(o.quantity) || 1, priceWei: o.priceInWei, time: Number(o.createdAt), status: "Open", action: "cancelOffer" as const }));
  return [...a, ...b].sort((x, y) => y.time - x.time);
}

function gbmKind(contract: string, type: string): { kind: "erc721" | "erc1155"; category: number } {
  const c = (contract || "").toLowerCase();
  if (c === REALM_DIAMOND_BASE.toLowerCase()) return { kind: "erc721", category: BAAZAAR_CATEGORY.REALM };
  if (c === INSTALLATION_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.INSTALLATION };
  if (c === TILE_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.TILE };
  if (c === AAVEGOTCHI_DIAMOND_BASE.toLowerCase()) return type === "erc1155" ? { kind: "erc1155", category: BAAZAAR_CATEGORY.CONSUMABLE } : { kind: "erc721", category: BAAZAAR_CATEGORY.AAVEGOTCHI };
  if (c === WEARABLE_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.WEARABLE };
  if (c === FORGE_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.CONSUMABLE };
  if (c === FAKE_GOTCHIS_NFT_BASE.toLowerCase()) return { kind: "erc721", category: 5 };
  return { kind: type === "erc1155" ? "erc1155" : "erc721", category: -1 };
}

async function fetchAuctionsCreated(addr: string): Promise<Item[]> {
  const now = Math.floor(Date.now() / 1000);
  const d = await gql(GBM_SUBGRAPH, `query($a: String!){ auctions(first: 200, where: { seller: $a, cancelled: false }, orderBy: endsAt, orderDirection: desc){ id type tokenId contractAddress highestBid highestBidder totalBids endsAt claimed } }`, { a: addr });
  return (d?.auctions ?? []).map((au: any) => {
    const { kind, category } = gbmKind(au.contractAddress, au.type);
    const ended = Number(au.endsAt) <= now;
    const claimed = !!au.claimed;
    const noBids = Number(au.totalBids) === 0;
    return {
      id: `ac-${au.id}`, refId: au.id, kind, category, contract: (au.contractAddress ?? "").toLowerCase(), tokenId: au.tokenId, quantity: 1,
      priceWei: au.highestBid ?? "0", counterparty: (au.highestBidder ?? "").toLowerCase(), time: Number(au.endsAt), auctionType: au.type,
      status: claimed ? "Claimed" : ended ? "Ended" : "Live",
      action: claimed ? undefined : ended ? "claim" : noBids ? "cancelAuction" : undefined,
    } as Item;
  });
}

async function fetchBids(addr: string): Promise<Item[]> {
  const now = Math.floor(Date.now() / 1000);
  const a = addr.toLowerCase();
  // Query the bids the user PLACED (not just auctions they currently top) so
  // outbid/lost bids show too. Dedupe to the latest bid per auction.
  const d = await gql(GBM_SUBGRAPH, `query($a: String!){ bids(first: 300, where: { bidder: $a }, orderBy: bidTime, orderDirection: desc){ amount auction{ id type tokenId contractAddress highestBid highestBidder seller endsAt claimed cancelled } } }`, { a });
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const b of d?.bids ?? []) {
    const au = b.auction;
    if (!au || seen.has(au.id)) continue;
    seen.add(au.id);
    const { kind, category } = gbmKind(au.contractAddress, au.type);
    const ended = Number(au.endsAt) <= now;
    const claimed = !!au.claimed;
    const won = (au.highestBidder ?? "").toLowerCase() === a;
    const status = au.cancelled ? "Cancelled" : claimed ? "Claimed" : ended ? (won ? "Won — claim" : "Lost") : (won ? "Winning" : "Outbid");
    out.push({
      id: `bid-${au.id}`, refId: au.id, kind, category, contract: (au.contractAddress ?? "").toLowerCase(), tokenId: au.tokenId, quantity: 1,
      priceWei: b.amount ?? "0", counterparty: (au.seller ?? "").toLowerCase(), time: Number(au.endsAt), auctionType: au.type,
      status, action: !claimed && ended && won ? "claim" : undefined,
    } as Item);
  }
  return out;
}

async function fetchPurchases(addr: string): Promise<Item[]> {
  // erc1155Listings has no per-buyer field (a listing can be partially sold to
  // many buyers), so erc1155 purchase-by-buyer history isn't queryable here.
  const d = await gql(CORE_SUBGRAPH, `query($a: String!){
    erc721Listings(first: 200, where: { buyer: $a, timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc){ id category tokenId priceInWei seller timePurchased }
  }`, { a: addr });
  return (d?.erc721Listings ?? []).map((l: any) => ({ id: `p721-${l.id}`, refId: l.id, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1, priceWei: l.priceInWei, counterparty: l.seller, time: Number(l.timePurchased) }));
}

async function fetchSales(addr: string): Promise<Item[]> {
  const d = await gql(CORE_SUBGRAPH, `query($a: String!){
    erc721Listings(first: 150, where: { seller: $a, timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc){ id category tokenId priceInWei buyer timePurchased }
    erc1155Listings(first: 150, where: { seller: $a, sold: true }, orderBy: timeLastPurchased, orderDirection: desc){ id category erc1155TypeId quantity priceInWei timeLastPurchased }
  }`, { a: addr });
  const a: Item[] = (d?.erc721Listings ?? []).map((l: any) => ({ id: `sa721-${l.id}`, refId: l.id, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1, priceWei: l.priceInWei, counterparty: l.buyer, time: Number(l.timePurchased) }));
  const b: Item[] = (d?.erc1155Listings ?? []).map((l: any) => ({ id: `sa1155-${l.id}`, refId: l.id, kind: "erc1155" as const, category: Number(l.category), tokenId: l.erc1155TypeId, quantity: Number(l.quantity) || 1, priceWei: l.priceInWei, time: Number(l.timeLastPurchased) }));
  return [...a, ...b].sort((x, y) => y.time - x.time);
}

// Offers RECEIVED: open buy orders placed on erc721 assets this address owns
// (gotchis via core, parcels via gotchiverse) — actionable with Accept.
async function fetchOffersReceived(addr: string): Promise<Item[]> {
  const [core, gv] = await Promise.all([
    gql(CORE_SUBGRAPH, `query($a: String!){ aavegotchis(first: 1000, where: { owner: $a }){ id } }`, { a: addr }),
    gql(GOTCHIVERSE_SUBGRAPH, `query($a: String!){ parcels(first: 1000, where: { owner: $a }){ tokenId } }`, { a: addr }).catch(() => ({})),
  ]);
  const gids: string[] = (core?.aavegotchis ?? []).map((g: any) => String(g.id));
  const pids: string[] = (gv?.parcels ?? []).map((p: any) => String(p.tokenId));
  if (!gids.length && !pids.length) return [];
  const inList = (arr: string[]) => arr.map((i) => `"${i}"`).join(",");
  const parts: string[] = [];
  if (gids.length) parts.push(`g: erc721BuyOrders(first: 400, where: { category: 3, canceled: false, erc721TokenId_in: [${inList(gids)}] }){ id category erc721TokenId priceInWei buyer createdAt duration executedAt }`);
  if (pids.length) parts.push(`p: erc721BuyOrders(first: 400, where: { category: 4, canceled: false, erc721TokenId_in: [${inList(pids)}] }){ id category erc721TokenId priceInWei buyer createdAt duration executedAt }`);
  const d = await gql(CORE_SUBGRAPH, `query{ ${parts.join("\n")} }`);
  const now = Math.floor(Date.now() / 1000);
  const raw = [...(d?.g ?? []), ...(d?.p ?? [])].filter((o: any) => o.executedAt == null && (Number(o.duration) === 0 || Number(o.createdAt) + Number(o.duration) > now));
  return raw
    .map((o: any) => ({ id: `recv-${o.id}`, refId: o.id, kind: "erc721" as const, category: Number(o.category), tokenId: o.erc721TokenId, quantity: 1, priceWei: o.priceInWei, counterparty: o.buyer, time: Number(o.createdAt), status: "Offer received", action: "acceptOffer" as const }))
    .sort((x, y) => Number(y.priceWei) - Number(x.priceWei));
}

// "earnings" has no generic Item[] fetcher — it renders its own panel with
// its own types (GBM incentives/scorecard/seller P&L), not the Item list.
const FETCHERS: Record<Exclude<TabKey, "earnings">, (a: string) => Promise<Item[]>> = {
  listings: fetchListings, offers: fetchOffersMade, received: fetchOffersReceived, auctions: fetchAuctionsCreated, bids: fetchBids, purchases: fetchPurchases, sales: fetchSales,
};
const TABS: { key: TabKey; label: string; icon: typeof Tag }[] = [
  { key: "listings", label: "Listings", icon: Tag },
  { key: "offers", label: "Offers made", icon: HandCoins },
  { key: "received", label: "Offers received", icon: Inbox },
  { key: "auctions", label: "Auctions", icon: Gavel },
  { key: "bids", label: "Bids", icon: Gavel },
  { key: "purchases", label: "Purchases", icon: ShoppingCart },
  { key: "sales", label: "Sales", icon: Receipt },
  { key: "earnings", label: "Earnings", icon: Coins },
];

function catLabel(it: Item): string {
  if (it.kind === "erc721") return it.category === BAAZAAR_CATEGORY.AAVEGOTCHI ? "Gotchi" : it.category === BAAZAAR_CATEGORY.REALM ? "Parcel" : "NFT";
  if (it.category === BAAZAAR_CATEGORY.WEARABLE) return "Wearable";
  if (it.category === BAAZAAR_CATEGORY.INSTALLATION) return "Installation";
  if (it.category === BAAZAAR_CATEGORY.TILE) return "Tile";
  return "Item";
}
function ItemImg({ it }: { it: Item }) {
  const wrap = "inline-flex w-9 h-9 rounded bg-black/20 items-center justify-center overflow-hidden align-middle";
  const cls = "max-w-8 max-h-8 object-contain";
  if (it.kind === "erc721" && it.category === BAAZAAR_CATEGORY.AAVEGOTCHI) return <span className="inline-block w-9 h-9 rounded bg-muted/40 overflow-hidden align-middle"><GotchiSvgById id={it.tokenId} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" /></span>;
  if (it.kind === "erc721" && it.category === BAAZAAR_CATEGORY.REALM) return <span className={wrap}><AssetImage candidates={parcelImageCandidates(it.tokenId)} alt={`#${it.tokenId}`} className={cls} /></span>;
  if (it.kind === "erc1155") {
    const cands = it.category === BAAZAAR_CATEGORY.INSTALLATION ? installationImageCandidates(it.tokenId) : it.category === BAAZAAR_CATEGORY.TILE ? tileImageCandidates(it.tokenId) : itemImageCandidates(it.tokenId);
    return <span className={wrap}><AssetImage candidates={cands} alt={`#${it.tokenId}`} className={cls} /></span>;
  }
  return <span className={wrap}><span className="text-[9px] font-mono text-muted-foreground">#{it.tokenId}</span></span>;
}
function statusClass(s?: string): string {
  if (s === "Open" || s === "Listed" || s === "Live" || s === "Winning") return "bg-emerald-500/15 text-emerald-500";
  if (s === "Ended" || s === "Won — claim") return "bg-amber-500/15 text-amber-500";
  if (s === "Claimed") return "bg-blue-500/15 text-blue-400";
  return "bg-muted/50 text-muted-foreground";
}

export default function UserActivityPage() {
  const params = useParams();
  const { address: connected } = useAccount();
  const routeAddr = (params.address && /^0x[a-fA-F0-9]{40}$/.test(params.address)) ? params.address.toLowerCase() : connected?.toLowerCase();
  const isSelf = !!connected && !!routeAddr && connected.toLowerCase() === routeAddr;

  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("listings");
  const [busy, setBusy] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<Record<string, string>>({});
  const [catFilter, setCatFilter] = useState<string>("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["user-activity", tab, routeAddr],
    enabled: !!routeAddr && tab !== "earnings",
    staleTime: 30_000,
    queryFn: () => FETCHERS[tab as Exclude<TabKey, "earnings">](routeAddr!),
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return catFilter === "all" ? all : all.filter((it) => catLabel(it) === catFilter);
  }, [data, catFilter]);
  const CAT_FILTERS = ["all", "Gotchi", "Wearable", "Item", "Parcel", "Tile", "Installation"];

  const runAction = async (it: Item) => {
    if (!isSelf || !it.action || !publicClient) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(it.id);
    try {
      let hash: `0x${string}`;
      if (it.action === "cancelListing") {
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: MARKET_ABI, functionName: it.kind === "erc721" ? "cancelERC721Listing" : "cancelERC1155Listing", args: [BigInt(it.refId)] });
      } else if (it.action === "cancelOffer") {
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: MARKET_ABI, functionName: it.kind === "erc721" ? "cancelERC721BuyOrder" : "cancelERC1155BuyOrder", args: [BigInt(it.refId)] });
      } else if (it.action === "claim") {
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_MANAGE_ABI, functionName: "claim", args: [BigInt(it.refId)] });
      } else if (it.action === "acceptOffer") {
        const tokenContract = contractFor(it.kind, it.category);
        const approved = (await publicClient.readContract({ address: tokenContract, abi: MARKET_ABI, functionName: "isApprovedForAll", args: [connected as `0x${string}`, AAVEGOTCHI_DIAMOND_BASE] })) as boolean;
        if (!approved) {
          const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: tokenContract, abi: MARKET_ABI, functionName: "setApprovalForAll", args: [AAVEGOTCHI_DIAMOND_BASE, true] });
          await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
        }
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: MARKET_ABI, functionName: "executeERC721BuyOrder", args: [BigInt(it.refId), tokenContract, BigInt(it.tokenId), BigInt(it.priceWei)] });
      } else {
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_MANAGE_ABI, functionName: "cancelAuction", args: [BigInt(it.refId)] });
      }
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      const labels: Record<string, string> = { cancelListing: "Listing cancelled", cancelOffer: "Offer cancelled — GHST refunded", claim: "Auction claimed", cancelAuction: "Auction cancelled", acceptOffer: "Offer accepted — sold" };
      toast({ title: labels[it.action] });
      refetch();
    } catch (e) {
      toast({ title: "Action failed", description: parseRevert(e).slice(0, 150), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const actionLabel: Record<NonNullable<Item["action"]>, string> = { cancelListing: "Cancel", cancelOffer: "Cancel", claim: "Claim", cancelAuction: "Cancel", acceptOffer: "Accept" };

  // Re-price an active listing in place (add/set listing with the new price).
  const updateListing = async (it: Item) => {
    const p = Number(editPrice[it.id]);
    if (!isSelf || !publicClient || !(p > 0)) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(it.id);
    try {
      const wei = BigInt(Math.round(p * 1e6)) * 10n ** 12n;
      const tokenContract = contractFor(it.kind, it.category);
      const hash = it.kind === "erc721"
        ? await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: MARKET_ABI, functionName: "addERC721Listing", args: [tokenContract, BigInt(it.tokenId), BigInt(it.category), wei] })
        : await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: MARKET_ABI, functionName: "setERC1155Listing", args: [tokenContract, BigInt(it.tokenId), BigInt(it.quantity), BigInt(it.category), wei] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Price updated" });
      setEditPrice((m) => { const n = { ...m }; delete n[it.id]; return n; });
      refetch();
    } catch (e) {
      toast({ title: "Update failed", description: parseRevert(e).slice(0, 150), variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="My activity — GotchiCloset" description="Your Baazaar listings, offers, bids, auctions, purchases and sales." canonical={siteUrl("/me/activity")} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Coins className="w-6 h-6 text-primary" /> {isSelf ? "My activity" : `Activity · ${short(routeAddr)}`}</h1>
        <Link to={`/explorer?owner=${routeAddr ?? ""}`} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40">View assets</Link>
      </div>

      {!routeAddr ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Connect a wallet to see your marketplace activity.</div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border ${tab === t.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
          {tab === "earnings" ? (
            routeAddr && <GbmEarningsPanel address={routeAddr} />
          ) : (
            <>
          <div className="flex items-center gap-1 flex-wrap mb-4">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Category</span>
            {CAT_FILTERS.map((c) => (
              <button key={c} onClick={() => setCatFilter(c)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium border capitalize ${catFilter === c ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{c === "all" ? "All" : c}</button>
            ))}
          </div>

          {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nothing here yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2"></th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-left font-medium px-3 py-2">Item</th>
                    <th className="text-right font-medium px-3 py-2">{tab === "auctions" || tab === "bids" ? "Top bid" : tab === "offers" ? "Offer" : "Price"}</th>
                    {(tab === "purchases" || tab === "sales" || tab === "auctions" || tab === "bids") && <th className="text-left font-medium px-3 py-2">{tab === "purchases" ? "Seller" : tab === "sales" ? "Buyer" : tab === "bids" ? "Seller" : "Top bidder"}</th>}
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="text-right font-medium px-3 py-2">{tab === "auctions" || tab === "bids" ? "Ends" : "When"}</th>
                    {isSelf && <th className="text-right font-medium px-3 py-2">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.id} className="border-t border-border/20 hover:bg-muted/20">
                      <td className="px-3 py-1.5"><ItemImg it={it} /></td>
                      <td className="px-3 py-1.5">{catLabel(it)}</td>
                      <td className="px-3 py-1.5 font-mono">#{it.tokenId}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">{ghst(it.priceWei)} GHST</td>
                      {(tab === "purchases" || tab === "sales" || tab === "auctions" || tab === "bids") && (
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {it.counterparty && it.counterparty !== ZERO ? <Link to={`/u/${it.counterparty}`} className="font-mono text-primary hover:underline">{short(it.counterparty)}</Link> : "—"}
                        </td>
                      )}
                      <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass(it.status)}`}>{it.status}</span></td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{ago(it.time)}</td>
                      {isSelf && (
                        <td className="px-3 py-1.5 text-right">
                          {tab === "listings" && it.action === "cancelListing" ? (
                            <div className="flex items-center justify-end gap-1">
                              <input type="number" value={editPrice[it.id] ?? ""} onChange={(e) => setEditPrice((m) => ({ ...m, [it.id]: e.target.value }))} placeholder="New price" className="h-7 w-20 rounded border border-border bg-background px-1.5 text-[11px]" />
                              <button disabled={busy === it.id || !(Number(editPrice[it.id]) > 0)} onClick={() => updateListing(it)} className="h-7 px-2 rounded text-[11px] font-semibold bg-emerald-600 text-white disabled:opacity-50">Update</button>
                              <button disabled={busy === it.id} onClick={() => runAction(it)} className="h-7 px-2 rounded text-[11px] font-semibold border border-border/60 text-muted-foreground hover:bg-muted/50 disabled:opacity-50">{busy === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Cancel"}</button>
                            </div>
                          ) : it.action ? (
                            <button disabled={busy === it.id} onClick={() => runAction(it)} className={`h-7 px-2.5 rounded text-[11px] font-semibold disabled:opacity-50 inline-flex items-center gap-1 ${it.action === "claim" || it.action === "acceptOffer" ? "bg-amber-500 text-black" : "border border-border/60 text-muted-foreground hover:bg-muted/50"}`}>
                              {busy === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : actionLabel[it.action]}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Cancelling an offer refunds your escrowed GHST. Auction claim settles an ended auction (seller gets proceeds, winner gets the asset).</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
