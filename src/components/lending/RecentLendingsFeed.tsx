import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Zap, Lock } from "lucide-react";
import { GotchiSvg, prefetchGotchiSvg } from "@/components/gotchi/GotchiSvg";
import type { HistoricalLending } from "@/hooks/useHistoricalLendings";

const NAKED: number[] = new Array(16).fill(0);

type Props = {
  lendings: HistoricalLending[];
  limit?: number;
  onMore?: () => void;
};

export function RecentLendingsFeed({ lendings, limit = 18, onMore }: Props) {
  const [, setSearchParams] = useSearchParams();
  const items = lendings.slice(0, limit);

  useEffect(() => {
    for (const l of items) {
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
  }, [items]);

  const open = (id: string) => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("l", id);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl glass p-6 text-center text-sm text-muted-foreground">
        No recent lendings to show.
      </div>
    );
  }

  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Recent rentals</h3>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="text-xs text-primary hover:underline"
          >
            See all
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {items.map((l) => {
          const g = l.gotchi;
          const isOpen = !l.whitelistId || l.whitelistId === "0";
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => open(l.id)}
              className="rounded-lg border border-border/30 bg-background/50 hover:ring-1 hover:ring-primary/40 transition-all overflow-hidden text-left"
              title={`${g?.name || `#${l.gotchiTokenId}`} · ${l.upfrontGhst.toFixed(1)} GHST · ${Math.round((l.period / 86400) * 10) / 10}d`}
            >
              <div className="aspect-square relative bg-muted/10">
                {g ? (
                  <GotchiSvg
                    gotchiId={l.gotchiTokenId}
                    hauntId={g.hauntId}
                    collateral={g.collateral}
                    numericTraits={g.numericTraits}
                    equippedWearables={g.equippedWearables.length === 16 ? g.equippedWearables : NAKED}
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
                <div className="absolute top-1 left-1 flex items-center gap-1">
                  {l.channellingAllowed && (
                    <span className="bg-amber-500/90 text-amber-950 text-[8px] font-semibold px-1 rounded inline-flex items-center gap-0.5">
                      <Zap className="w-2 h-2" />
                    </span>
                  )}
                  {!isOpen && (
                    <span className="bg-cyan-500/90 text-cyan-950 text-[8px] font-semibold px-1 rounded inline-flex items-center gap-0.5">
                      <Lock className="w-2 h-2" />
                    </span>
                  )}
                </div>
              </div>
              <div className="px-1.5 py-1 space-y-0.5">
                <div className="text-[10px] font-medium truncate">
                  {g?.name || `#${l.gotchiTokenId}`}
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-green-500 font-semibold">
                    {l.upfrontGhst > 0
                      ? l.upfrontGhst < 1
                        ? l.upfrontGhst.toFixed(2)
                        : Math.round(l.upfrontGhst).toLocaleString()
                      : "0"}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round((l.period / 86400) * 10) / 10}d
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
