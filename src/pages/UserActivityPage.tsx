import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, Tag, HandCoins, Gavel, ShoppingCart, Receipt, Coins } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, GBM_DIAMOND_BASE, REALM_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, TILE_DIAMOND_BASE, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { CORE_SUBGRAPH, GBM_SUBGRAPH } from "@/lib/subgraph";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "@/components/explorer/AssetImage";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

// Marketplace cancel calls live on the Aavegotchi diamond; auction claim/cancel
// on the GBM diamond. Exact signatures verified from the live dapp bundle.
const MARKET_ABI = [
  { name: "cancelERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  { name: "cancelERC1155Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  { name: "cancelERC721BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }], outputs: [] },
  { name: "cancelERC1155BuyOrder", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_buyOrderId", type: "uint256" }], outputs: [] },
] as const;
const GBM_MANAGE_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionID", type: "uint256" }], outputs: [] },
  { name: "cancelAuction", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionID", type: "uint256" }], outputs: [] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a?: string) => (a && a !== ZERO ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
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
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

type TabKey = "listings" | "offers" | "auctions" | "bids" | "purchases" | "sales";
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
  action?: "cancelListing" | "cancelOffer" | "claim" | "cancelAuction";
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
  const d = await gql(GBM_SUBGRAPH, `query($a: String!){ auctions(first: 200, where: { highestBidder: $a, cancelled: false }, orderBy: endsAt, orderDirection: desc){ id type tokenId contractAddress highestBid seller totalBids endsAt claimed } }`, { a: addr });
  return (d?.auctions ?? []).map((au: any) => {
    const { kind, category } = gbmKind(au.contractAddress, au.type);
    const ended = Number(au.endsAt) <= now;
    const claimed = !!au.claimed;
    return {
      id: `bid-${au.id}`, refId: au.id, kind, category, contract: (au.contractAddress ?? "").toLowerCase(), tokenId: au.tokenId, quantity: 1,
      priceWei: au.highestBid ?? "0", counterparty: (au.seller ?? "").toLowerCase(), time: Number(au.endsAt), auctionType: au.type,
      status: claimed ? "Claimed" : ended ? "Won — claim" : "Winning",
      action: !claimed && ended ? "claim" : undefined,
    } as Item;
  });
}

async function fetchPurchases(addr: string): Promise<Item[]> {
  const d = await gql(CORE_SUBGRAPH, `query($a: String!){
    erc721Listings(first: 150, where: { buyer: $a, timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc){ id category tokenId priceInWei seller timePurchased }
    erc1155Listings(first: 150, where: { buyer: $a, sold: true }, orderBy: timeLastPurchased, orderDirection: desc){ id category erc1155TypeId quantity priceInWei seller timeLastPurchased }
  }`, { a: addr });
  const a: Item[] = (d?.erc721Listings ?? []).map((l: any) => ({ id: `p721-${l.id}`, refId: l.id, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1, priceWei: l.priceInWei, counterparty: l.seller, time: Number(l.timePurchased) }));
  const b: Item[] = (d?.erc1155Listings ?? []).map((l: any) => ({ id: `p1155-${l.id}`, refId: l.id, kind: "erc1155" as const, category: Number(l.category), tokenId: l.erc1155TypeId, quantity: Number(l.quantity) || 1, priceWei: l.priceInWei, counterparty: l.seller, time: Number(l.timeLastPurchased) }));
  return [...a, ...b].sort((x, y) => y.time - x.time);
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

const FETCHERS: Record<TabKey, (a: string) => Promise<Item[]>> = {
  listings: fetchListings, offers: fetchOffersMade, auctions: fetchAuctionsCreated, bids: fetchBids, purchases: fetchPurchases, sales: fetchSales,
};
const TABS: { key: TabKey; label: string; icon: typeof Tag }[] = [
  { key: "listings", label: "Listings", icon: Tag },
  { key: "offers", label: "Offers made", icon: HandCoins },
  { key: "auctions", label: "Auctions", icon: Gavel },
  { key: "bids", label: "Bids", icon: Gavel },
  { key: "purchases", label: "Purchases", icon: ShoppingCart },
  { key: "sales", label: "Sales", icon: Receipt },
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["user-activity", tab, routeAddr],
    enabled: !!routeAddr,
    staleTime: 30_000,
    queryFn: () => FETCHERS[tab](routeAddr!),
  });

  const rows = useMemo(() => data ?? [], [data]);

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
      } else {
        hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_MANAGE_ABI, functionName: "cancelAuction", args: [BigInt(it.refId)] });
      }
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      const labels: Record<string, string> = { cancelListing: "Listing cancelled", cancelOffer: "Offer cancelled — GHST refunded", claim: "Auction claimed", cancelAuction: "Auction cancelled" };
      toast({ title: labels[it.action] });
      refetch();
    } catch (e) {
      toast({ title: "Action failed", description: parseRevert(e).slice(0, 150), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const actionLabel: Record<NonNullable<Item["action"]>, string> = { cancelListing: "Cancel", cancelOffer: "Cancel", claim: "Claim", cancelAuction: "Cancel" };

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
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border ${tab === t.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
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
                          {it.action ? (
                            <button disabled={busy === it.id} onClick={() => runAction(it)} className={`h-7 px-2.5 rounded text-[11px] font-semibold disabled:opacity-50 inline-flex items-center gap-1 ${it.action === "claim" ? "bg-amber-500 text-black" : "border border-border/60 text-muted-foreground hover:bg-muted/50"}`}>
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
    </div>
  );
}
