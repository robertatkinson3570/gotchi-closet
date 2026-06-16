import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Loader2, ShoppingCart } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { BuyButton } from "@/components/explorer/BuyButton";
import { useMarketplaceBuy, type BuyParams } from "@/hooks/useMarketplaceBuy";
import { useToast } from "@/ui/use-toast";
import {
  CORE_SUBGRAPH_URL,
  BAAZAAR_CATEGORY,
  AAVEGOTCHI_DIAMOND_BASE,
  REALM_DIAMOND_BASE,
  WEARABLE_DIAMOND_BASE,
} from "@/lib/lending/contracts";

type Cat = {
  key: string;
  label: string;
  kind: "erc721" | "erc1155";
  category: number;
  contract: `0x${string}`;
};

const CATS: Cat[] = [
  { key: "gotchi", label: "Gotchis", kind: "erc721", category: BAAZAAR_CATEGORY.AAVEGOTCHI, contract: AAVEGOTCHI_DIAMOND_BASE },
  { key: "wearable", label: "Wearables", kind: "erc1155", category: BAAZAAR_CATEGORY.WEARABLE, contract: WEARABLE_DIAMOND_BASE },
  { key: "item", label: "Items", kind: "erc1155", category: BAAZAAR_CATEGORY.CONSUMABLE, contract: WEARABLE_DIAMOND_BASE },
  { key: "parcel", label: "Parcels", kind: "erc721", category: BAAZAAR_CATEGORY.REALM, contract: REALM_DIAMOND_BASE },
];

type Listing = { listingId: string; tokenId: string; priceWei: string; quantity: number };

async function fetchListings(cat: Cat): Promise<Listing[]> {
  const query =
    cat.kind === "erc721"
      ? `query($c: Int!){ erc721Listings(first: 60, where: { category: $c, cancelled: false, timePurchased: "0" }, orderBy: priceInWei, orderDirection: asc){ id tokenId priceInWei } }`
      : `query($c: Int!){ erc1155Listings(first: 60, where: { category: $c, cancelled: false, sold: false, quantity_gt: 0 }, orderBy: priceInWei, orderDirection: asc){ id erc1155TypeId priceInWei quantity } }`;
  const res = await fetch(CORE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { c: cat.category } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  if (cat.kind === "erc721") {
    return (json.data?.erc721Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.tokenId, priceWei: l.priceInWei, quantity: 1 }));
  }
  return (json.data?.erc1155Listings ?? []).map((l: any) => ({ listingId: l.id, tokenId: l.erc1155TypeId, priceWei: l.priceInWei, quantity: Number(l.quantity) || 1 }));
}

const ghst = (wei: string) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function BaazaarPage() {
  const [catKey, setCatKey] = useState("gotchi");
  const cat = CATS.find((c) => c.key === catKey)!;
  const [cart, setCart] = useState<Record<string, Listing>>({});
  const { bulkBuy, bulkStep, bulkProgress, resetBulk, isConnected } = useMarketplaceBuy();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["baazaar", "cat", cat.key],
    queryFn: () => fetchListings(cat),
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

  const doBulk = () => {
    const items: BuyParams[] = cartList.map((l) => ({
      listingId: l.listingId,
      tokenId: l.tokenId,
      priceInWei: BigInt(l.priceWei),
      kind: cat.kind,
      contractAddress: cat.contract,
      quantity: 1,
    }));
    bulkBuy(items);
  };

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-6">
      <Seo title="Baazaar — GotchiCloset" description="Buy Aavegotchis, wearables, items and parcels on the Baazaar." canonical={siteUrl("/baazaar")} />
      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-4">
        <ShoppingBag className="w-6 h-6 text-primary" /> Baazaar
      </h1>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCatKey(c.key)}
            className={`h-8 px-3 rounded-md text-xs font-medium border ${
              catKey === c.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No open listings in this category.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pb-20">
          {rows.map((l) => {
            const selected = !!cart[l.listingId];
            return (
              <div key={l.listingId} className={`rounded-lg border p-2 space-y-1.5 ${selected ? "border-primary/60 bg-primary/5" : "border-border/40 bg-background/60"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">#{l.tokenId}{l.quantity > 1 ? ` ×${l.quantity}` : ""}</span>
                  <label className="cursor-pointer">
                    <input type="checkbox" checked={selected} onChange={() => toggle(l)} />
                  </label>
                </div>
                <div className="text-[11px] text-emerald-500 font-semibold">{ghst(l.priceWei)} GHST</div>
                <BuyButton
                  listingId={l.listingId}
                  tokenId={l.tokenId}
                  priceInWei={l.priceWei}
                  kind={cat.kind}
                  contractAddress={cat.contract}
                  quantity={1}
                  label={`#${l.tokenId}`}
                />
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
          <button
            disabled={bulkBusy || !isConnected}
            onClick={doBulk}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
          >
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
