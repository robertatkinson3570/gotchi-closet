import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { qk } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingCart, MapPin, SlidersHorizontal, X } from "lucide-react";
import { BuyButton } from "./BuyButton";
import { MakeOfferButton } from "./MakeOfferButton";
import { useMarketplaceBuy, type BuyParams } from "@/hooks/useMarketplaceBuy";
import { useToast } from "@/ui/use-toast";
import { CORE_SUBGRAPH_URL } from "@/lib/lending/contracts";
import { GOTCHIVERSE_SUBGRAPH } from "@/lib/subgraph";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "./AssetImage";
import { PortalImage } from "./PortalImage";
import { FakeGotchiImage } from "./GotchiSvgById";
import { Palette } from "lucide-react";

type Listing = { listingId: string; tokenId: string; priceWei: string; quantity: number; created: number };

// Parcel size codes used by the realm contract / gotchiverse subgraph.
const PARCEL_SIZES: Record<string, string> = { "0": "Humble", "1": "Reasonable", "2": "Spacious (V)", "3": "Spacious (H)", "4": "Partner" };

// Fetch newest-first (timeCreated desc) so the default view is the latest listings.
async function fetchListings(kind: "erc721" | "erc1155", category: number): Promise<Listing[]> {
  const query =
    kind === "erc721"
      ? `query($c: Int!){ erc721Listings(first: 200, where: { category: $c, cancelled: false, timePurchased: "0" }, orderBy: timeCreated, orderDirection: desc){ id tokenId priceInWei timeCreated } }`
      : `query($c: Int!){ erc1155Listings(first: 200, where: { category: $c, cancelled: false, sold: false, quantity_gt: 0 }, orderBy: timeCreated, orderDirection: desc){ id erc1155TypeId priceInWei quantity timeCreated } }`;
  const res = await fetch(CORE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { c: category } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  if (kind === "erc721") {
    return (json.data?.erc721Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.tokenId, priceWei: l.priceInWei, quantity: 1, created: Number(l.timeCreated) || 0 }));
  }
  return (json.data?.erc1155Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.erc1155TypeId, priceWei: l.priceInWei, quantity: Number(l.quantity) || 1, created: Number(l.timeCreated) || 0 }));
}

// Installation functional categories (installationType enum on the diamond).
const INSTALLATION_TYPE_LABELS: Record<string, string> = {
  "0": "Altar", "1": "Harvester", "2": "Reservoir", "3": "Gotchi Lodge", "4": "Wall",
  "5": "NFT Display", "6": "Maaker", "7": "Decoration", "8": "Bounce Gate",
};

type TypeMeta = { name: string; level: string; type: string };

// Enrich listed installations/tiles with name + level + functional type from the
// gotchiverse subgraph so they can be filtered and labelled like the dapp.
async function fetchTypeMeta(kind: "installation" | "tile", tokenIds: string[]): Promise<Record<string, TypeMeta>> {
  if (tokenIds.length === 0) return {};
  const query =
    kind === "installation"
      ? `query($ids: [ID!]){ installationTypes(first: 1000, where: { id_in: $ids }){ id name level installationType } }`
      : `query($ids: [ID!]){ tileTypes(first: 1000, where: { id_in: $ids }){ id name tileType } }`;
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { ids: tokenIds } }),
  });
  const json = await res.json();
  const rows = kind === "installation" ? json.data?.installationTypes : json.data?.tileTypes;
  const out: Record<string, TypeMeta> = {};
  for (const t of rows ?? []) out[t.id] = { name: t.name ?? "", level: String(t.level ?? ""), type: String(t.installationType ?? t.tileType ?? "") };
  return out;
}

type ParcelMeta = { size: string; district: string };

// Enrich listed parcels with size + district from the gotchiverse subgraph so
// they can be filtered like the dapp. Keyed by parcel tokenId.
async function fetchParcelMeta(tokenIds: string[]): Promise<Record<string, ParcelMeta>> {
  if (tokenIds.length === 0) return {};
  const query = `query($ids: [ID!]){ parcels(first: 1000, where: { id_in: $ids }){ id size district } }`;
  const res = await fetch(GOTCHIVERSE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { ids: tokenIds } }),
  });
  const json = await res.json();
  const out: Record<string, ParcelMeta> = {};
  for (const p of json.data?.parcels ?? []) out[p.id] = { size: String(p.size ?? ""), district: String(p.district ?? "") };
  return out;
}

const ghst = (wei: string) => {
  const v = Number(wei) / 1e18;
  if (v > 0 && v < 1) return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 1 : 0 });
};

