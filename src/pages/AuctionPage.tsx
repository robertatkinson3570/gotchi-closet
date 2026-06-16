import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Gavel, Loader2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  GBM_BAAZAAR_SUBGRAPH_URL,
  GBM_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

const GBM_ABI = [
  {
    name: "commitBid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_auctionId", type: "uint256" },
      { name: "_bidAmount", type: "uint256" },
      { name: "_highestBid", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

type Auction = {
  id: string;
  type: string;
  tokenId: string;
  highestBid: string;
  highestBidder: string;
  startsAt: number;
  endsAt: number;
  cancelled: boolean;
  claimed: boolean;
};

async function fetchAuctions(): Promise<Auction[]> {
  // Only auctions that haven't ended yet (ordered soonest-ending). Querying
  // without this returned the oldest/long-ended auctions first and live ones
  // fell off the page — hence "loads nothing".
  const now = Math.floor(Date.now() / 1000);
  const query = `
    query LiveAuctions($now: BigInt!) {
      auctions(first: 200, where: { cancelled: false, claimed: false, endsAt_gt: $now }, orderBy: endsAt, orderDirection: asc) {
        id type tokenId highestBid highestBidder startsAt endsAt cancelled claimed
      }
    }`;
  const res = await fetch(GBM_BAAZAAR_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { now: String(now) } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return (json.data?.auctions ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    tokenId: a.tokenId,
    highestBid: a.highestBid ?? "0",
    highestBidder: a.highestBidder ?? "",
    startsAt: Number(a.startsAt),
    endsAt: Number(a.endsAt),
    cancelled: a.cancelled,
    claimed: a.claimed,
  }));
}

const ghst = (wei: string) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });
function countdown(sec: number): string {
  if (sec <= 0) return "ended";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AuctionPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const [onlyLive, setOnlyLive] = useState(true);
  const [bidId, setBidId] = useState<string | null>(null);
  const [bidValue, setBidValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gbm-auctions"],
    queryFn: fetchAuctions,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return onlyLive ? all.filter((a) => a.endsAt > nowSec && a.startsAt <= nowSec) : all;
  }, [data, onlyLive, nowSec]);

  const placeBid = async (a: Auction) => {
    if (!isConnected || !address || !publicClient) {
      toast({ title: "Connect wallet", description: "Connect to bid.", variant: "destructive" });
      return;
    }
    if (!isOnBase) {
      toast({ title: "Wrong network", description: "Switch to Base.", variant: "destructive" });
      return;
    }
    const amount = Number(bidValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a bid", description: "Bid amount in GHST.", variant: "destructive" });
      return;
    }
    const bidWei = BigInt(Math.floor(amount * 1e18));
    setBusyId(a.id);
    try {
      const allowance = (await publicClient.readContract({
        address: GHST_TOKEN_BASE,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, GBM_DIAMOND_BASE],
      })) as bigint;
      if (allowance < bidWei) {
        const ah = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: GHST_TOKEN_BASE,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [GBM_DIAMOND_BASE, MAX_UINT256],
        });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: GBM_DIAMOND_BASE,
        abi: GBM_ABI,
        functionName: "commitBid",
        args: [BigInt(a.id), bidWei, BigInt(a.highestBid || "0"), "0x"],
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Bid placed", description: `Bid ${amount} GHST on auction #${a.id}.` });
      setBidId(null);
      setBidValue("");
      refetch();
    } catch (e) {
      toast({ title: "Bid failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Auctions — GotchiCloset" description="Live GBM auctions on the Aavegotchi Baazaar." canonical={siteUrl("/auction")} />
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Gavel className="w-6 h-6 text-primary" /> Auctions
        </h1>
        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} /> Live only
        </label>
      </div>

      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No {onlyLive ? "live " : ""}auctions.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {rows.map((a) => {
            const left = a.endsAt - nowSec;
            const ended = left <= 0;
            const busy = busyId === a.id;
            return (
              <div key={a.id} className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">#{a.tokenId}</span>
                  <span className="uppercase text-[9px] bg-muted/50 px-1 rounded">{a.type}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Top bid <span className="text-emerald-500 font-semibold">{ghst(a.highestBid)} GHST</span>
                </div>
                <div className={`text-[11px] ${ended ? "text-muted-foreground" : "text-foreground"}`}>
                  {ended ? "Ended" : `Ends in ${countdown(left)}`}
                </div>
                {!ended &&
                  (bidId === a.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        value={bidValue}
                        onChange={(e) => setBidValue(e.target.value)}
                        placeholder="GHST"
                        className="h-7 w-full min-w-0 rounded border border-border bg-background px-1.5 text-xs"
                      />
                      <button
                        disabled={busy}
                        onClick={() => placeBid(a)}
                        className="h-7 px-2 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50 shrink-0"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Bid"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setBidId(a.id);
                        setBidValue("");
                      }}
                      className="h-7 w-full rounded-md border border-primary/40 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20"
                    >
                      Place bid
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
