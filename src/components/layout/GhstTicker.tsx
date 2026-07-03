import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useGhstTicker } from "@/hooks/useGhstUsd";

/**
 * Compact GHST price chip for the footer: spot price + 24h move, linking to
 * /get-tokens (swap/bridge/buy). Renders nothing until a price is known so
 * the footer never shows a $0.00 flash.
 */
export function GhstTicker() {
  const { data } = useGhstTicker();
  if (!data || data.price <= 0) return null;
  const up = (data.change24h ?? 0) >= 0;
  return (
    <Link
      to="/get-tokens"
      title="GHST on Base — swap, bridge or buy"
      className="group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border/40 bg-background/60 text-[11px] hover:border-primary/40 hover:shadow-glow-sm transition-all"
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-purple-500/10 text-[8px] font-black text-primary">G</span>
      <span className="font-semibold tabular-nums">
        ${data.price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
      </span>
      {data.change24h != null && (
        <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(data.change24h).toFixed(2)}%
        </span>
      )}
    </Link>
  );
}
