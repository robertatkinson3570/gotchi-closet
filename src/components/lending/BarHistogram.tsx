import type { HistogramBin } from "@/lib/lending/analytics";

type Props = {
  title: string;
  bins: HistogramBin[];
  unit?: string;
  color?: "primary" | "amber" | "green" | "pink";
};

const COLORS = {
  primary: "bg-primary/60",
  amber: "bg-amber-500/60",
  green: "bg-emerald-500/60",
  pink: "bg-pink-500/60",
};

export function BarHistogram({ title, bins, unit = "", color = "primary" }: Props) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((s, b) => s + b.count, 0);
  const fillClass = COLORS[color] ?? COLORS.primary;

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{total} samples</span>
      </div>
      <div className="space-y-1">
        {bins.map((b) => {
          const pct = (b.count / max) * 100;
          return (
            <div key={b.label} className="flex items-center gap-2 text-[11px]">
              <div className="w-14 text-right text-muted-foreground font-mono shrink-0">
                {b.label}
                {unit}
              </div>
              <div className="flex-1 h-5 bg-muted/30 rounded relative overflow-hidden">
                <div
                  className={`h-full ${fillClass} transition-all`}
                  style={{ width: `${pct}%` }}
                />
                <div className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium">
                  {b.count > 0 ? b.count : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
