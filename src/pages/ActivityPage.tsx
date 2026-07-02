import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, ArrowRightLeft, MapPin, X, Tag, Gavel, HandCoins, BarChart3 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { shortAddress as short } from "@/lib/format";
import { CORE_SUBGRAPH_URL, BAAZAAR_CATEGORY, AAVEGOTCHI_DIAMOND_BASE, REALM_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, TILE_DIAMOND_BASE, WEARABLE_DIAMOND_BASE, FORGE_DIAMOND_BASE, FAKE_GOTCHIS_NFT_BASE } from "@/lib/lending/contracts";
import { GBM_SUBGRAPH } from "@/lib/subgraph";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "@/components/explorer/AssetImage";
import { fetchItemMetaMap, itemMetaSync, RARITY_COLORS, type ItemMeta } from "@/lib/explorer/itemMeta";
import { toSlug } from "@/lib/slug";

type GotchiArt = { numericTraits: number[]; equippedWearables: number[]; hauntId?: number; collateral?: string };
type Feed = "sale" | "offer" | "auction";
type Row = {
  id: string;
  feed: Feed;
  kind: "erc721" | "erc1155";
  category: number;
  tokenId: string;
  quantity: number;
  priceWei: string;
  from?: string;
  to?: string;
  time: number;
  status?: string;
  gotchi?: GotchiArt;
  gotchiName?: string;
  itemName?: string;
  itemRarity?: number;
};

// Category filters must match on (kind, category) pairs — the numeric
// category space collides across ERC721/ERC1155 (e.g. REALM=4 vs INSTALLATION=4).
const CATEGORY_FILTERS: { key: string; label: string; match: ((s: Row) => boolean) | null }[] = [
  { key: "all", label: "All", match: null },
  { key: "gotchi", label: "Gotchis", match: (s) => s.kind === "erc721" && s.category === BAAZAAR_CATEGORY.AAVEGOTCHI },
  { key: "portal", label: "Portals", match: (s) => s.kind === "erc721" && (s.category === 0 || s.category === 2) },
  { key: "wearable", label: "Wearables", match: (s) => s.kind === "erc1155" && s.category === BAAZAAR_CATEGORY.WEARABLE },
  { key: "consumable", label: "Consumables", match: (s) => s.kind === "erc1155" && s.category === BAAZAAR_CATEGORY.CONSUMABLE },
  { key: "parcel", label: "Parcels", match: (s) => s.kind === "erc721" && s.category === BAAZAAR_CATEGORY.REALM },
  { key: "installation", label: "Installations", match: (s) => s.kind === "erc1155" && s.category === BAAZAAR_CATEGORY.INSTALLATION },
  { key: "tile", label: "Tiles", match: (s) => s.kind === "erc1155" && s.category === BAAZAAR_CATEGORY.TILE },
  { key: "forge", label: "Forge", match: (s) => s.kind === "erc1155" && [7, 8, 9, 10, 11].includes(s.category) },
  { key: "fake", label: "FAKE", match: (s) => (s.kind === "erc721" && s.category === 5) || (s.kind === "erc1155" && s.category === 6) },
];
const FEEDS: { key: Feed; label: string; icon: typeof Tag }[] = [
  { key: "sale", label: "Sales", icon: Tag },
  { key: "offer", label: "Offers", icon: HandCoins },
  { key: "auction", label: "Auctions", icon: Gavel },
];

// Offer status sub-filter (Open is the actionable default, like the dapp).
const OFFER_STATUSES = ["Open", "Filled", "Partial", "Cancelled", "Expired", "All"] as const;

function statusClass(status?: string): string {
  switch (status) {
    case "Open":
    case "Live":
      return "bg-emerald-500/15 text-emerald-500";
    case "Filled":
      return "bg-blue-500/15 text-blue-400";
    case "Partial":
      return "bg-amber-500/15 text-amber-400";
    case "Cancelled":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted/50 text-muted-foreground";
  }
}

