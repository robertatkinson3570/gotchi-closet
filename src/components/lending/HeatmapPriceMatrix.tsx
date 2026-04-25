import { useMemo } from "react";
import type { HeatCell } from "@/lib/lending/analytics";
import { BRS_BANDS, DURATION_BUCKETS } from "@/lib/lending/types";

type Props = {
  cells: HeatCell[];
  onCellClick?: (brsBand: string, durBucket: string) => void;
};

const ALL_BANDS = BRS_BANDS.map((b) => b.label);
const ALL_DURS = DURATION_BUCKETS.map((b) => b.label);

function intensity(value: number, max: number): string {
  if (!value || !max) return "bg-muted/20";
  const pct = Math.min(1, value / max);
  // green (low) → amber → pink → fuchsia (high)
  if (pct < 0.15) return "bg-emerald-500/15 text-emerald-300";
  if (pct < 0.3) return "bg-emerald-500/25 text-emerald-200";
  if (pct < 0.5) return "bg-amber-500/25 text-amber-200";
  if (pct < 0.7) return "bg-pink-500/30 text-pink-200";
  if (pct < 0.85) return "bg-fuchsia-500/40 text-fuchsia-100";
  return "bg-fuchsia-500/60 text-white font-semibold";
}

export function HeatmapPriceMatrix({ cells, onCellClick }: Props) {
  const map = useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of cells) m.set(`${c.brsBand}|${c.durBucket}`, c);
    return m;
  }, [cells]);

  const max = useMemo(
    () => Math.max(0, ...cells.map((c) => c.median)),
    [cells]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-muted-foreground font-medium pl-1 pr-2">
              BRS ↓ / Duration →
            </th>
            {ALL_DURS.map((d) => (
              <th
                key={d}
                className="text-center text-muted-foreground font-medium px-1 pb-1 min-w-[60px]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_BANDS.slice()
            .reverse()
            .map((band) => (
              <tr key={band}>
                <td className="text-right text-muted-foreground font-mono pr-2 pl-1 whitespace-nowrap">
                  {band}
                </td>
                {ALL_DURS.map((dur) => {
                  const cell = map.get(`${band}|${dur}`);
                  const median = cell?.median ?? 0;
                  const count = cell?.count ?? 0;
                  const paidCount = cell?.paidCount ?? 0;
                  const cls = intensity(median, max);
                  const clickable = !!onCellClick && count > 0;
                  return (
                    <td
                      key={dur}
                      onClick={clickable ? () => onCellClick(band, dur) : undefined}
                      className={`text-center rounded px-1 py-1.5 ${cls} ${
                        clickable ? "cursor-pointer hover:ring-1 hover:ring-primary/50" : "cursor-help"
                      }`}
                      title={
                        cell && paidCount > 0
                          ? `${band} × ${dur}\nN=${paidCount} paid (of ${count} total)\nmedian=${median.toFixed(1)} GHST\np75=${cell.p75.toFixed(1)}\np90=${cell.p90.toFixed(1)}\n${clickable ? "Click to drill in" : ""}`
                          : `${band} × ${dur}\n${count > 0 ? `${count} lendings (none paid)` : "No lendings"}`
                      }
                    >
                      {paidCount > 0 ? (
                        <div>
                          <div className="font-semibold">{median.toFixed(0)}</div>
                          <div className="text-[9px] opacity-70">n={paidCount}</div>
                        </div>
                      ) : count > 0 ? (
                        <div className="text-[10px] opacity-50">{count}</div>
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
