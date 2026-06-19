import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { GotchiSvg, prefetchGotchiSvg } from "@/components/gotchi/GotchiSvg";
import type { HistoricalLending } from "@/hooks/useHistoricalLendings";
import { quantile } from "@/lib/lending/analytics";

const NAKED: number[] = new Array(16).fill(0);

type Props = {
  title: string;
  subtitle?: string;
  lendings: HistoricalLending[];
  onClose: () => void;
};

export function DrillDownPanel({ title, subtitle, lendings, onClose }: Props) {
  const [, setSearchParams] = useSearchParams();

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

  // Pre-warm SVGs for visible items
  useEffect(() => {
    for (const l of lendings.slice(0, 30)) {
      const g = l.gotchi;
      if (!g) continue;
      prefetchGotchiSvg({
        gotchiId: l.gotchiTokenId,
        hauntId: g.hauntId,
        collateral: g.collateral,
        numericTraits: g.numericTraits,
        equippedWearables: g.equippedWearables,
        mode: "preview",
      });
    }
  }, [lendings]);

  const stats = useMemo(() => {
    const open = lendings.filter(
      (l) => (!l.whitelistId || l.whitelistId === "0") && l.upfrontGhst > 0
    );
    const prices = open.map((l) => l.upfrontGhst).sort((a, b) => a - b);
    const channelling = lendings.filter((l) => l.channellingAllowed).length;
    return {
      total: lendings.length,
      paidOpenMarket: prices.length,
      median: quantile(prices, 0.5),
      p75: quantile(prices, 0.75),
      max: prices[prices.length - 1] ?? 0,
      channellingPct: lendings.length ? Math.round((channelling / lendings.length) * 1000) / 10 : 0,
    };
  }, [lendings]);

  const sorted = useMemo(
    () => [...lendings].sort((a, b) => b.timeAgreed - a.timeAgreed),
    [lendings]
  );

  const openInModal = (id: string) => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("l", id);
      return next;
    });
  };

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Stat label="Lendings" value={stats.total.toString()} />
            <Stat label="Paid open-mkt" value={stats.paidOpenMarket.toString()} />
            <Stat label="Median GHST" value={stats.median > 0 ? stats.median.toFixed(1) : "—"} />
            <Stat label="p75 GHST" value={stats.p75 > 0 ? stats.p75.toFixed(1) : "—"} />
            <Stat label="Channelling" value={`${stats.channellingPct}%`} />
          </div>

          {sorted.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No lendings match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {sorted.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => openInModal(l.id)}
                  className="rounded-lg border border-border/30 bg-card/50 hover:ring-1 hover:ring-primary/40 transition-all overflow-hidden text-left"
                >
                  <div className="aspect-square bg-muted/10 relative">
                    {l.gotchi ? (
                      <GotchiSvg
                        gotchiId={l.gotchiTokenId}
                        hauntId={l.gotchi.hauntId}
                        collateral={l.gotchi.collateral}
                        numericTraits={l.gotchi.numericTraits}
                        equippedWearables={l.gotchi.equippedWearables.length === 16 ? l.gotchi.equippedWearables : NAKED}
                        mode="preview"
                        className="w-full h-full"
                        useBlobUrl
                      />
                    ) : (
                      <div className="w-full h-full bg-muted/40 animate-pulse" />
                    )}
                    <div className="absolute top-1 right-1 text-[9px] font-semibold px-1 rounded bg-background/80">
                      BRS {l.gotchiBRS}
                    </div>
                    {l.cancelled && (
                      <div className="absolute bottom-1 left-1 text-[9px] font-semibold px-1 rounded bg-destructive/80 text-destructive-foreground">
                        cancelled
                      </div>
                    )}
                    {l.completed && (
                      <div className="absolute bottom-1 left-1 text-[9px] font-semibold px-1 rounded bg-muted/80">
                        completed
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 space-y-0.5">
                    <div className="text-xs font-medium truncate">
                      {l.gotchi?.name || `#${l.gotchiTokenId}`}
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-green-500 font-semibold">
                        {l.upfrontGhst > 0
                          ? l.upfrontGhst < 1
                            ? l.upfrontGhst.toFixed(2)
                            : Math.round(l.upfrontGhst).toLocaleString()
                          : "0"}{" "}
                        GHST
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round((l.period / 86400) * 10) / 10}d
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      B {l.splitBorrower}% · L {l.splitOwner}%
                      {l.splitOther > 0 ? ` · 3p ${l.splitOther}%` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(l.timeAgreed * 1000).toISOString().slice(0, 10)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/30 bg-background/50 px-2 py-1.5 text-center">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
