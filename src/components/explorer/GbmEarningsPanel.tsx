import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchIncentives, fetchScorecard, fetchSellerSales } from "@/lib/gbmEarnings";
import { itemMetaSync } from "@/lib/explorer/itemMeta";

const ghst = (v: number) => {
  if (v > 0 && v < 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 1 : 0 });
};
function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const m = Math.floor(Math.abs(s) / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const v = d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "just now";
  return v === "just now" ? v : s < 0 ? `in ${v}` : `${v} ago`;
}
const itemName = (tokenId: string) => itemMetaSync(tokenId)?.name ?? `#${tokenId}`;

/**
 * GBM bid-to-earn payouts, per-wallet scorecard, and seller net-proceeds for
 * one address. Standalone panel (own data + types) rendered from the
 * Earnings tab on UserActivityPage — deliberately not forced through that
 * page's generic `Item` shape.
 */
export function GbmEarningsPanel({ address }: { address: string }) {
  const { data: scorecard, isLoading: scorecardLoading } = useQuery({
    queryKey: ["gbm-scorecard", address],
    queryFn: () => fetchScorecard(address),
    staleTime: 60_000,
  });
  const { data: incentives, isLoading: incentivesLoading } = useQuery({
    queryKey: ["gbm-incentives", address],
    queryFn: () => fetchIncentives(address),
    staleTime: 60_000,
  });
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["gbm-seller-sales", address],
    queryFn: () => fetchSellerSales(address),
    staleTime: 60_000,
  });

  const totalIncentives = (incentives ?? []).reduce((sum, i) => sum + i.amountGhst, 0);

  return (
    <div className="space-y-5">
      <div>
        {scorecardLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : !scorecard ? (
          <div className="text-[11px] text-muted-foreground py-2">No GBM activity for this wallet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded bg-muted/30 py-1.5 text-center">
              <div className="text-base font-bold text-emerald-500">{ghst(scorecard.payoutGhst)}</div>
              <div className="text-[10px] text-muted-foreground">Earned from outbids</div>
            </div>
            <div className="rounded bg-muted/30 py-1.5 text-center">
              <div className="text-base font-bold">{scorecard.bids}</div>
              <div className="text-[10px] text-muted-foreground">Bids <span className="text-muted-foreground/70">({scorecard.outbids} outbid)</span></div>
            </div>
            <div className="rounded bg-muted/30 py-1.5 text-center">
              <div className="text-base font-bold">{scorecard.wins}</div>
              <div className="text-[10px] text-muted-foreground">Auctions won</div>
            </div>
            <div className="rounded bg-muted/30 py-1.5 text-center">
              <div className="text-base font-bold">{scorecard.auctionsCreated}</div>
              <div className="text-[10px] text-muted-foreground">Auctions created</div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold mb-1.5">Incentive history</div>
        {incentivesLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : !incentives || incentives.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">No outbid payouts yet.</div>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground mb-1">
              Total: <span className="text-emerald-500 font-semibold">{ghst(totalIncentives)} GHST</span> across {incentives.length} payouts
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-2.5 py-1.5">Item</th>
                    <th className="text-right font-medium px-2.5 py-1.5">Amount</th>
                    <th className="text-right font-medium px-2.5 py-1.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {incentives.map((row, i) => (
                    <tr key={`${row.auctionId}-${i}`} className="border-t border-border/20">
                      <td className="px-2.5 py-1.5">{itemName(row.tokenId)}</td>
                      <td className="px-2.5 py-1.5 text-right text-emerald-500 font-semibold">{ghst(row.amountGhst)} GHST</td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(row.receiveTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {salesLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : sales && sales.length > 0 ? (
        <div>
          <div className="text-sm font-semibold mb-1.5">Seller P&amp;L</div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left font-medium px-2.5 py-1.5">Item</th>
                  <th className="text-right font-medium px-2.5 py-1.5">Net proceeds</th>
                  <th className="text-right font-medium px-2.5 py-1.5">Fees</th>
                  <th className="text-right font-medium px-2.5 py-1.5">When</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const fees = s.platformFeesGhst + s.gbmFeesGhst + s.royaltyFeesGhst;
                  const feeTitle = `Platform: ${ghst(s.platformFeesGhst)} GHST · GBM: ${ghst(s.gbmFeesGhst)} GHST · Royalty: ${ghst(s.royaltyFeesGhst)} GHST`;
                  return (
                    <tr key={s.auctionId} className="border-t border-border/20">
                      <td className="px-2.5 py-1.5">{itemName(s.tokenId)}</td>
                      <td className="px-2.5 py-1.5 text-right text-emerald-500 font-semibold">{ghst(s.proceedsGhst)} GHST</td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground" title={feeTitle}>{ghst(fees)} GHST</td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(s.endsAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
