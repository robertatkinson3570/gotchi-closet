import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { Loader2, X } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  GBM_BAAZAAR_SUBGRAPH_URL,
  GBM_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  MAX_UINT256,
  AAVEGOTCHI_DIAMOND_BASE,
  REALM_DIAMOND_BASE,
  INSTALLATION_DIAMOND_BASE,
  TILE_DIAMOND_BASE,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { AssetImage, itemImageCandidates, installationImageCandidates, tileImageCandidates, parcelImageCandidates } from "./AssetImage";
import { GotchiSvgById, FakeGotchiImage } from "./GotchiSvgById";
import { Gavel } from "lucide-react";

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
  contract: string;
  highestBid: string;
  highestBidder: string;
  seller: string;
  totalBids: number;
  startsAt: number;
  endsAt: number;
};

async function fetchAuctions(): Promise<Auction[]> {
  const now = Math.floor(Date.now() / 1000);
  const query = `query Live($now: BigInt!){ auctions(first: 200, where: { cancelled: false, claimed: false, endsAt_gt: $now }, orderBy: endsAt, orderDirection: asc){ id type tokenId contractAddress highestBid highestBidder seller totalBids startsAt endsAt } }`;
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
    contract: (a.contractAddress ?? "").toLowerCase(),
    highestBid: a.highestBid ?? "0",
    highestBidder: (a.highestBidder ?? "").toLowerCase(),
    seller: (a.seller ?? "").toLowerCase(),
    totalBids: Number(a.totalBids) || 0,
    startsAt: Number(a.startsAt),
    endsAt: Number(a.endsAt),
  }));
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const short = (a: string) => (a && a !== ZERO_ADDR ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

// Best-effort human label for what's being auctioned, from contract + token type.
function assetLabel(a: Auction): string {
  const c = a.contract;
  if (c === REALM_DIAMOND_BASE.toLowerCase()) return "Parcel";
  if (c === INSTALLATION_DIAMOND_BASE.toLowerCase()) return "Installation";
  if (c === TILE_DIAMOND_BASE.toLowerCase()) return "Tile";
  if (c === AAVEGOTCHI_DIAMOND_BASE.toLowerCase()) return a.type === "erc1155" ? "Wearable / Item" : "Aavegotchi";
  return "NFT";
}

// Auction items span many contracts; render the known ones, fall back for the
// rest (exotic NFTs whose art lives in off-chain metadata we can't derive).
function AuctionItemImage({ a }: { a: Auction }) {
  const c = a.contract;
  const cls = "max-h-full max-w-full object-contain";
  if (c === REALM_DIAMOND_BASE.toLowerCase()) return <AssetImage candidates={parcelImageCandidates(a.tokenId)} alt={`#${a.tokenId}`} className="max-h-full max-w-full object-contain rounded" />;
  if (c === INSTALLATION_DIAMOND_BASE.toLowerCase()) return <AssetImage candidates={installationImageCandidates(a.tokenId)} alt={`#${a.tokenId}`} className={cls} />;
  if (c === TILE_DIAMOND_BASE.toLowerCase()) return <AssetImage candidates={tileImageCandidates(a.tokenId)} alt={`#${a.tokenId}`} className={cls} />;
  if (c === AAVEGOTCHI_DIAMOND_BASE.toLowerCase()) {
    return a.type === "erc1155"
      ? <AssetImage candidates={itemImageCandidates(a.tokenId)} alt={`#${a.tokenId}`} className={cls} />
      : <GotchiSvgById id={a.tokenId} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" />;
  }
  return <FakeGotchiImage id={a.tokenId} className="max-h-full max-w-full object-contain" fallback={<Gavel className="w-7 h-7 text-primary/60" />} />;
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

/** Live GBM auctions with inline bidding (GHST approve + commitBid). */
export function AuctionGrid() {
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

  const [detail, setDetail] = useState<Auction | null>(null);
  const [bidValue, setBidValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.gbmAuctions(), queryFn: fetchAuctions, staleTime: 30_000 });
  const rows = useMemo(() => (data ?? []).filter((a) => a.startsAt <= nowSec), [data, nowSec]);

  const placeBid = async (a: Auction) => {
    if (!isConnected || !address || !publicClient) return toast({ title: "Connect wallet", variant: "destructive" });
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const amount = Number(bidValue);
    if (!Number.isFinite(amount) || amount <= 0) return toast({ title: "Enter a bid amount", variant: "destructive" });
    const bidWei = BigInt(Math.floor(amount * 1e18));
    setBusyId(a.id);
    try {
      const allowance = (await publicClient.readContract({ address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "allowance", args: [address, GBM_DIAMOND_BASE] })) as bigint;
      if (allowance < bidWei) {
        const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "approve", args: [GBM_DIAMOND_BASE, MAX_UINT256] });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_ABI, functionName: "commitBid", args: [BigInt(a.id), bidWei, BigInt(a.highestBid || "0"), "0x"] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Bid placed", description: `Bid ${amount} GHST on auction #${a.id}.` });
      setBidValue("");
      refetch();
    } catch (e) {
      toast({ title: "Bid failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (rows.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">No live auctions right now.</div>;

  const live = detail ? rows.find((r) => r.id === detail.id) ?? detail : null;

  return (
    <>
      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {rows.map((a) => {
          const left = a.endsAt - nowSec;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => { setDetail(a); setBidValue(""); }}
              className="text-left rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5 hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 transition-all"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">#{a.tokenId}</span>
                <span className="uppercase text-[9px] bg-muted/50 px-1 rounded">{a.type}</span>
              </div>
              <div className="h-24 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
                <AuctionItemImage a={a} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Top bid <span className="text-emerald-500 font-semibold">{ghst(a.highestBid)} GHST</span>
              </div>
              <div className="text-[11px] text-foreground">Ends in {countdown(left)}</div>
            </button>
          );
        })}
      </div>

      {live && (
        <AuctionDetailModal
          a={live}
          nowSec={nowSec}
          busy={busyId === live.id}
          bidValue={bidValue}
          setBidValue={setBidValue}
          onBid={() => placeBid(live)}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function AuctionDetailModal({
  a, nowSec, busy, bidValue, setBidValue, onBid, onClose,
}: {
  a: Auction; nowSec: number; busy: boolean; bidValue: string;
  setBidValue: (v: string) => void; onBid: () => void; onClose: () => void;
}) {
  const left = a.endsAt - nowSec;
  const ownerUrl = (addr: string) => `/explorer?owner=${addr}`;
  const Addr = ({ label, addr }: { label: string; addr: string }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {addr && addr !== ZERO_ADDR ? (
        <Link to={ownerUrl(addr)} onClick={onClose} className="font-mono text-xs text-primary hover:underline" title="View this owner's gotchis">
          {short(addr)}
        </Link>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">—</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-[min(560px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold">{assetLabel(a)} #{a.tokenId} · Auction</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-4">
            <div className="w-40 h-40 shrink-0 flex items-center justify-center rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
              <AuctionItemImage a={a} />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top bid</div>
                <div className="text-lg font-bold text-emerald-500">{ghst(a.highestBid)} GHST</div>
                <div className="text-[11px] text-muted-foreground">{a.totalBids} bid{a.totalBids === 1 ? "" : "s"}</div>
              </div>
              <div className="text-sm">
                <span className={left <= 3600 ? "text-red-500 font-semibold" : "text-foreground"}>
                  {left <= 0 ? "Ended" : `Ends in ${countdown(left)}`}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Addr label="Seller" addr={a.seller} />
            <Addr label="Highest bidder" addr={a.highestBidder} />
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1.5"><Gavel className="w-4 h-4 text-primary" /> Place a bid</div>
            <p className="text-[11px] text-muted-foreground">Bid is signed in your wallet (GHST approval + commitBid on the GBM diamond). Must exceed the current top bid.</p>
            <div className="flex items-center gap-2">
              <input autoFocus type="number" value={bidValue} onChange={(e) => setBidValue(e.target.value)} placeholder="Amount (GHST)" className="h-10 flex-1 min-w-0 rounded border border-border bg-background px-3 text-sm" />
              <button disabled={busy || left <= 0} onClick={onBid} className="h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Bidding…</> : "Place bid"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
