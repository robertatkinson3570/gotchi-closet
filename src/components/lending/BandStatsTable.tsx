import type { BandStat } from "@/lib/lending/analytics";

type Props = {
  rows: BandStat[];
  onBandClick?: (band: string) => void;
};

export function BandStatsTable({ rows, onBandClick }: Props) {
  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Per-band statistics</h3>
          <p className="text-[10px] text-muted-foreground">
            paid open-market only · click a band to drill in
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left pb-1.5 pl-1">BRS band</th>
              <th className="text-right pb-1.5">Total</th>
              <th className="text-right pb-1.5">Paid</th>
              <th className="text-right pb-1.5">Min</th>
              <th className="text-right pb-1.5">p25</th>
              <th className="text-right pb-1.5 text-foreground">Median</th>
              <th className="text-right pb-1.5">p75</th>
              <th className="text-right pb-1.5">p90</th>
              <th className="text-right pb-1.5">Max</th>
              <th className="text-right pb-1.5">Mean</th>
              <th className="text-right pb-1.5">Channel%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.band}
                onClick={onBandClick && r.count > 0 ? () => onBandClick(r.band) : undefined}
                className={`border-t border-border/30 ${
                  onBandClick && r.count > 0 ? "cursor-pointer hover:bg-muted/30" : ""
                }`}
              >
                <td className="py-1.5 pl-1 font-mono">{r.band}</td>
                <td className="py-1.5 text-right">{r.count || "-"}</td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {r.paidCount || "-"}
                </td>
                <Cell value={r.min} />
                <Cell value={r.p25} />
                <Cell value={r.median} highlight />
                <Cell value={r.p75} />
                <Cell value={r.p90} />
                <Cell value={r.max} />
                <Cell value={r.mean} />
                <td className="py-1.5 text-right text-muted-foreground">
                  {r.channellingPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ value, highlight }: { value: number; highlight?: boolean }) {
  if (!value) return <td className="py-1.5 text-right text-muted-foreground/40">-</td>;
  return (
    <td className={`py-1.5 text-right ${highlight ? "font-semibold" : ""}`}>
      {value < 1 ? value.toFixed(2) : Math.round(value).toLocaleString()}
    </td>
  );
}