// BAAZAAR_CATEGORY collides REALM/INSTALLATION at 4, so labels are kind-aware.
function catLabel(s: Row): string {
  if (s.kind === "erc721") {
    if (s.category === BAAZAAR_CATEGORY.AAVEGOTCHI) return "Gotchi";
    if (s.category === BAAZAAR_CATEGORY.REALM) return "Parcel";
    if (s.category === 0) return "Closed Portal";
    if (s.category === 2) return "Open Portal";
    if (s.category === 5) return "FAKE Gotchi";
    return "Item";
  }
  if (s.category === BAAZAAR_CATEGORY.WEARABLE) return "Wearable";
  if (s.category === BAAZAAR_CATEGORY.CONSUMABLE) return "Consumable";
  if (s.category === BAAZAAR_CATEGORY.INSTALLATION) return "Installation";
  if (s.category === BAAZAAR_CATEGORY.TILE) return "Tile";
  if (s.category === 6) return "FAKE Card";
  // Forge categories verified from live Base purchases: 8 = schematic
  // (wearable-id token), 10 = essence, 11 = core (1e9+ token ids).
  if (s.category === 7) return "Alloy";
  if (s.category === 8) return "Schematic";
  if (s.category === 9) return "Geode";
  if (s.category === 10) return "Essence";
  if (s.category === 11) return "Core";
  if (s.category === 12) return "Guardian Skin";
  return "Item";
}

// Forge schematics reuse their wearable's type id; suffix the name like the dapp.
function metaName(s: Row, meta?: ItemMeta): string | undefined {
  if (!meta) return undefined;
  return s.kind === "erc1155" && s.category === 8 ? `${meta.name} Schematic` : meta.name;
}

async function gql(url: string, query: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

async function enrichGotchiArt(rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.filter((r) => r.kind === "erc721" && r.category === BAAZAAR_CATEGORY.AAVEGOTCHI && (!r.gotchi || !r.gotchiName)).map((r) => r.tokenId))];
  if (!ids.length) return rows;
  const d = await gql(CORE_SUBGRAPH_URL, `query { aavegotchis(first: 1000, where: { id_in: [${ids.map((i) => `"${i}"`).join(",")}] }) { id name numericTraits withSetsNumericTraits equippedWearables hauntId collateral } }`);
  const map = new Map<string, { art: GotchiArt; name?: string }>();
  for (const g of d?.aavegotchis ?? []) map.set(g.id, { art: { numericTraits: (g.withSetsNumericTraits ?? g.numericTraits ?? []).map((n: any) => Number(n)), equippedWearables: (g.equippedWearables ?? []).map((n: any) => Number(n)), hauntId: g.hauntId != null ? Number(g.hauntId) : undefined, collateral: g.collateral }, name: g.name || undefined });
  return rows.map((r) => {
    const hit = map.get(r.tokenId);
    if (!hit) return r;
    return { ...r, gotchi: r.gotchi ?? hit.art, gotchiName: r.gotchiName ?? hit.name };
  });
}

async function enrichWearableMetadata(rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.filter((r) => r.kind === "erc1155" && r.category === BAAZAAR_CATEGORY.WEARABLE && !r.itemName).map((r) => r.tokenId))];
  if (!ids.length) return rows;
  try {
    const d = await gql(CORE_SUBGRAPH_URL, `query { wearables(first: 1000, where: { id_in: [${ids.map((i) => `"${i}"`).join(",")}] }) { id name baseRarity } }`);
    const map = new Map<string, { name: string; rarity: number }>();
    for (const w of d?.wearables ?? []) map.set(w.id, { name: w.name || `Wearable #${w.id}`, rarity: Number(w.baseRarity) || 0 });
    return rows.map((r) => {
      const hit = map.get(r.tokenId);
      if (!hit) return r;
      return { ...r, itemName: hit.name, itemRarity: hit.rarity };
    });
  } catch {
    return rows;
  }
}

async function fetchSales(): Promise<Row[]> {
  const d = await gql(CORE_SUBGRAPH_URL, `query {
    erc721Listings(first: 100, where: { timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc) {
      id category tokenId priceInWei seller buyer recipient timePurchased
      gotchi { name numericTraits withSetsNumericTraits equippedWearables hauntId collateral }
    }
    erc1155Purchases(first: 100, orderBy: timeLastPurchased, orderDirection: desc) {
      id category erc1155TypeId quantity priceInWei seller buyer recipient timeLastPurchased
    }
  }`);
  const e721: Row[] = (d?.erc721Listings ?? []).map((l: any) => ({
    id: `s721-${l.id}`, feed: "sale" as const, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1,
    priceWei: l.priceInWei, from: l.seller, to: l.recipient || l.buyer, time: Number(l.timePurchased),
    gotchi: l.gotchi ? { numericTraits: (l.gotchi.withSetsNumericTraits ?? l.gotchi.numericTraits ?? []).map((n: any) => Number(n)), equippedWearables: (l.gotchi.equippedWearables ?? []).map((n: any) => Number(n)), hauntId: l.gotchi.hauntId != null ? Number(l.gotchi.hauntId) : undefined, collateral: l.gotchi.collateral } : undefined,
    gotchiName: l.gotchi?.name || undefined,
  }));
  const e1155: Row[] = (d?.erc1155Purchases ?? []).map((l: any) => ({
    id: `s1155-${l.id}`, feed: "sale" as const, kind: "erc1155" as const, category: Number(l.category), tokenId: l.erc1155TypeId, quantity: Number(l.quantity) || 1,
    priceWei: l.priceInWei, from: l.seller, to: l.recipient || l.buyer || "", time: Number(l.timeLastPurchased),
  }));
  const rows = [...e721, ...e1155].sort((a, b) => b.time - a.time);
  return enrichWearableMetadata(rows);
}

