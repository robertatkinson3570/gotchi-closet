import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingCart, MapPin } from "lucide-react";
import { BuyButton } from "./BuyButton";
import { useMarketplaceBuy, type BuyParams } from "@/hooks/useMarketplaceBuy";
import { useToast } from "@/ui/use-toast";
import { CORE_SUBGRAPH_URL } from "@/lib/lending/contracts";
import { getWearableIconUrlCandidates } from "@/lib/wearableImages";

type Listing = { listingId: string; tokenId: string; priceWei: string; quantity: number };

async function fetchListings(kind: "erc721" | "erc1155", category: number): Promise<Listing[]> {
  const query =
    kind === "erc721"
      ? `query($c: Int!){ erc721Listings(first: 80, where: { category: $c, cancelled: false, timePurchased: "0" }, orderBy: priceInWei, orderDirection: asc){ id tokenId priceInWei } }`
      : `query($c: Int!){ erc1155Listings(first: 80, where: { category: $c, cancelled: false, sold: false, quantity_gt: 0 }, orderBy: priceInWei, orderDirection: asc){ id erc1155TypeId priceInWei quantity } }`;
  const res = await fetch(CORE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { c: category } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  if (kind === "erc721") {
    return (json.data?.erc721Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.tokenId, priceWei: l.priceInWei, quantity: 1 }));
  }
  return (json.data?.erc1155Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.erc1155TypeId, priceWei: l.priceInWei, quantity: Number(l.quantity) || 1 }));
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
  itemKind: "item" | "parcel" | "installation" | "tile";
}) {
  const [cart, setCart] = useState<Record<string, Listing>>({});
  const { bulkBuy, bulkStep, bulkProgress, resetBulk, isConnected } = useMarketplaceBuy();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["baazaar", "market", kind, category],
    queryFn: () => fetchListings(kind, category),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (bulkStep === "success") {
      toast({ title: "Bulk buy complete", description: "Selected listings purchased." });
      setCart({});
      resetBulk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkStep]);

  const rows = useMemo(() => data ?? [], [data]);
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
  if (rows.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">No open listings in this category.</div>;

  return (
    <div className="p-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pb-20">
        {rows.map((l) => {
          const selected = !!cart[l.listingId];
          return (
            <div key={l.listingId} className={`rounded-lg border p-2 space-y-1.5 ${selected ? "border-primary/60 bg-primary/5" : "border-border/40 bg-background/60"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">#{l.tokenId}{l.quantity > 1 ? ` ×${l.quantity}` : ""}</span>
                <input type="checkbox" checked={selected} onChange={() => toggle(l)} className="cursor-pointer" />
              </div>
              <div className="h-14 flex items-center justify-center bg-black/10 rounded overflow-hidden">
                {itemKind === "item" ? (
                  <img
                    src={getWearableIconUrlCandidates(Number(l.tokenId))[0]}
                    alt={`#${l.tokenId}`}
                    className="max-h-12 max-w-12 object-contain"
                    loading="lazy"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                ) : itemKind === "installation" ? (
                  <img
                    src={`/installations/installation_${l.tokenId}.png`}
                    alt={`#${l.tokenId}`}
                    className="max-h-12 max-w-12 object-contain [image-rendering:pixelated]"
                    loading="lazy"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                ) : (
                  <MapPin className="w-6 h-6 text-emerald-500/70" />
                )}
              </div>
              <div className="text-[11px] text-emerald-500 font-semibold text-center">{ghst(l.priceWei)} GHST</div>
              <BuyButton listingId={l.listingId} tokenId={l.tokenId} priceInWei={l.priceWei} kind={kind} contractAddress={contract} quantity={1} label={`#${l.tokenId}`} />
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
