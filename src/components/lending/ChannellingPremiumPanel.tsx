import type { ChannellingComparison } from "@/lib/lending/analytics";
import { Zap } from "lucide-react";

type Props = {
  rows: ChannellingComparison[];
};

export function ChannellingPremiumPanel({ rows }: Props) {
  const visible = rows.filter(
    (r) => r.withChannelling.count > 0 || r.withoutChannelling.count > 0
  );
  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold inline-flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" />
            Channelling premium
          </h3>
          <p className="text-[10px] text-muted-foreground">
            does enabling channelling change median price? (open-market only)
          </p>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-4 text-center">
          No data
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left pb-1.5">BRS band</th>
                <th className="text-right pb-1.5">w/ channelling</th>
                <th className="text-right pb-1.5">w/o channelling</th>
                <th className="text-right pb-1.5">premium</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.brsBand} className="border-t border-border/30">
                  <td className="py-1.5 font-mono text-muted-foreground">{r.brsBand}</td>
                  <td className="py-1.5 text-right">
                    {r.withChannelling.count > 0 ? (
                      <span>
                        <span className="font-semibold">{r.withChannelling.median.toFixed(1)}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          n={r.withChannelling.count}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.withoutChannelling.count > 0 ? (
                      <span>
                        <span className="font-semibold">{r.withoutChannelling.median.toFixed(1)}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          n={r.withoutChannelling.count}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.premiumPct == null ? (
                      <span className="text-muted-foreground/40">-</span>
                    ) : (
                      <span
                        className={
                          r.premiumPct > 5
                            ? "text-green-500 font-semibold"
                            : r.premiumPct < -5
                            ? "text-pink-500 font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {r.premiumPct > 0 ? "+" : ""}
                        {r.premiumPct.toFixed(0)}%
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