// Derive a buy order's lifecycle status (matches the dapp's Status column).
function offerStatus(o: { canceled?: boolean; executed?: boolean; partial?: boolean; createdAt: number; duration: number }, now: number): string {
  if (o.canceled) return "Cancelled";
  if (o.executed) return "Filled";
  if (o.partial) return "Partial";
  if (o.duration > 0 && o.createdAt + o.duration < now) return "Expired";
  return "Open";
}

async function fetchOffers(): Promise<Row[]> {
  const d = await gql(CORE_SUBGRAPH_URL, `query {
    erc721BuyOrders(first: 150, orderBy: createdAt, orderDirection: desc) { id category erc721TokenId priceInWei buyer createdAt duration executedAt canceled }
    erc1155BuyOrders(first: 150, orderBy: createdAt, orderDirection: desc) { id category erc1155TokenId priceInWei buyer quantity createdAt duration executedQuantity completedAt canceled }
  }`);
  const now = Math.floor(Date.now() / 1000);
  const o721: Row[] = (d?.erc721BuyOrders ?? []).map((o: any) => ({
    id: `o721-${o.id}`, feed: "offer" as const, kind: "erc721" as const, category: Number(o.category), tokenId: o.erc721TokenId, quantity: 1,
    priceWei: o.priceInWei, to: o.buyer, time: Number(o.createdAt),
    status: offerStatus({ canceled: o.canceled, executed: o.executedAt != null, createdAt: Number(o.createdAt), duration: Number(o.duration) || 0 }, now),
  }));
  const o1155: Row[] = (d?.erc1155BuyOrders ?? []).map((o: any) => ({
    id: `o1155-${o.id}`, feed: "offer" as const, kind: "erc1155" as const, category: Number(o.category), tokenId: o.erc1155TokenId, quantity: Number(o.quantity) || 1,
    priceWei: o.priceInWei, to: o.buyer, time: Number(o.createdAt),
    status: offerStatus({ canceled: o.canceled, executed: o.completedAt != null, partial: Number(o.executedQuantity) > 0, createdAt: Number(o.createdAt), duration: Number(o.duration) || 0 }, now),
  }));
  const rows = [...o721, ...o1155].sort((a, b) => b.time - a.time);
  const withGotchi = await enrichGotchiArt(rows);
  return enrichWearableMetadata(withGotchi);
}

// Map an auction's token contract to the (kind, category) used for imagery.
function auctionCat(contract: string, type: string): { kind: "erc721" | "erc1155"; category: number } {
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

async function fetchAuctions(): Promise<Row[]> {
  const d = await gql(GBM_SUBGRAPH, `query { auctions(first: 100, orderBy: endsAt, orderDirection: desc){ id type tokenId contractAddress highestBid highestBidder seller endsAt totalBids } }`);
  const now = Math.floor(Date.now() / 1000);
  const rows: Row[] = (d?.auctions ?? []).map((a: any) => {
    const { kind, category } = auctionCat(a.contractAddress, a.type);
    const endsAt = Number(a.endsAt);
    return {
      id: `a-${a.id}`, feed: "auction" as const, kind, category, tokenId: a.tokenId, quantity: 1,
      priceWei: a.highestBid ?? "0", from: a.seller, to: a.highestBidder, time: endsAt,
      status: endsAt > now ? "Live" : "Ended",
    } as Row;
  });
  return enrichGotchiArt(rows);
}

// Show decimals for sub-1-GHST values so small offers (e.g. 0.019 GHST) don't
// render as a misleading "0 GHST"; whole-GHST amounts stay clean (no decimals).
const ghst = (wei: string) => {
  const v = Number(wei) / 1e18;
  if (v > 0 && v < 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 1 : 0 });
};
function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const v = d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "just now";
  if (v === "just now") return v;
  return s < 0 ? `in ${v}` : `${v} ago`;
}

