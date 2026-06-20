import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CORE_SUBGRAPH } from "@/lib/subgraph";
import { shortAddress as short } from "@/lib/format";

type Sale = { seller: string; buyer?: string; priceWei: string; time: number };

const ghst = (wei: string) => {
  const v = Number(wei) / 1e18;
  if (v > 0 && v < 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 2 : 0 });
};
function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

async function fetchSales(kind: "erc721" | "erc1155", tokenId: string): Promise<Sale[]> {
  const q = kind === "erc721"
    ? `{ erc721Listings(first: 25, where: { tokenId: "${tokenId}", timePurchased_gt: "0" }, orderBy: timePurchased, orderDirection: desc){ seller buyer priceInWei timePurchased } }`
    : `{ erc1155Listings(first: 25, where: { erc1155TypeId: "${tokenId}", sold: true }, orderBy: timeLastPurchased, orderDirection: desc){ seller priceInWei timeLastPurchased } }`;
  const res = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  if (kind === "erc721") {
    return (json.data?.erc721Listings ?? []).map((l: any) => ({ seller: l.seller, buyer: l.buyer, priceWei: l.priceInWei, time: Number(l.timePurchased) }));
  }
  return (json.data?.erc1155Listings ?? []).map((l: any) => ({ seller: l.seller, priceWei: l.priceInWei, time: Number(l.timeLastPurchased) }));
}

/** Recent on-chain sale history for a token (Baazaar fixed-price fills). */
export function RecentSales({ kind, tokenId }: { kind: "erc721" | "erc1155"; tokenId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["recent-sales", kind, tokenId],
    queryFn: () => fetchSales(kind, tokenId),
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">Recent sales</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No recorded sales for this token.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-2.5 py-1.5">Seller</th>
                <th className="text-right font-medium px-2.5 py-1.5">Price</th>
                <th className="text-right font-medium px-2.5 py-1.5">When</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={i} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5">
                    <Link to={`/u/${s.seller}`} className="font-mono text-primary hover:underline">{short(s.seller)}</Link>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-500 font-semibold">{ghst(s.priceWei)} GHST</td>
                  <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(s.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
