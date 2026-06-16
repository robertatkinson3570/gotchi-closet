import { useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { Link } from "react-router-dom";
import { User, Coins, MapPin, Activity as ActivityIcon, Loader2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { GotchiManageModal, type ManageGotchi } from "@/components/explorer/GotchiActionsPanel";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";

const TOKENS = [
  { symbol: "GHST", address: GHST_TOKEN_BASE, color: "text-purple-400" },
  ...ALCHEMICA_TOKENS_BASE.map((t, i) => ({ symbol: t.symbol, address: t.address, color: ["text-pink-400", "text-sky-400", "text-emerald-400", "text-amber-400"][i] })),
];

const fmt = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : v < 1000 ? 1 : 0 });
};

type Filter = "all" | "lent" | "available";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { gotchis, isLoading } = useGotchisByOwner(address?.toLowerCase() ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const [manage, setManage] = useState<ManageGotchi | null>(null);

  const { data: balData } = useReadContracts({
    contracts: TOKENS.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [address as `0x${string}`], chainId: BASE_CHAIN_ID })),
    query: { enabled: !!address },
  });

  const balances = useMemo(
    () => TOKENS.map((t, i) => ({ ...t, bal: balData?.[i]?.status === "success" ? (balData[i].result as bigint) : 0n })),
    [balData]
  );

  const isLent = (g: any) => Number(g.lending ?? 0) > 0;
  const filtered = useMemo(() => {
    const list = gotchis ?? [];
    if (filter === "lent") return list.filter(isLent);
    if (filter === "available") return list.filter((g) => !isLent(g));
    return list;
  }, [gotchis, filter]);

  if (!isConnected) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <Seo title="Profile — GotchiCloset" description="Your Aavegotchi profile, tokens and inventory." canonical={siteUrl("/me")} />
        <User className="w-8 h-8 mx-auto mb-2 text-primary" />
        <p className="text-sm font-medium mb-3">Connect a wallet to view your profile</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-6">
      <Seo title="Profile — GotchiCloset" description="Your Aavegotchi profile, tokens and inventory." canonical={siteUrl("/me")} />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> My Profile
        </h1>
        {address && <span className="text-xs text-muted-foreground font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>}
      </div>

      <div className="mb-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Coins className="w-4 h-4" /> Tokens</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {balances.map((t) => (
            <div key={t.symbol} className="rounded-lg border border-border/40 bg-background/60 p-3">
              <div className={`text-[11px] font-semibold ${t.color}`}>{t.symbol}</div>
              <div className="text-lg font-bold tabular-nums">{fmt(t.bal)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link to="/lending/me" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-xs font-medium hover:bg-muted/50"><Coins className="w-3.5 h-3.5" /> My lendings</Link>
        <Link to="/lending/lands" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-xs font-medium hover:bg-muted/50"><MapPin className="w-3.5 h-3.5" /> My land</Link>
        <Link to="/activity" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-xs font-medium hover:bg-muted/50"><ActivityIcon className="w-3.5 h-3.5" /> Activity</Link>
      </div>

      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Gotchis ({(gotchis ?? []).length})</div>
        <div className="flex items-center gap-1">
          {(["all", "available", "lent"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium border capitalize ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
              {f === "lent" ? "Lent out" : f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No gotchis{filter !== "all" ? ` (${filter})` : ""}.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {filtered.map((g: any) => {
            const gid = String(g.gotchiId ?? g.id);
            return (
              <button
                key={gid}
                type="button"
                onClick={() => setManage({ gotchiId: gid, name: g.name, hauntId: g.hauntId, collateral: g.collateral, numericTraits: g.numericTraits, equippedWearables: g.equippedWearables })}
                title="Manage gotchi"
                className="text-left rounded-lg border border-border/40 bg-background/60 p-1.5 hover:ring-1 hover:ring-primary/40 hover:-translate-y-0.5 transition-all"
              >
                <span className="block aspect-square rounded bg-muted/30 overflow-hidden">
                  <GotchiSvg gotchiId={gid} hauntId={g.hauntId} collateral={g.collateral} numericTraits={g.numericTraits} equippedWearables={g.equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
                </span>
                <div className="mt-1 text-[10px] font-medium truncate">{g.name || "Unnamed"}</div>
                <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>#{gid}</span>
                  {isLent(g) && <span className="text-amber-500">Lent</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {manage && <GotchiManageModal gotchi={manage} onClose={() => setManage(null)} />}
    </div>
  );
}