function ItemImage({ s }: { s: Row }) {
  if (s.category === BAAZAAR_CATEGORY.AAVEGOTCHI && s.kind === "erc721") {
    // Only render client-side when traits are present; the server SVG fallback is unreliable.
    if (!s.gotchi?.numericTraits?.length) {
      return <span className="inline-flex w-9 h-9 rounded bg-primary/10 items-center justify-center text-[9px] font-mono text-primary/70 align-middle">#{s.tokenId}</span>;
    }
    return (
      <span className="inline-block w-9 h-9 rounded bg-muted/40 overflow-hidden align-middle">
        <GotchiSvg gotchiId={s.tokenId} hauntId={s.gotchi?.hauntId} collateral={s.gotchi?.collateral} numericTraits={s.gotchi?.numericTraits} equippedWearables={s.gotchi?.equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
      </span>
    );
  }
  const wrap = "inline-flex w-9 h-9 rounded bg-black/20 items-center justify-center overflow-hidden align-middle";
  const imgCls = "max-w-8 max-h-8 object-contain";
  if (s.kind === "erc721" && s.category === BAAZAAR_CATEGORY.REALM) return <span className={wrap}><AssetImage candidates={parcelImageCandidates(s.tokenId)} alt={`#${s.tokenId}`} className={imgCls} /></span>;
  if (s.kind === "erc1155") {
    const cands = s.category === BAAZAAR_CATEGORY.INSTALLATION ? installationImageCandidates(s.tokenId) : s.category === BAAZAAR_CATEGORY.TILE ? tileImageCandidates(s.tokenId) : itemImageCandidates(s.tokenId);
    return <span className={wrap}><AssetImage candidates={cands} alt={`#${s.tokenId}`} className={imgCls} /></span>;
  }
  return <span className="inline-flex w-9 h-9 rounded bg-emerald-500/10 items-center justify-center align-middle"><MapPin className="w-4 h-4 text-emerald-500/70" /></span>;
}

const FETCHERS: Record<Feed, () => Promise<Row[]>> = { sale: fetchSales, offer: fetchOffers, auction: fetchAuctions };

export default function ActivityPage() {
  const [feed, setFeed] = useState<Feed>("sale");
  const [cat, setCat] = useState("all");
  const [offerStatusF, setOfferStatusF] = useState<string>("Open");
  const [detail, setDetail] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["activity", feed], queryFn: FETCHERS[feed], staleTime: 30_000 });
  // Item names/slots/rarity for 1155 rows (wearables, consumables, …) — one
  // cached fetch (bundled db + subgraph itemTypes) for the session.
  const { data: metaMap } = useQuery({ queryKey: ["item-meta-map"], queryFn: fetchItemMetaMap, staleTime: Infinity });

  const rowMeta = (s: Row): ItemMeta | undefined =>
    s.kind === "erc1155" && s.category !== 6 && s.category !== 12 ? metaMap?.get(Number(s.tokenId)) ?? itemMetaSync(s.tokenId) : undefined;

  const rows = useMemo(() => {
    const match = CATEGORY_FILTERS.find((f) => f.key === cat)?.match;
    let all = data ?? [];
    if (match) all = all.filter(match);
    if (feed === "offer" && offerStatusF !== "All") all = all.filter((s) => s.status === offerStatusF);
    const q = search.trim().toLowerCase();
    if (q) {
      const idQ = q.replace(/^#/, "");
      all = all.filter((s) => {
        if (s.tokenId.includes(idQ)) return true;
        if (s.gotchiName?.toLowerCase().includes(q)) return true;
        const name = rowMeta(s)?.name.toLowerCase();
        if (name?.includes(q)) return true;
        return [s.from, s.to].some((a) => a?.toLowerCase().startsWith(q));
      });
    }
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cat, feed, offerStatusF, search, metaMap]);

  return (
    <div className="container mx-auto max-w-[1200px] px-4 py-6">
      <Seo title="Activity — GotchiCloset" description="Recent Baazaar sales, offers and auctions across the Aavegotchi marketplace." canonical={siteUrl("/activity")} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Activity</h1>
        <Link to="/stats" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40"><BarChart3 className="w-3.5 h-3.5" /> Stats</Link>
      </div>

      <div className="flex gap-4">
        {/* Left filter panel */}
        <aside className="hidden md:block w-48 shrink-0">
          <div className="sticky top-4 space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Feed</div>
              <div className="flex flex-col gap-1">
                {FEEDS.map((f) => (
                  <button key={f.key} onClick={() => setFeed(f.key)} className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border ${feed === f.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
                    <f.icon className="w-4 h-4" /> {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Category</div>
              <div className="flex flex-col gap-1">
                {CATEGORY_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setCat(f.key)} className={`h-8 px-3 rounded-lg text-xs font-medium border text-left ${cat === f.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            {feed === "offer" && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Status</div>
                <div className="flex flex-col gap-1">
                  {OFFER_STATUSES.map((s) => (
                    <button key={s} onClick={() => setOfferStatusF(s)} className={`h-8 px-3 rounded-lg text-xs font-medium border text-left ${offerStatusF === s ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {/* Mobile feed + category tabs */}
          <div className="md:hidden flex items-center gap-1.5 mb-3 flex-wrap">
            {FEEDS.map((f) => (
              <button key={f.key} onClick={() => setFeed(f.key)} className={`inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium border ${feed === f.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground"}`}><f.icon className="w-3.5 h-3.5" /> {f.label}</button>
            ))}
            <div className="w-full flex items-center gap-1.5 flex-wrap mt-1">
              {CATEGORY_FILTERS.map((f) => (
                <button key={f.key} onClick={() => setCat(f.key)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium border ${cat === f.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground"}`}>{f.label}</button>
              ))}
            </div>
            {feed === "offer" && (
              <div className="w-full flex items-center gap-1.5 flex-wrap mt-1">
                {OFFER_STATUSES.map((s) => (
                  <button key={s} onClick={() => setOfferStatusF(s)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium border ${offerStatusF === s ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground"}`}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, #id or 0xaddress"
              className="h-8 w-full sm:w-72 rounded-lg border border-border/40 bg-background px-3 text-xs"
            />
          </div>
          {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No recent {feed === "sale" ? "sales" : feed === "offer" ? "offers" : "auctions"}.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2"></th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-left font-medium px-3 py-2">Item</th>
                    <th className="text-right font-medium px-3 py-2">{feed === "auction" ? "Top bid" : feed === "offer" ? "Offer" : "Price"}</th>
                    <th className="text-left font-medium px-3 py-2">{feed === "sale" ? "Seller → Buyer" : feed === "offer" ? "Offerer" : "Seller / Top bidder"}</th>
                    {feed !== "sale" && <th className="text-left font-medium px-3 py-2">Status</th>}
                    <th className="text-right font-medium px-3 py-2">{feed === "auction" ? "Ends" : "When"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => setDetail(s)} className="border-t border-border/20 hover:bg-muted/20 cursor-pointer">
                      <td className="px-3 py-1.5"><ItemImage s={s} /></td>
                      <td className="px-3 py-1.5">{catLabel(s)}</td>
                      <td className="px-3 py-1.5"><ItemNameCell s={s} meta={rowMeta(s)} /></td>
                      <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">{ghst(s.priceWei)} GHST</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {feed === "offer" ? short(s.to) : (
                          <span className="inline-flex items-center gap-1">{short(s.from)} <ArrowRightLeft className="w-3 h-3" /> {short(s.to)}</span>
                        )}
                      </td>
                      {feed !== "sale" && <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass(s.status)}`}>{s.status}</span></td>}
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{ago(s.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detail && <DetailModal s={detail} meta={rowMeta(detail)} onClose={() => setDetail(null)} />}
    </div>
  );
}

// Dapp-style item cell: name (rarity-tinted for items), id/qty/slot/modifier
// sub-line; falls back to the bare #id for asset types without metadata.
function ItemNameCell({ s, meta }: { s: Row; meta?: ItemMeta }) {
  if (s.kind === "erc1155" && meta) {
    const sub = [
      `#${s.tokenId}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`,
      meta.slot ?? undefined,
      meta.modifiers.length ? meta.modifiers.join(" ") : undefined,
    ].filter(Boolean).join(" · ");
    return (
      <div className="leading-tight">
        <div className={`font-medium ${meta.rarity ? RARITY_COLORS[meta.rarity] ?? "" : ""}`}>{metaName(s, meta)}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>
      </div>
    );
  }
  if (s.kind === "erc721" && s.category === BAAZAAR_CATEGORY.AAVEGOTCHI && (s.gotchiName || s.gotchi)) {
    return (
      <div className="leading-tight">
        <div className="font-medium">
          {s.gotchiName ?? "Unnamed"}
          {s.gotchi?.hauntId ? <span className="ml-1 text-[9px] px-1 py-px rounded bg-muted/50 text-muted-foreground align-middle">H{s.gotchi.hauntId}</span> : null}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">#{s.tokenId}</div>
      </div>
    );
  }
  return <span className="font-mono">#{s.tokenId}{s.quantity > 1 ? ` ×${s.quantity}` : ""}</span>;
}

function DetailModal({ s, meta, onClose }: { s: Row; meta?: ItemMeta; onClose: () => void }) {
  const isGotchi = s.kind === "erc721" && s.category === BAAZAAR_CATEGORY.AAVEGOTCHI;
  const displayName = metaName(s, meta) ?? (isGotchi ? s.gotchiName : undefined);
  const ownerLink = (addr?: string) =>
    addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr !== "0x0000000000000000000000000000000000000000" ? (
      <Link to={`/explorer?owner=${addr}`} onClick={onClose} className="font-mono text-primary hover:underline" title="View this owner's gotchis">{short(addr)}</Link>
    ) : (
      <span className="font-mono">{short(addr)}</span>
    );
  const Row2 = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{children}</span></div>
  );
  const priceLabel = s.feed === "auction" ? "Top bid" : s.feed === "offer" ? "Offer price" : "Sale price";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-[min(460px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/60 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
          <div className="relative text-base font-bold capitalize truncate pr-2">{s.feed} · {displayName ?? catLabel(s)} <span className="font-mono text-sm text-muted-foreground">#{s.tokenId}</span></div>
          <button onClick={onClose} className="relative p-1.5 rounded-lg bg-black/20 hover:bg-black/40"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-center">
            <span className="w-32 h-32 flex items-center justify-center rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 [&_span]:!w-28 [&_span]:!h-28 [&_img]:max-h-28 [&_img]:max-w-28"><ItemImage s={s} /></span>
          </div>
          <div>
            <Row2 label={priceLabel}><span className="text-emerald-500 font-bold">{ghst(s.priceWei)} GHST</span></Row2>
            {s.quantity > 1 && <Row2 label="Quantity">×{s.quantity}</Row2>}
            <Row2 label="Token ID">#{s.tokenId}</Row2>
            <Row2 label="Type">{catLabel(s)}</Row2>
            {meta?.rarity && <Row2 label="Rarity"><span className={RARITY_COLORS[meta.rarity] ?? ""}>{meta.rarity}</span></Row2>}
            {meta?.slot && <Row2 label="Slot">{meta.slot}</Row2>}
            {meta && meta.modifiers.length > 0 && <Row2 label="Traits">{meta.modifiers.join(" · ")}</Row2>}
            {isGotchi && s.gotchi?.hauntId != null && <Row2 label="Haunt">H{s.gotchi.hauntId}</Row2>}
            {s.from && <Row2 label="Seller">{ownerLink(s.from)}</Row2>}
            {s.to && <Row2 label={s.feed === "sale" ? "Buyer" : s.feed === "offer" ? "Offerer" : "Top bidder"}>{ownerLink(s.to)}</Row2>}
            {s.status && <Row2 label="Status">{s.status}</Row2>}
            <Row2 label={s.feed === "auction" ? "Ends" : "When"}>{ago(s.time)}</Row2>
          </div>
          {isGotchi && <Link to={`/gotchi/${s.tokenId}`} onClick={onClose} className="block text-center text-[11px] text-primary hover:underline">View gotchi →</Link>}
          {meta && s.kind === "erc1155" && s.category === BAAZAAR_CATEGORY.WEARABLE && (
            <Link to={`/wearable/${toSlug(meta.name)}`} onClick={onClose} className="block text-center text-[11px] text-primary hover:underline">View wearable →</Link>
          )}
          {s.feed === "auction" && <Link to="/explorer" onClick={onClose} className="block text-center text-[11px] text-primary hover:underline">Go to the Auctions tab to bid →</Link>}
        </div>
      </div>
    </div>
  );
}