/**
 * Self-contained buyable Baazaar grid for a single category (items, parcels…),
 * used as Explorer asset-type tabs. Includes a multi-select bulk-buy cart.
 */
export function MarketGrid({
  kind,
  category,
  contract,
  itemKind,
}: {
  kind: "erc721" | "erc1155";
  category: number;
  contract: `0x${string}`;
  itemKind: "item" | "parcel" | "installation" | "tile" | "portal" | "fakegotchi" | "fakecard";
}) {
  const [cart, setCart] = useState<Record<string, Listing>>({});
  const { bulkBuy, bulkStep, bulkProgress, resetBulk, isConnected } = useMarketplaceBuy();
  const { toast } = useToast();

  // Filters (universal: price + sort + id search; parcel-only: size + district).
  const [idQuery, setIdQuery] = useState("");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [sort, setSort] = useState<"recent" | "price-asc" | "price-desc" | "id-asc" | "id-desc">("recent");
  const [sizeF, setSizeF] = useState("");
  const [districtF, setDistrictF] = useState("");
  const [levelF, setLevelF] = useState("");
  const [typeF, setTypeF] = useState("");
  const [detail, setDetail] = useState<Listing | null>(null);
  const isTyped = itemKind === "installation" || itemKind === "tile";

  // Render filters into the Explorer's left sidebar (same panel as gotchis/
  // wearables). Falls back to inline when the sidebar isn't present (mobile).
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlotEl(document.getElementById("market-filter-slot")); });

  const { data, isLoading, error } = useQuery({
    queryKey: qk.baazaarMarket(kind, category),
    queryFn: () => fetchListings(kind, category),
    staleTime: 30_000,
  });

  const all = useMemo(() => data ?? [], [data]);

  // Parcel metadata for size/district filtering, loaded once listings arrive.
  const parcelIds = useMemo(() => (itemKind === "parcel" ? all.map((l) => l.tokenId) : []), [itemKind, all]);
  const { data: parcelMeta } = useQuery({
    queryKey: qk.baazaarParcelMeta(parcelIds),
    queryFn: () => fetchParcelMeta(parcelIds),
    enabled: itemKind === "parcel" && parcelIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const districtOptions = useMemo(() => {
    if (itemKind !== "parcel" || !parcelMeta) return [];
    return [...new Set(Object.values(parcelMeta).map((m) => m.district).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [itemKind, parcelMeta]);

  // Installation/tile name + level + type metadata for the listed tokenIds.
  const typeIds = useMemo(() => (isTyped ? all.map((l) => l.tokenId) : []), [isTyped, all]);
  const { data: typeMeta } = useQuery({
    queryKey: ["baazaar", "type-meta", itemKind, typeIds],
    queryFn: () => fetchTypeMeta(itemKind as "installation" | "tile", typeIds),
    enabled: isTyped && typeIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const levelOptions = useMemo(() => {
    if (itemKind !== "installation" || !typeMeta) return [];
    return [...new Set(Object.values(typeMeta).map((m) => m.level).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [itemKind, typeMeta]);
  const typeOptions = useMemo(() => {
    if (!isTyped || !typeMeta) return [];
    return [...new Set(Object.values(typeMeta).map((m) => m.type).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [isTyped, typeMeta]);

  useEffect(() => {
    if (bulkStep === "success") {
      toast({ title: "Bulk buy complete", description: "Selected listings purchased." });
      setCart({});
      resetBulk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkStep]);

  const rows = useMemo(() => {
    let r = all;
    const q = idQuery.trim().toLowerCase();
    // For typed assets the search box also matches the item name.
    if (q) r = r.filter((l) => l.tokenId.includes(q) || (typeMeta?.[l.tokenId]?.name ?? "").toLowerCase().includes(q));
    const lo = Number(minP), hi = Number(maxP);
    if (minP && lo > 0) r = r.filter((l) => Number(l.priceWei) / 1e18 >= lo);
    if (maxP && hi > 0) r = r.filter((l) => Number(l.priceWei) / 1e18 <= hi);
    if (itemKind === "parcel" && parcelMeta) {
      if (sizeF) r = r.filter((l) => parcelMeta[l.tokenId]?.size === sizeF);
      if (districtF) r = r.filter((l) => parcelMeta[l.tokenId]?.district === districtF);
    }
    if (isTyped && typeMeta) {
      if (levelF) r = r.filter((l) => typeMeta[l.tokenId]?.level === levelF);
      if (typeF) r = r.filter((l) => typeMeta[l.tokenId]?.type === typeF);
    }
    const arr = [...r];
    arr.sort((a, b) => {
      if (sort === "recent") return b.created - a.created;
      if (sort === "price-asc") return Number(a.priceWei) - Number(b.priceWei);
      if (sort === "price-desc") return Number(b.priceWei) - Number(a.priceWei);
      if (sort === "id-asc") return Number(a.tokenId) - Number(b.tokenId);
      return Number(b.tokenId) - Number(a.tokenId);
    });
    return arr;
  }, [all, idQuery, minP, maxP, sort, sizeF, districtF, levelF, typeF, itemKind, isTyped, parcelMeta, typeMeta]);

  const activeFilters = (idQuery ? 1 : 0) + (minP ? 1 : 0) + (maxP ? 1 : 0) + (sizeF ? 1 : 0) + (districtF ? 1 : 0) + (levelF ? 1 : 0) + (typeF ? 1 : 0);
  const clearFilters = () => { setIdQuery(""); setMinP(""); setMaxP(""); setSizeF(""); setDistrictF(""); setLevelF(""); setTypeF(""); };
  const cartList = Object.values(cart);
  const cartTotal = cartList.reduce((s, l) => s + Number(l.priceWei) / 1e18, 0);
  const bulkBusy = bulkStep === "approving" || bulkStep === "submitting";

  const toggle = (l: Listing) =>
    setCart((c) => {
      const n = { ...c };
      if (n[l.listingId]) delete n[l.listingId];
      else n[l.listingId] = l;
      return n;
    });

  const doBulk = () =>
    bulkBuy(
      cartList.map<BuyParams>((l) => ({
        listingId: l.listingId,
        tokenId: l.tokenId,
        priceInWei: BigInt(l.priceWei),
        kind,
        contractAddress: contract,
        quantity: 1,
      }))
    );

  if (error) return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (all.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">No open listings in this category.</div>;

  const fieldCls = "h-8 rounded-md border border-border bg-background px-2 text-xs";

  return (
    <div className="p-2">
      <div className="flex items-center gap-2 mb-3 px-1">
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={fieldCls}>
          <option value="recent">Recently listed</option>
          <option value="price-asc">Price: low → high</option>
          <option value="price-desc">Price: high → low</option>
          <option value="id-asc">ID: low → high</option>
          <option value="id-desc">ID: high → low</option>
        </select>
        <span className="text-[11px] text-muted-foreground ml-auto">{rows.length} of {all.length}</span>
      </div>

      {(() => {
        const w = `${fieldCls} w-full mt-0.5`;
        const panel = (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" /> Filters{activeFilters ? ` (${activeFilters})` : ""}</div>
              {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] text-primary hover:underline">Clear</button>}
            </div>
            <label className="block text-[10px] text-muted-foreground">{isTyped ? "ID or name" : "Token ID"}
              <input value={idQuery} onChange={(e) => setIdQuery(e.target.value)} placeholder={isTyped ? "name or ID" : "e.g. 1234"} className={w} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-muted-foreground">Min GHST<input type="number" value={minP} onChange={(e) => setMinP(e.target.value)} placeholder="0" className={w} /></label>
              <label className="block text-[10px] text-muted-foreground">Max GHST<input type="number" value={maxP} onChange={(e) => setMaxP(e.target.value)} placeholder="∞" className={w} /></label>
            </div>
            {itemKind === "parcel" && (
              <>
                <label className="block text-[10px] text-muted-foreground">Size
                  <select value={sizeF} onChange={(e) => setSizeF(e.target.value)} className={w}>
                    <option value="">Any size</option>
                    {Object.entries(PARCEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block text-[10px] text-muted-foreground">District
                  <select value={districtF} onChange={(e) => setDistrictF(e.target.value)} className={w}>
                    <option value="">Any district</option>
                    {districtOptions.map((d) => <option key={d} value={d}>District {d}</option>)}
                  </select>
                </label>
              </>
            )}
            {isTyped && typeOptions.length > 0 && (
              <label className="block text-[10px] text-muted-foreground">Type
                <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className={w}>
                  <option value="">Any type</option>
                  {typeOptions.map((t) => <option key={t} value={t}>{itemKind === "installation" ? (INSTALLATION_TYPE_LABELS[t] ?? `Type ${t}`) : `Type ${t}`}</option>)}
                </select>
              </label>
            )}
            {itemKind === "installation" && levelOptions.length > 0 && (
              <label className="block text-[10px] text-muted-foreground">Level
                <select value={levelF} onChange={(e) => setLevelF(e.target.value)} className={w}>
                  <option value="">Any level</option>
                  {levelOptions.map((l) => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </label>
            )}
          </div>
        );
        return slotEl ? createPortal(panel, slotEl) : <div className="mb-3 px-1 pb-3 border-b border-border/40">{panel}</div>;
      })()}

      {rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No listings match these filters.</div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pb-20">
        {rows.map((l) => {
          const selected = !!cart[l.listingId];
          return (
            <div
              key={l.listingId}
              className={`group rounded-xl border p-2 space-y-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg ${
                selected ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40" : "border-border/40 bg-background/60 hover:border-primary/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">#{l.tokenId}{l.quantity > 1 ? ` ×${l.quantity}` : ""}</span>
                <input type="checkbox" checked={selected} onChange={() => toggle(l)} className="cursor-pointer accent-primary" />
              </div>
              <div className="h-20 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40 group-hover:from-primary/5 group-hover:to-primary/15 transition-colors">
                {itemKind === "item" ? (
                  <AssetImage candidates={itemImageCandidates(l.tokenId)} alt={`#${l.tokenId}`} className="max-h-16 max-w-16 object-contain" />
                ) : itemKind === "installation" ? (
                  <AssetImage candidates={installationImageCandidates(l.tokenId)} alt={`#${l.tokenId}`} className="max-h-16 max-w-16 object-contain" />
                ) : itemKind === "tile" ? (
                  <AssetImage candidates={tileImageCandidates(l.tokenId)} alt={`#${l.tokenId}`} className="max-h-16 max-w-16 object-contain" />
                ) : itemKind === "parcel" ? (
                  <AssetImage candidates={parcelImageCandidates(l.tokenId)} alt={`#${l.tokenId}`} className="max-h-full max-w-full object-contain rounded" />
                ) : itemKind === "portal" ? (
                  <button type="button" onClick={() => setDetail(l)} title="View portal details" className="w-full h-full [&>svg]:w-full [&>svg]:h-full"><PortalImage tokenId={l.tokenId} /></button>
                ) : itemKind === "fakegotchi" || itemKind === "fakecard" ? (
                  <FakeGotchiImage id={l.tokenId} className="max-h-16 max-w-16 object-contain rounded" fallback={<Palette className="w-6 h-6 text-fuchsia-400/70" />} />
                ) : (
                  <MapPin className="w-6 h-6 text-emerald-500/70" />
                )}
              </div>
              {isTyped && typeMeta?.[l.tokenId]?.name && (
                <div className="text-[9px] text-muted-foreground text-center truncate" title={typeMeta[l.tokenId].name}>{typeMeta[l.tokenId].name}</div>
              )}
              <div className="text-[11px] text-emerald-500 font-semibold text-center">{ghst(l.priceWei)} GHST</div>
              <BuyButton listingId={l.listingId} tokenId={l.tokenId} priceInWei={l.priceWei} kind={kind} contractAddress={contract} quantity={1} label={`#${l.tokenId}`} />
              {itemKind !== "portal" && (
                <MakeOfferButton kind={kind} category={category} tokenId={l.tokenId} contractAddress={contract} label={`#${l.tokenId}`} compact />
              )}
            </div>
          );
        })}
      </div>
      )}

      {cartList.length > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs">
            <span className="font-semibold">{cartList.length}</span> selected · {cartTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} GHST
          </span>
          <button disabled={bulkBusy || !isConnected} onClick={doBulk} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
            {bulkBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {bulkStep === "approving" ? "Approve GHST…" : `Buying ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}…`}
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" /> Buy all
              </>
            )}
          </button>
          <button onClick={() => setCart({})} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setDetail(null)}>
          <div className="w-[min(460px,96vw)] rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <div className="text-base font-bold">Closed Portal #{detail.tokenId}</div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded hover:bg-muted/50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="w-40 h-40 mx-auto rounded-xl overflow-hidden bg-gradient-to-b from-fuchsia-500/10 to-fuchsia-500/30 flex items-center justify-center">
                <PortalImage tokenId={detail.tokenId} />
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</div>
                <div className="text-2xl font-bold text-emerald-500">{ghst(detail.priceWei)} GHST</div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">A closed portal contains 10 random Aavegotchis. Buy it, then open it on your profile to summon and claim one.</p>
              <BuyButton listingId={detail.listingId} tokenId={detail.tokenId} priceInWei={detail.priceWei} kind={kind} contractAddress={contract} quantity={1} label={`Portal #${detail.tokenId}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
