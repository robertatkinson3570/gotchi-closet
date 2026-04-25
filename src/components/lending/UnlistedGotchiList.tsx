import { useMemo, useState } from "react";
import { ListPlus, Loader2, Zap } from "lucide-react";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { ListLendingModal } from "./ListLendingModal";
import { estimateChannellingValueGhst, maxChannelsInPeriod } from "@/lib/lending/alchemica";
import { useAlchemicaPrices } from "@/hooks/useAlchemicaPrices";

type Props = {
  ownerAddress: string;
};

type Row = {
  tokenId: string;
  name: string;
  modBRS: number;
  baseBRS: number;
  level: number;
  kinship: number;
  hauntId: number;
  lendingActive: boolean;
};

function suggested(modBRS: number): number {
  if (modBRS >= 700) return 250;
  if (modBRS >= 660) return 150;
  if (modBRS >= 630) return 80;
  if (modBRS >= 600) return 50;
  if (modBRS >= 570) return 30;
  if (modBRS >= 530) return 15;
  return 15;
}

export function UnlistedGotchiList({ ownerAddress }: Props) {
  const { gotchis, isLoading } = useGotchisByOwner(ownerAddress);
  const { prices, isLive } = useAlchemicaPrices();
  const [listing, setListing] = useState<Row | null>(null);

  const rows: Row[] = useMemo(() => {
    return (gotchis ?? [])
      .map((g: any) => ({
        tokenId: String(g.gotchiId ?? g.id),
        name: g.name ?? "Unnamed",
        modBRS: Number(
          g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0
        ),
        baseBRS: Number(g.baseRarityScore ?? 0),
        level: Number(g.level ?? 1),
        kinship: Number(g.kinship ?? 0),
        hauntId: Number(g.hauntId ?? 2),
        lendingActive: Boolean(g.lending && Number(g.lending) > 0),
      }))
      .sort((a: Row, b: Row) => b.modBRS - a.modBRS);
  }, [gotchis]);

  const unlisted = rows.filter((r) => !r.lendingActive);
  const listedCount = rows.length - unlisted.length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/30 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-6 text-center text-sm text-muted-foreground">
        No gotchis found in this wallet.
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">
        {unlisted.length} unlisted of {rows.length} owned
        {listedCount > 0 && ` · ${listedCount} already listed`}
      </div>

      <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30">
        {unlisted.map((r) => (
          <div
            key={r.tokenId}
            className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{r.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                #{r.tokenId} · Lv {r.level} · Kin {r.kinship}
              </div>
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <div className="text-xs">
                BRS <span className="font-semibold">{r.modBRS}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">base {r.baseBRS}</div>
            </div>
            <div className="text-[11px] text-muted-foreground shrink-0 hidden md:block text-right">
              <div>~{suggested(r.modBRS)} GHST/wk</div>
              {(() => {
                // 7-day channelling yield estimate (lender's 20% slice of alchemica)
                const channels = maxChannelsInPeriod(7 * 86400) * 0.7;
                const total = estimateChannellingValueGhst(r.hauntId, channels, prices);
                const lender = total * 0.2;
                if (lender < 0.01) return null;
                return (
                  <div
                    className="text-[10px] inline-flex items-center gap-0.5 text-amber-500"
                    title={`Estimated channelling alchemica value to you (lender 20% split) for a 7-day rental${isLive ? " · live prices" : " · placeholder prices"}`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    +~{lender < 1 ? lender.toFixed(2) : Math.round(lender)} GHST alch{isLive ? "" : "*"}
                  </div>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={() => setListing(r)}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 text-xs font-semibold transition-colors shrink-0"
              data-testid={`list-${r.tokenId}-btn`}
            >
              <ListPlus className="w-3.5 h-3.5" />
              List
            </button>
          </div>
        ))}

        {unlisted.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            All your gotchis are already listed. <Loader2 className="w-3 h-3 inline-block animate-spin ml-1" />
          </div>
        )}
      </div>

      {listing && (
        <ListLendingModal
          gotchiTokenId={listing.tokenId}
          gotchiName={listing.name}
          modBRS={listing.modBRS}
          originalOwner={ownerAddress}
          onClose={() => setListing(null)}
          onListed={() => setListing(null)}
        />
      )}
    </div>
  );
}
