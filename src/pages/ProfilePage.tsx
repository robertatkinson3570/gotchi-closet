import { useMemo, useState } from "react";
import { useAccount, useReadContracts, usePublicClient, useWriteContract } from "wagmi";
import { Link } from "react-router-dom";
import { User, Coins, MapPin, Activity as ActivityIcon, Loader2, Tag, X } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { GotchiManageModal, type ManageGotchi } from "@/components/explorer/GotchiActionsPanel";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useOwnerListings } from "@/lib/hooks/useOwnerListings";
import { PortalsPanel } from "@/components/explorer/PortalsPanel";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI, AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

const ADD_LISTING_ABI = [
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
] as const;

const TOKENS = [
  { symbol: "GHST", address: GHST_TOKEN_BASE, color: "text-purple-400" },
  ...ALCHEMICA_TOKENS_BASE.map((t, i) => ({ symbol: t.symbol, address: t.address, color: ["text-pink-400", "text-sky-400", "text-emerald-400", "text-amber-400"][i] })),
];

const fmt = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : v < 1000 ? 1 : 0 });
};

const fmtGhst = (wei: string) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 3 : v < 1000 ? 1 : 0 });
};

type Filter = "all" | "lent" | "available";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { gotchis, isLoading } = useGotchisByOwner(address?.toLowerCase() ?? "");
  const { data: listingPrices } = useOwnerListings(address?.toLowerCase());
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"brs" | "kinship" | "level" | "id">("brs");
  const [manage, setManage] = useState<ManageGotchi | null>(null);
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [listing, setListing] = useState<{ done: number; total: number } | null>(null);

  const toggleSel = (gid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  // Bulk-list selected gotchis on the Baazaar (one wallet signature each — the
  // diamond has no batch add). Skips failures so one bad item won't strand the
  // rest.
  const doBulkList = async () => {
    const price = Number(bulkPrice);
    if (!publicClient || !(price > 0) || selected.size === 0) return;
    const wei = BigInt(Math.floor(price * 1e18));
    const ids = [...selected];
    setListing({ done: 0, total: ids.length });
    let ok = 0;
    let failed = 0;
    for (const gid of ids) {
      try {
        const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ADD_LISTING_ABI, functionName: "addERC721Listing", args: [AAVEGOTCHI_DIAMOND_BASE, BigInt(gid), wei] });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        ok++;
      } catch (e) {
        failed++;
        if (failed === 1) toast({ title: "A listing failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
      }
      setListing((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    toast({ title: "Bulk list complete", description: `Listed ${ok}/${ids.length}${failed ? `, ${failed} failed` : ""} at ${price} GHST.` });
    setListing(null);
    setSelected(new Set());
    setSelectMode(false);
  };

  const { data: balData } = useReadContracts({
    contracts: TOKENS.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [address as `0x${string}`], chainId: BASE_CHAIN_ID })),
    query: { enabled: !!address },
  });

  const balances = useMemo(
    () => TOKENS.map((t, i) => ({ ...t, bal: balData?.[i]?.status === "success" ? (balData[i].result as bigint) : 0n })),
    [balData]
  );

  const isLent = (g: any) => Number(g.lending ?? 0) > 0;
  const brs = (g: any) => Number(g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0);
  const filtered = useMemo(() => {
    let list = [...(gotchis ?? [])];
    if (filter === "lent") list = list.filter(isLent);
    else if (filter === "available") list = list.filter((g) => !isLent(g));
    list.sort((a, b) => {
      if (sort === "brs") return brs(b) - brs(a);
      if (sort === "kinship") return Number(b.kinship ?? 0) - Number(a.kinship ?? 0);
      if (sort === "level") return Number(b.level ?? 0) - Number(a.level ?? 0);
      return Number(a.gotchiId ?? a.id) - Number(b.gotchiId ?? b.id);
    });
    return list;
  }, [gotchis, filter, sort]);

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

      <PortalsPanel />

      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Gotchis ({(gotchis ?? []).length})</div>
        <div className="flex items-center gap-1">
          {(["all", "available", "lent"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium border capitalize ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
              {f === "lent" ? "Lent out" : f}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] font-medium text-muted-foreground"
            title="Sort gotchis"
          >
            <option value="brs">Highest BRS</option>
            <option value="kinship">Most kinship</option>
            <option value="level">Highest level</option>
            <option value="id">Token ID</option>
          </select>
          <button
            onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
            className={`h-7 px-2.5 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 ${selectMode ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"}`}
          >
            <Tag className="w-3 h-3" /> {selectMode ? "Cancel" : "List for sale"}
          </button>
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
                onClick={() =>
                  selectMode
                    ? toggleSel(gid)
                    : setManage({ gotchiId: gid, name: g.name, hauntId: g.hauntId, collateral: g.collateral, numericTraits: g.numericTraits, equippedWearables: g.equippedWearables, listed: !!listingPrices?.[gid], locked: isLent(g), lockReason: isLent(g) ? "Rented out" : undefined })
                }
                title={selectMode ? "Select to list" : "Manage gotchi"}
                className={`text-left rounded-lg border bg-background/60 p-1.5 hover:-translate-y-0.5 transition-all ${
                  selectMode && selected.has(gid) ? "border-primary ring-2 ring-primary/50" : "border-border/40 hover:ring-1 hover:ring-primary/40"
                }`}
              >
                <span className="block aspect-square rounded bg-muted/30 overflow-hidden">
                  <GotchiSvg gotchiId={gid} hauntId={g.hauntId} collateral={g.collateral} numericTraits={g.numericTraits} equippedWearables={g.equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
                </span>
                <div className="mt-1 text-[10px] font-medium truncate">{g.name || "Unnamed"}</div>
                <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>#{gid}</span>
                  {isLent(g) && <span className="text-amber-500">Lent</span>}
                </div>
                {listingPrices?.[gid] && (
                  <div className="mt-0.5 flex items-center gap-0.5 text-[9px] font-semibold text-emerald-500" title="Listed for sale">
                    <Tag className="w-2.5 h-2.5" /> {fmtGhst(listingPrices[gid])} GHST
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {manage && <GotchiManageModal gotchi={manage} onClose={() => setManage(null)} />}

      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <input
            type="number"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            placeholder="Price each (GHST)"
            className="h-8 w-36 rounded border border-border bg-background px-2 text-xs"
          />
          <button
            disabled={!!listing || !(Number(bulkPrice) > 0)}
            onClick={doBulkList}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            {listing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Listing {listing.done}/{listing.total}…</>
            ) : (
              <><Tag className="w-4 h-4" /> List {selected.size}</>
            )}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
