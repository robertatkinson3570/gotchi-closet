import { Link } from "react-router-dom";
import { Popover } from "@headlessui/react";
import { ArrowUpRight, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useAlchemicaUsd, useGhstTicker } from "@/hooks/useGhstUsd";

/** $ formatting that survives alchemica-sized prices (e.g. $0.00000992). */
function fmtUsd(v: number): string {
  if (v >= 0.01) return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

const BADGE: Record<string, string> = {
  GHST: "from-fuchsia-500/30 to-purple-500/10",
  FUD: "from-emerald-500/30 to-green-500/10",
  FOMO: "from-orange-500/30 to-amber-500/10",
  ALPHA: "from-cyan-500/30 to-sky-500/10",
  KEK: "from-pink-500/30 to-rose-500/10",
  GLTR: "from-yellow-500/30 to-amber-500/10",
};

function TokenRow({ symbol, usd, change24h }: { symbol: string; usd: number; change24h: number | null }) {
  const up = (change24h ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br ${BADGE[symbol] ?? BADGE.GHST} text-[8px] font-black text-primary`}>
          {symbol[0]}
        </span>
        {symbol}
      </span>
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="font-semibold">${fmtUsd(usd)}</span>
        {change24h != null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-emerald-500" : "text-rose-500"}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change24h).toFixed(2)}%
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Rendered only while the panel is open, so the alchemica price fetch costs
 * nothing until the user expands the ticker.
 */
function AlchemicaRows() {
  const { data, isLoading } = useAlchemicaUsd();
  if (isLoading) return <div className="px-2 py-1.5 text-muted-foreground">Loading alchemica…</div>;
  if (!data?.length) return <div className="px-2 py-1.5 text-muted-foreground">Alchemica prices unavailable</div>;
  return (
    <>
      {data.map((p) => (
        <TokenRow key={p.symbol} symbol={p.symbol} usd={p.usd} change24h={p.change24h} />
      ))}
    </>
  );
}

/**
 * Compact GHST price chip for the header: spot price + 24h move. Renders
 * nothing until a price is known so the header never shows a $0.00 flash.
 * Hidden below `sm` (like the wallet chip's address) so the narrow header
 * doesn't overflow. Click expands a panel with alchemica + GLTR USD prices
 * and the /get-tokens (swap/bridge/buy) link.
 */
export function GhstTicker() {
  const { data } = useGhstTicker();
  if (!data || data.price <= 0) return null;
  const up = (data.change24h ?? 0) >= 0;
  return (
    <Popover className="relative hidden sm:block">
      <Popover.Button
        title="GHST price — click for alchemica prices"
        className="group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border/40 bg-background/60 text-[11px] hover:border-primary/40 hover:shadow-glow-sm transition-all"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-purple-500/10 text-[8px] font-black text-primary">G</span>
        <span className="font-semibold tabular-nums">${fmtUsd(data.price)}</span>
        {data.change24h != null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(data.change24h).toFixed(2)}%
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
      </Popover.Button>
      <Popover.Panel className="absolute right-0 mt-2 w-60 rounded-xl border bg-background shadow-xl p-1.5 text-xs z-50">
        {({ close }) => (
          <>
            <TokenRow symbol="GHST" usd={data.price} change24h={data.change24h} />
            <AlchemicaRows />
            <Link
              to="/get-tokens"
              onClick={() => close()}
              className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-border/40 px-2 py-1.5 font-medium text-primary hover:bg-primary/10"
            >
              Swap · bridge · buy GHST <ArrowUpRight className="w-3 h-3" />
            </Link>
          </>
        )}
      </Popover.Panel>
    </Popover>
  );
}
