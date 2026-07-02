import { useMemo, useState } from "react";
import { Calculator, Zap, Info } from "lucide-react";
import { suggestPrice } from "@/lib/lending/analytics";
import type { HistoricalLending } from "@/hooks/useHistoricalLendings";

type Props = {
  lendings: HistoricalLending[];
};

const TIER_LABELS: Record<string, { label: string; tone: "good" | "ok" | "soft" | "weak" }> = {
  "band+bucket": { label: "Strong match", tone: "good" },
  band: { label: "Same band, any duration", tone: "ok" },
  wide: { label: "Widened ±100 BRS", tone: "soft" },
  closest: { label: "Closest by BRS", tone: "weak" },
  none: { label: "No data", tone: "weak" },
};

const TONE_CLASSES: Record<string, string> = {
  good: "bg-green-500/15 text-green-500",
  ok: "bg-primary/15 text-primary",
  soft: "bg-amber-500/15 text-amber-500",
  weak: "bg-muted/40 text-muted-foreground",
};

export function SuggestedPriceWidget({ lendings }: Props) {
  const [brs, setBrs] = useState("700");
  const [days, setDays] = useState("7");

  const result = useMemo(() => {
    const brsNum = Number(brs) || 0;
    const daysNum = Number(days) || 7;
    if (!brsNum) return null;
    return suggestPrice(lendings, brsNum, daysNum);
  }, [brs, days, lendings]);

  const tier = result ? TIER_LABELS[result.matchTier] : null;

  return (
    <div className="rounded-xl glass p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Suggested price</h3>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            BRS w/ wearables
          </label>
          <input
            type="number"
            value={brs}
            onChange={(e) => setBrs(e.target.value)}
            className="w-full min-w-0 h-9 mt-0.5 px-2 rounded border border-border/40 bg-background/70 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Duration (days)
          </label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-full min-w-0 h-9 mt-0.5 px-2 rounded border border-border/40 bg-background/70 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      {result && tier && (
        <>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                TONE_CLASSES[tier.tone]
              }`}
            >
              {tier.label}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">
              {result.matchDescription} · {result.paidCount} paid
            </span>
          </div>

          {result.paidCount === 0 ? (
            <div className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border/40 rounded">
              No paid open-market rentals anywhere close to this BRS in the current window.
              Try widening the time window in the toolbar.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                <Stat label="median" value={result.median} highlight />
                <Stat label="p75" value={result.p75} />
                <Stat label="p90" value={result.p90} />
                <Stat label="max" value={result.max} />
              </div>

              {result.matchTier !== "band+bucket" && (
                <div className="text-[10px] text-muted-foreground mb-2 inline-flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    Few comps for{" "}
                    <span className="font-medium">
                      {result.band} × {result.durationBucket}
                    </span>
                    . Falling back to{" "}
                    <span className="font-medium">{result.matchDescription}</span>.
                    Treat the recommendation as directional.
                  </span>
                </div>
              )}

              {result.recentSamples.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Recent comps
                  </div>
                  <div className="space-y-0.5 text-[11px] font-mono max-h-44 overflow-y-auto">
                    {result.recentSamples.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-muted-foreground gap-2"
                      >
                        <span className="shrink-0">
                          BRS {s.brs} · {s.days}d
                        </span>
                        {s.channelling && <Zap className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span className="text-foreground shrink-0">
                          {s.ghst.toFixed(s.ghst < 1 ? 2 : 1)}
                        </span>
                        <span className="text-[10px] shrink-0">{s.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border/30 bg-background/50"
      } px-2 py-1.5 text-center`}
    >
      <div className="text-[9px] text-muted-foreground uppercase">{label}</div>
      <div
        className={`text-sm font-semibold ${highlight ? "text-primary" : ""}`}
        title={`${value.toFixed(2)} GHST`}
      >
        {value < 1 ? value.toFixed(2) : Math.round(value)}
      </div>
    </div>
  );
}
