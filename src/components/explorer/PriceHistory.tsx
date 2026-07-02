import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchPriceHistory, type PriceHistoryKind } from "@/lib/explorer/priceHistory";

const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Lifetime sale-price sparkline + trade count for a gotchi, portal, or parcel. */
export function PriceHistory({ kind, tokenId }: { kind: PriceHistoryKind; tokenId: string }) {
  const { data } = useQuery({
    queryKey: ["price-history", kind, tokenId],
    queryFn: () => fetchPriceHistory(kind, tokenId),
    staleTime: 300_000,
  });

  if (!data || data.pricesGhst.length < 2) return null;

  const { pricesGhst, timesTraded } = data;
  const points = pricesGhst.map((p, i) => ({ i, p }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-semibold">Price history</div>
        <div className="text-[11px] text-muted-foreground">traded {timesTraded}×</div>
      </div>
      <div className="text-primary">
        <ResponsiveContainer width="100%" height={64}>
          <LineChart data={points}>
            <Line dataKey="p" stroke="currentColor" dot={false} strokeWidth={2} />
            <Tooltip formatter={(value) => [`${fmt(Number(value))} GHST`, "Price"]} labelFormatter={() => ""} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-muted-foreground">
        first {fmt(pricesGhst[0])} → last {fmt(pricesGhst[pricesGhst.length - 1])} GHST
      </div>
    </div>
  );
}
