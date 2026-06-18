import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContracts } from "wagmi";
import { Coins, Sparkles } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";
import { PortalsPanel } from "./PortalsPanel";
import { PetOperatorControl } from "./PetOperatorControl";

const TOKENS = [
  { symbol: "GHST", address: GHST_TOKEN_BASE, color: "text-purple-400" },
  ...ALCHEMICA_TOKENS_BASE.map((t, i) => ({ symbol: t.symbol, address: t.address, color: ["text-pink-400", "text-sky-400", "text-emerald-400", "text-amber-400"][i] })),
];

const fmt = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : v < 1000 ? 1 : 0 });
};

/** Owned-asset overview shown on the Explorer's "Owned" scope: wallet token
 *  balances + the user's portals (open/summon/claim). Consolidates what used to
 *  live on the now-deprecated profile page. */
export function OwnedOverview() {
  const { address, isConnected } = useAccount();
  const { data: balData } = useReadContracts({
    contracts: TOKENS.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [address as `0x${string}`], chainId: BASE_CHAIN_ID })),
    query: { enabled: !!address },
  });
  const balances = useMemo(
    () => TOKENS.map((t, i) => ({ ...t, bal: balData?.[i]?.status === "success" ? (balData[i].result as bigint) : 0n })),
    [balData]
  );

  if (!isConnected) return null;

  return (
    <div className="px-2 md:px-4 pt-2 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5"><Coins className="w-4 h-4" /> Your tokens</div>
          <Link to="/get-tokens" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Sparkles className="w-3.5 h-3.5" /> Get GHST</Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {balances.map((t) => (
            <div key={t.symbol} className="rounded-lg border border-border/40 bg-background/60 p-2.5">
              <div className={`text-[11px] font-semibold ${t.color}`}>{t.symbol}</div>
              <div className="text-base font-bold tabular-nums">{fmt(t.bal)}</div>
            </div>
          ))}
        </div>
      </div>
      <PortalsPanel />
      <PetOperatorControl />
    </div>
  );
}
