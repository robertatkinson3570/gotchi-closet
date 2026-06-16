import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, ArrowRightLeft } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { CORE_SUBGRAPH_URL, BAAZAAR_CATEGORY } from "@/lib/lending/contracts";

type Sale = {
  id: string;
  kind: "erc721" | "erc1155";
  category: number;
  tokenId: string;
  quantity: number;
  priceWei: string;
  seller: string;
  buyer: string;
  timePurchased: number;
};

const CATEGORY_LABEL: Record<number, string> = {
  0: "Wearable",
  2: "Consumable",
  3: "Gotchi",
  4: "Parcel",
};

const FILTERS: { key: string; label: string; categories: number[] | null }[] = [
  { key: "all", label: "All", categories: null },
  { key: "gotchi", label: "Gotchis", categories: [BAAZAAR_CATEGORY.AAVEGOTCHI] },
  { key: "wearable", label: "Wearables", categories: [BAAZAAR_CATEGORY.WEARABLE] },
  { key: "item", label: "Items", categories: [BAAZAAR_CATEGORY.CONSUMABLE] },
  { key: "parcel", label: "Parcels", categories: [BAAZAAR_CATEGORY.REALM] },
];

async function fetchActivity(): Promise<Sale[]> {
  // NOTE: erc1155Listings has no `buyer`/`timePurchased` — it uses `sold` +
  // `timeLastPurchased`. erc721Listings has buyer + timePurchased.
  const query = `
    query Activity {
      erc721Listings(first: 100, where: { timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc) {
        id category tokenId priceInWei seller buyer recipient timePurchased
      }
      erc1155Listings(first: 100, where: { sold: true }, orderBy: timeLastPurchased, orderDirection: desc) {
        id category erc1155TypeId quantity priceInWei seller timeLastPurchased
      }
    }`;
  const res = await fetch(CORE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  const e721: Sale[] = (json.data?.erc721Listings ?? []).map((l: any) => ({
    id: `721-${l.id}`,
    kind: "erc721" as const,
    category: Number(l.category),
    tokenId: l.tokenId,
    quantity: 1,
    priceWei: l.priceInWei,
    seller: l.seller,
    buyer: l.recipient || l.buyer,
    timePurchased: Number(l.timePurchased),
  }));
  const e1155: Sale[] = (json.data?.erc1155Listings ?? []).map((l: any) => ({
    id: `1155-${l.id}`,
    kind: "erc1155" as const,
    category: Number(l.category),
    tokenId: l.erc1155TypeId,
    quantity: Number(l.quantity) || 1,
    priceWei: l.priceInWei,
    seller: l.seller,
    buyer: "",
    timePurchased: Number(l.timeLastPurchased),
  }));
  return [...e721, ...e1155].sort((a, b) => b.timePurchased - a.timePurchased);
}

const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const ghst = (wei: string) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 });
function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["baazaar-activity"],
    queryFn: fetchActivity,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const cats = FILTERS.find((f) => f.key === filter)?.categories;
    const all = data ?? [];
    return cats ? all.filter((s) => cats.includes(s.category)) : all;
  }, [data, filter]);

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Activity — GotchiCloset" description="Recent Baazaar sales across the Aavegotchi marketplace." canonical={siteUrl("/activity")} />
      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-4">
        <Activity className="w-6 h-6 text-primary" /> Activity
      </h1>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`h-8 px-3 rounded-md text-xs font-medium border ${
              filter === f.key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No recent sales.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-left font-medium px-3 py-2">Item</th>
                <th className="text-right font-medium px-3 py-2">Price</th>
                <th className="text-left font-medium px-3 py-2">Seller → Buyer</th>
                <th className="text-right font-medium px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border/20 hover:bg-muted/20">
                  <td className="px-3 py-1.5">{CATEGORY_LABEL[s.category] ?? `Cat ${s.category}`}</td>
                  <td className="px-3 py-1.5 font-mono">#{s.tokenId}{s.quantity > 1 ? ` ×${s.quantity}` : ""}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">{ghst(s.priceWei)} GHST</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">{short(s.seller)} <ArrowRightLeft className="w-3 h-3" /> {short(s.buyer)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{ago(s.timePurchased)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
