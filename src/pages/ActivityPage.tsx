import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, ArrowRightLeft, MapPin, X, Tag, Gavel, HandCoins } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { CORE_SUBGRAPH_URL, BAAZAAR_CATEGORY, AAVEGOTCHI_DIAMOND_BASE, REALM_DIAMOND_BASE, INSTALLATION_DIAMOND_BASE, TILE_DIAMOND_BASE } from "@/lib/lending/contracts";
import { GBM_SUBGRAPH } from "@/lib/subgraph";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "@/components/explorer/AssetImage";

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
  from?: string; // seller
  to?: string; // buyer / offerer / highest bidder
  time: number;
  status?: string;
  gotchi?: GotchiArt;
};

const CATEGORY_FILTERS: { key: string; label: string; cats: number[] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "gotchi", label: "Gotchis", cats: [BAAZAAR_CATEGORY.AAVEGOTCHI] },
  { key: "wearable", label: "Wearables", cats: [BAAZAAR_CATEGORY.WEARABLE] },
  { key: "item", label: "Items", cats: [BAAZAAR_CATEGORY.CONSUMABLE] },
  { key: "parcel", label: "Parcels", cats: [BAAZAAR_CATEGORY.REALM] },
];
const FEEDS: { key: Feed; label: string; icon: typeof Tag }[] = [
  { key: "sale", label: "Sales", icon: Tag },
  { key: "offer", label: "Offers", icon: HandCoins },
  { key: "auction", label: "Auctions", icon: Gavel },
];

// BAAZAAR_CATEGORY collides REALM/INSTALLATION at 4, so labels are kind-aware.
function catLabel(s: Row): string {
  if (s.kind === "erc721") return s.category === BAAZAAR_CATEGORY.AAVEGOTCHI ? "Gotchi" : s.category === BAAZAAR_CATEGORY.REALM ? "Parcel" : "Item";
  if (s.category === BAAZAAR_CATEGORY.WEARABLE) return "Wearable";
  if (s.category === BAAZAAR_CATEGORY.INSTALLATION) return "Installation";
  if (s.category === BAAZAAR_CATEGORY.TILE) return "Tile";
  return "Item";
}

async function gql(url: string, query: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

// Offers/auctions carry only a token id, so batch-fetch gotchi traits to render
// art client-side (matching Sales) instead of hitting the server SVG endpoint.
async function enrichGotchiArt(rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.filter((r) => r.kind === "erc721" && r.category === BAAZAAR_CATEGORY.AAVEGOTCHI && !r.gotchi).map((r) => r.tokenId))];
  if (!ids.length) return rows;
  const d = await gql(CORE_SUBGRAPH_URL, `query { aavegotchis(first: 1000, where: { id_in: [${ids.map((i) => `"${i}"`).join(",")}] }) { id numericTraits withSetsNumericTraits equippedWearables hauntId collateral } }`);
  const map = new Map<string, GotchiArt>();
  for (const g of d?.aavegotchis ?? []) map.set(g.id, { numericTraits: (g.withSetsNumericTraits ?? g.numericTraits ?? []).map((n: any) => Number(n)), equippedWearables: (g.equippedWearables ?? []).map((n: any) => Number(n)), hauntId: g.hauntId != null ? Number(g.hauntId) : undefined, collateral: g.collateral });
  return rows.map((r) => (r.gotchi || !map.has(r.tokenId) ? r : { ...r, gotchi: map.get(r.tokenId) }));
}

async function fetchSales(): Promise<Row[]> {
  const d = await gql(CORE_SUBGRAPH_URL, `query {
    erc721Listings(first: 100, where: { timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc) {
      id category tokenId priceInWei seller buyer recipient timePurchased
      gotchi { numericTraits withSetsNumericTraits equippedWearables hauntId collateral }
    }
    erc1155Listings(first: 100, where: { sold: true }, orderBy: timeLastPurchased, orderDirection: desc) {
      id category erc1155TypeId quantity priceInWei seller timeLastPurchased
    }
  }`);
  const e721: Row[] = (d?.erc721Listings ?? []).map((l: any) => ({
    id: `s721-${l.id}`, feed: "sale" as const, kind: "erc721" as const, category: Number(l.category), tokenId: l.tokenId, quantity: 1,
    priceWei: l.priceInWei, from: l.seller, to: l.recipient || l.buyer, time: Number(l.timePurchased),
    gotchi: l.gotchi ? { numericTraits: (l.gotchi.withSetsNumericTraits ?? l.gotchi.numericTraits ?? []).map((n: any) => Number(n)), equippedWearables: (l.gotchi.equippedWearables ?? []).map((n: any) => Number(n)), hauntId: l.gotchi.hauntId != null ? Number(l.gotchi.hauntId) : undefined, collateral: l.gotchi.collateral } : undefined,
  }));
  const e1155: Row[] = (d?.erc1155Listings ?? []).map((l: any) => ({
    id: `s1155-${l.id}`, feed: "sale" as const, kind: "erc1155" as const, category: Number(l.category), tokenId: l.erc1155TypeId, quantity: Number(l.quantity) || 1,
    priceWei: l.priceInWei, from: l.seller, to: "", time: Number(l.timeLastPurchased),
  }));
  return [...e721, ...e1155].sort((a, b) => b.time - a.time);
}

