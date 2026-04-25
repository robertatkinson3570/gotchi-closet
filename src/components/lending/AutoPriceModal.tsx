import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, TrendingUp, Scale, Zap, ArrowRight } from "lucide-react";
import { autoPrice, type AutoPriceGoal, type AutoPriceResult } from "@/lib/lending/autoPrice";
import { useHistoricalLendings } from "@/hooks/useHistoricalLendings";

type Props = {
  brs: number;
  gotchiName: string | null;
  gotchiTokenId: string;
  onApply: (result: AutoPriceResult) => void;
  onClose: () => void;
};

const GOAL_META: Record<AutoPriceGoal, { label: string; icon: React.ReactNode; desc: string }> = {
  maximize_revenue: {
    label: "Maximize revenue",
    icon: <TrendingUp className="w-4 h-4" />,
    desc: "Aim for the top of the band — may sit unrented longer",
  },
  balance: {
    label: "Balance",
    icon: <Scale className="w-4 h-4" />,
    desc: "Reasonable price expected to fill at typical demand",
  },
  fast_fill: {
    label: "Fast fill",
    icon: <Zap className="w-4 h-4" />,
    desc: "Discount to lock in a renter quickly",
  },
};

export function AutoPriceModal({
  brs,
  gotchiName,
  gotchiTokenId,
  onApply,
  onClose,
}: Props) {
  const [goal, setGoal] = useState<AutoPriceGoal>("balance");
  const { lendings, loading } = useHistoricalLendings(60);

  const result = useMemo(() => {
    if (!lendings.length) return null;
    return autoPrice(lendings, { brs }, goal);
  }, [lendings, brs, goal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Auto-price {gotchiName ?? `#${gotchiTokenId}`}
          </h2>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GOAL_META) as AutoPriceGoal[]).map((g) => {
              const meta = GOAL_META[g];
              const active = goal === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoal(g)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/40 bg-background/50 hover:border-primary/30"
                  }`}
                >
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${active ? "text-primary" : ""}`}>
                    {meta.icon}
                    {meta.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    {meta.desc}
                  </p>
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="h-32 bg-muted/30 animate-pulse rounded" />
          )}

          {result && !loading && (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Recommendation · {result.band} band
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    confidence {result.confidence}/100
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Big label="Period" value={`${result.recommendedPeriodDays}d`} />
                  <Big
                    label="Upfront"
                    value={
                      result.recommendedUpfrontGhst < 1
                        ? `${result.recommendedUpfrontGhst.toFixed(2)} GHST`
                        : `${Math.round(result.recommendedUpfrontGhst).toLocaleString()} GHST`
                    }
                    highlight
                  />
                  <Big
                    label="GHST/week"
                    value={
                      result.expectedGhstPerWeek < 1
                        ? `${result.expectedGhstPerWeek.toFixed(2)}`
                        : `${Math.round(result.expectedGhstPerWeek)}`
                    }
                  />
                  <Big
                    label="Channelling"
                    value={result.recommendedChannellingAllowed ? "On" : "Off"}
                  />
                </div>
                {result.notes.length > 0 && (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                  All evaluated periods (sorted by score)
                </div>
                <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30 text-xs">
                  {result.candidates.map((c, i) => (
                    <div
                      key={c.periodDays}
                      className={`px-3 py-2 grid grid-cols-5 gap-2 items-center ${
                        i === 0 ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="font-mono">{c.periodDays}d</div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase">price</span>
                        <div className="font-semibold">
                          {c.upfrontGhst < 1
                            ? c.upfrontGhst.toFixed(2)
                            : Math.round(c.upfrontGhst).toLocaleString()}{" "}
                          GHST
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase">fill p</span>
                        <div>{Math.round(c.fillProbability * 100)}%</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase">/week</span>
                        <div>{Math.round(c.ghstPerWeek)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground text-[10px] uppercase">comps</span>
                        <div>{c.compsCount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onApply(result)}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold"
              >
                Apply recommendation <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function Big({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-2 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border/30 bg-background/50"
      }`}
    >
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
