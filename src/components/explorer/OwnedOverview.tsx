import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Coins, Sparkles, Wallet } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { qk } from "@/lib/queryKeys";
import { portfolioFloorGhst, weiToGhst } from "@/lib/portfolio";
import { fetchOwnedWearableBalances } from "@/lib/explorer/wearableHolders";
import { fetchBaazaarPrices } from "@/lib/baazaar";
import { useGhstUsd } from "@/hooks/useGhstUsd";
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

const fmtGhst = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Owned-asset overview shown on the Explorer's "Owned" scope: rough floor
 *  value, wallet token balances + the user's portals (open/summon/claim).
 *  Consolidates what used to live on the now-deprecated profile page. */
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

  // Cheapest active Baazaar gotchi listing (category 3) = the "floor".
  const { data: floorWei = null } = useQuery({
    queryKey: qk.gotchiFloor(),
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const q = `{ erc721Listings(first:1, where:{ category:3, cancelled:false, timePurchased:"0" }, orderBy:priceInWei, orderDirection:asc){ priceInWei } }`;
      const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      return j.data?.erc721Listings?.[0]?.priceInWei ?? null;
    },
  });

  // Owned + lent-out gotchis (lent ones sit in the lending escrow but remain yours).
  const { data: gotchiCount = 0 } = useQuery({
    queryKey: qk.ownedGotchiCount(address?.toLowerCase()),
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const q = `{ user(id:"${address!.toLowerCase()}"){ gotchisOwned(first:1000){ id } gotchisLentOut } }`;
      const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      const u = j.data?.user;
      return (u?.gotchisOwned?.length ?? 0) + (u?.gotchisLentOut?.length ?? 0);
    },
  });

  // Owned wearables valued at their cheapest open Baazaar listing (0 if unlisted).
  const { data: wearablesFloorGhst = 0 } = useQuery({
    queryKey: ["owned-wearables-value", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 300_000,
    queryFn: async (): Promise<number> => {
      const [balances, priceMap] = await Promise.all([
        fetchOwnedWearableBalances(address!),
        fetchBaazaarPrices(),
      ]);
      let sum = 0;
      for (const [wearableId, balance] of balances) {
        sum += balance * weiToGhst(priceMap[wearableId]?.minPriceWei ?? 0n);
      }
      return sum;
    },
  });

  const { data: ghstUsd = 0 } = useGhstUsd();
  const ghstWei = balances[0]?.bal ?? 0n;
  const totalGhst = portfolioFloorGhst({ gotchiCount, gotchiFloorWei: floorWei, ghstWei, wearablesFloorGhst });

  if (!isConnected) return null;

  return (
    <div className="px-2 md:px-4 pt-2 space-y-3">
      <div className="rounded-xl border border-border/40 bg-gradient-to-r from-primary/10 to-transparent p-3 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Floor value (rough)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{fmtGhst(totalGhst)}</span>
            <span className="text-sm text-muted-foreground">GHST</span>
            {ghstUsd > 0 && totalGhst > 0 && (
              <span className="text-sm text-emerald-500 font-medium">≈ ${fmtGhst(totalGhst * ghstUsd)}</span>
            )}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {gotchiCount} gotchi{gotchiCount === 1 ? "" : "s"} × {fmtGhst(weiToGhst(floorWei))} GHST floor + wallet GHST
          {wearablesFloorGhst > 0 && <> + wearables {fmtGhst(wearablesFloorGhst)} GHST</>}
        </div>
      </div>
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