async function fetchOffers(): Promise<Row[]> {
  const d = await gql(CORE_SUBGRAPH_URL, `query {
    erc721BuyOrders(first: 100, orderBy: createdAt, orderDirection: desc) { id category erc721TokenId priceInWei buyer createdAt }
    erc1155BuyOrders(first: 100, orderBy: createdAt, orderDirection: desc) { id category erc1155TokenId priceInWei buyer quantity createdAt }
  }`);
  const o721: Row[] = (d?.erc721BuyOrders ?? []).map((o: any) => ({
    id: `o721-${o.id}`, feed: "offer" as const, kind: "erc721" as const, category: Number(o.category), tokenId: o.erc721TokenId, quantity: 1,
    priceWei: o.priceInWei, to: o.buyer, time: Number(o.createdAt), status: "Open",
  }));
  const o1155: Row[] = (d?.erc1155BuyOrders ?? []).map((o: any) => ({
    id: `o1155-${o.id}`, feed: "offer" as const, kind: "erc1155" as const, category: Number(o.category), tokenId: o.erc1155TokenId, quantity: Number(o.quantity) || 1,
    priceWei: o.priceInWei, to: o.buyer, time: Number(o.createdAt), status: "Open",
  }));
  return enrichGotchiArt([...o721, ...o1155].sort((a, b) => b.time - a.time));
}

// Map an auction's token contract to the (kind, category) used for imagery.
function auctionCat(contract: string, type: string): { kind: "erc721" | "erc1155"; category: number } {
  const c = (contract || "").toLowerCase();
  if (c === REALM_DIAMOND_BASE.toLowerCase()) return { kind: "erc721", category: BAAZAAR_CATEGORY.REALM };
  if (c === INSTALLATION_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.INSTALLATION };
  if (c === TILE_DIAMOND_BASE.toLowerCase()) return { kind: "erc1155", category: BAAZAAR_CATEGORY.TILE };
  if (c === AAVEGOTCHI_DIAMOND_BASE.toLowerCase()) return type === "erc1155" ? { kind: "erc1155", category: BAAZAAR_CATEGORY.CONSUMABLE } : { kind: "erc721", category: BAAZAAR_CATEGORY.AAVEGOTCHI };
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

const short = (a?: string) => (a && a !== "0x0000000000000000000000000000000000000000" ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const ghst = (wei: string) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 });
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
  const [detail, setDetail] = useState<Row | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["activity", feed], queryFn: FETCHERS[feed], staleTime: 30_000 });

  const rows = useMemo(() => {
    const cats = CATEGORY_FILTERS.find((f) => f.key === cat)?.cats;
    const all = data ?? [];
    return cats ? all.filter((s) => cats.includes(s.category)) : all;
  }, [data, cat]);

  return (
    <div className="container mx-auto max-w-[1200px] px-4 py-6">
      <Seo title="Activity — GotchiCloset" description="Recent Baazaar sales, offers and auctions across the Aavegotchi marketplace." canonical={siteUrl("/activity")} />
      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-4"><Activity className="w-6 h-6 text-primary" /> Activity</h1>

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
                      <td className="px-3 py-1.5 font-mono">#{s.tokenId}{s.quantity > 1 ? ` ×${s.quantity}` : ""}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">{ghst(s.priceWei)} GHST</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {feed === "offer" ? short(s.to) : (
                          <span className="inline-flex items-center gap-1">{short(s.from)} <ArrowRightLeft className="w-3 h-3" /> {short(s.to)}</span>
                        )}
                      </td>
                      {feed !== "sale" && <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === "Live" || s.status === "Open" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted/50 text-muted-foreground"}`}>{s.status}</span></td>}
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{ago(s.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detail && <DetailModal s={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ s, onClose }: { s: Row; onClose: () => void }) {
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
          <div className="relative text-base font-bold capitalize">{s.feed} · {catLabel(s)} #{s.tokenId}</div>
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
            {s.from && <Row2 label="Seller">{ownerLink(s.from)}</Row2>}
            {s.to && <Row2 label={s.feed === "sale" ? "Buyer" : s.feed === "offer" ? "Offerer" : "Top bidder"}>{ownerLink(s.to)}</Row2>}
            {s.status && <Row2 label="Status">{s.status}</Row2>}
            <Row2 label={s.feed === "auction" ? "Ends" : "When"}>{ago(s.time)}</Row2>
          </div>
          {s.feed === "auction" && <Link to="/explorer" onClick={onClose} className="block text-center text-[11px] text-primary hover:underline">Go to the Auctions tab to bid →</Link>}
        </div>
      </div>
    </div>
  );
}
