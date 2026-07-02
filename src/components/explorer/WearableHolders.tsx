import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { fetchTopHolders } from "@/lib/explorer/wearableHolders";
import { shortAddress } from "@/lib/format";

/** Top-holder distribution for a single wearable, sourced from the core
 *  subgraph's `itemTypeOwnerships` entity. Mirrors the RecentSales table. */
export function WearableHolders({ wearableId, totalSupply }: { wearableId: number; totalSupply?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["wearable-holders", wearableId],
    queryFn: () => fetchTopHolders(wearableId),
    staleTime: 300_000,
  });

  const hasSupply = typeof totalSupply === "number" && totalSupply > 0;

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">Top holders</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No holders found for this wearable.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 text-[11px]">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-2.5 py-1.5">#</th>
                <th className="text-left font-medium px-2.5 py-1.5">Owner</th>
                <th className="text-right font-medium px-2.5 py-1.5">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.owner} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2.5 py-1.5">
                    <Link to={`/u/${row.owner}`} className="font-mono text-primary hover:underline">{shortAddress(row.owner)}</Link>
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {row.balance.toLocaleString()}
                    {hasSupply && (
                      <span className="text-muted-foreground font-normal">
                        {" "}({((row.balance / (totalSupply as number)) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
