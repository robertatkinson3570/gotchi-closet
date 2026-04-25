import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trophy, Coins, Repeat } from "lucide-react";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import type { GotchiStat } from "@/lib/lending/analytics";

const NAKED: number[] = new Array(16).fill(0);

type Props = {
  rows: GotchiStat[];
};

type Mode = "count" | "earnings";

export function TopGotchisLeaderboard({ rows }: Props) {
  const [mode, setMode] = useState<Mode>("count");
  const [, setSearchParams] = useSearchParams();

  const sorted = [...rows]
    .sort((a, b) => (mode === "count" ? b.count - a.count : b.totalGhstEarned - a.totalGhstEarned))
    .slice(0, 12);

  const open = (id: string) => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.delete("l");
      return next;
    });
    // No specific lending — link to marketplace search by gotchi id
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("g", id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold inline-flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-500" /> Top gotchis
        </h3>
        <div className="flex items-center gap-0.5 text-[11px] rounded-md border border-border/40 bg-background/70 p-0.5">
          <button
            type="button"
            onClick={() => setMode("count")}
            className={`px-2 py-1 rounded inline-flex items-center gap-1 ${
              mode === "count" ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            <Repeat className="w-3 h-3" /> Rentals
          </button>
          <button
            type="button"
            onClick={() => setMode("earnings")}
            className={`px-2 py-1 rounded inline-flex items-center gap-1 ${
              mode === "earnings" ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            <Coins className="w-3 h-3" /> Earnings
          </button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-4 text-center">No data</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {sorted.map((s, i) => {
            const g = s.sample?.gotchi;
            return (
              <button
                key={s.tokenId}
                type="button"
                onClick={() => open(s.tokenId)}
                className="rounded-lg border border-border/30 bg-background/50 hover:ring-1 hover:ring-primary/40 transition-all overflow-hidden text-left"
              >
                <div className="aspect-square relative bg-muted/10">
                  {g ? (
                    <GotchiSvg
                      gotchiId={s.tokenId}
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
                  <div className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-amber-950">
                    #{i + 1}
                  </div>
                  <div className="absolute top-1 right-1 text-[9px] font-semibold px-1 rounded bg-background/80">
                    BRS {s.modBRS}
                  </div>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  <div className="text-xs font-medium truncate">
                    {s.name || `#${s.tokenId}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">#{s.tokenId}</div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-foreground">
                      {mode === "count"
                        ? `${s.count} rentals`
                        : `${Math.round(s.totalGhstEarned)} GHST`}
                    </span>
                    <span className="text-muted-foreground">
                      avg {s.averageGhst < 1 ? s.averageGhst.toFixed(2) : Math.round(s.averageGhst)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
