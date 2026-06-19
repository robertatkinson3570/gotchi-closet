import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { shortAddress as short } from "@/lib/format";
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
import { CORE_SUBGRAPH } from "@/lib/subgraph";
import { GotchiExplorerCard } from "./GotchiExplorerCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { ExplorerGotchi } from "@/lib/explorer/types";

// The GBM diamond on Base exposes commitBid with selector 0xd2f699fc:
// commitBid(auctionId, bidAmount, lastHighestBid, tokenContract, tokenId, amount, signature).
// The 4-arg variant our app used previously does not exist on this diamond
// (reverts "Diamond: Function does not exist"). The signature arg accepts an
// empty "0x" (verified on-chain: an empty-sig call passes validation and only
// reverts on business logic such as SelfOutbidUnavailable).
const GBM_ABI = [
  {
    name: "commitBid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_auctionId", type: "uint256" },
      { name: "_bidAmount", type: "uint256" },
      { name: "_highestBid", type: "uint256" },
      { name: "_tokenContract", type: "address" },
      { name: "_tokenId", type: "uint256" },
      { name: "_amount", type: "uint256" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Settle an ended auction: the seller gets proceeds, the winning bidder gets
  // the asset. Either party calls claim(auctionId) once endsAt has passed.
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionId", type: "uint256" }], outputs: [] },
  // Instantly buy an auction that has a buy-it-now price set.
  { name: "buyNow", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_auctionId", type: "uint256" }], outputs: [] },
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
  quantity: string;
  startsAt: number;
  endsAt: number;
  buyNowPrice: string;
  stepMin: string;
  bidDecimals: string;
  startBidPrice: string;
  hammerTimeDuration: number;
  endsAtOriginal: number;
};

async function fetchAuctions(): Promise<Auction[]> {
  const now = Math.floor(Date.now() / 1000);
  const query = `query Live($now: BigInt!){ auctions(first: 200, where: { cancelled: false, claimed: false, endsAt_gt: $now }, orderBy: endsAt, orderDirection: asc){ id type tokenId contractAddress highestBid highestBidder seller totalBids quantity startsAt endsAt buyNowPrice stepMin bidDecimals startBidPrice hammerTimeDuration endsAtOriginal } }`;
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
    quantity: a.quantity ?? "1",
    startsAt: Number(a.startsAt),
    endsAt: Number(a.endsAt),
    buyNowPrice: a.buyNowPrice ?? "0",
    stepMin: a.stepMin ?? "0",
    bidDecimals: a.bidDecimals ?? "0",
    startBidPrice: a.startBidPrice ?? "0",
    hammerTimeDuration: Number(a.hammerTimeDuration) || 0,
    endsAtOriginal: Number(a.endsAtOriginal) || Number(a.endsAt),
  }));
}

type Bid = { bidder: string; amount: string; bidTime: number; outbid: boolean };
async function fetchBids(auctionId: string): Promise<Bid[]> {
  const q = `{ bids(first: 30, where: { auction: "${auctionId}" }, orderBy: bidTime, orderDirection: desc){ bidder amount bidTime outbid } }`;
  const res = await fetch(GBM_BAAZAAR_SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const json = await res.json();
  if (json.errors) return [];
  return (json.data?.bids ?? []).map((b: any) => ({ bidder: (b.bidder ?? "").toLowerCase(), amount: b.amount ?? "0", bidTime: Number(b.bidTime), outbid: !!b.outbid }));
}

// Ended, unclaimed auctions where the connected user is the seller (claim =
// collect proceeds + unsold asset) or the highest bidder (claim = receive the
// won asset). Two queries (seller / bidder) merged — avoids relying on `or:`.
async function fetchClaimable(address: string): Promise<Auction[]> {
  const now = Math.floor(Date.now() / 1000);
  const a = address.toLowerCase();
  const fields = `id type tokenId contractAddress highestBid highestBidder seller totalBids quantity startsAt endsAt`;
  const q = `query Claimable($now: BigInt!, $a: String!){
    asSeller: auctions(first: 100, where: { cancelled: false, claimed: false, endsAt_lt: $now, seller: $a }, orderBy: endsAt, orderDirection: desc){ ${fields} }
    asBidder: auctions(first: 100, where: { cancelled: false, claimed: false, endsAt_lt: $now, highestBidder: $a }, orderBy: endsAt, orderDirection: desc){ ${fields} }
  }`;
  const res = await fetch(GBM_BAAZAAR_SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { now: String(now), a } }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  const map = (x: any): Auction => ({ id: x.id, type: x.type, tokenId: x.tokenId, contract: (x.contractAddress ?? "").toLowerCase(), highestBid: x.highestBid ?? "0", highestBidder: (x.highestBidder ?? "").toLowerCase(), seller: (x.seller ?? "").toLowerCase(), totalBids: Number(x.totalBids) || 0, quantity: x.quantity ?? "1", startsAt: Number(x.startsAt), endsAt: Number(x.endsAt), buyNowPrice: x.buyNowPrice ?? "0", stepMin: "0", bidDecimals: "0", startBidPrice: "0", hammerTimeDuration: 0, endsAtOriginal: Number(x.endsAt) });
  const seen = new Set<string>();
  const out: Auction[] = [];
  for (const x of [...(json.data?.asSeller ?? []), ...(json.data?.asBidder ?? [])]) {
    if (seen.has(x.id)) continue; seen.add(x.id); out.push(map(x));
  }
  return out;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

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

const AUCTION_TRAITS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];
type GInfo = { name: string; brs: number; kin: number; lvl: number; haunt: number; traits: number[] };

// Batch-fetch gotchi stats for auction cards (one query for all gotchi auctions).
async function fetchGotchiBatch(ids: string[]): Promise<Record<string, GInfo>> {
  if (ids.length === 0) return {};
  const idList = ids.map((i) => `"${i}"`).join(",");
  const q = `{ aavegotchis(first:1000, where:{ id_in:[${idList}] }){ id name baseRarityScore modifiedRarityScore withSetsRarityScore kinship level hauntId numericTraits modifiedNumericTraits withSetsNumericTraits } }`;
  const res = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const json = await res.json();
  const out: Record<string, GInfo> = {};
  for (const g of json.data?.aavegotchis ?? []) {
    out[g.id] = {
      name: g.name || "Unnamed",
      brs: Number(g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0),
      kin: Number(g.kinship) || 0,
      lvl: Number(g.level) || 0,
      haunt: Number(g.hauntId) || 1,
      traits: (g.withSetsNumericTraits ?? g.modifiedNumericTraits ?? g.numericTraits ?? []).map((n: any) => Number(n)),
    };
  }
  return out;
}

/** Live GBM auctions with inline bidding (GHST approve + commitBid). */
export function AuctionGrid() {
  return (
    <ErrorBoundary label="The auctions view hit a snag. Reload it below.">
      <AuctionGridInner />
    </ErrorBoundary>
  );
}

function AuctionGridInner() {
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

  // Batch-fetch stats for all gotchi auctions so cards are scannable without
  // opening each one.
  const gotchiIds = useMemo(
    () => rows.filter((a) => a.contract === AAVEGOTCHI_DIAMOND_BASE.toLowerCase() && a.type === "erc721").map((a) => a.tokenId),
    [rows]
  );
  const { data: gotchiInfo } = useQuery({
    queryKey: ["auction-gotchi-batch", gotchiIds.join(",")],
    enabled: gotchiIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchGotchiBatch(gotchiIds),
  });

  const { data: claimable, refetch: refetchClaim } = useQuery({
    queryKey: ["gbm-claimable", address?.toLowerCase()],
    enabled: isConnected && !!address,
    staleTime: 30_000,
    queryFn: () => fetchClaimable(address!),
  });

  const doClaim = async (a: Auction) => {
    if (!isConnected || !address || !publicClient) return toast({ title: "Connect wallet", variant: "destructive" });
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusyId(a.id);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_ABI, functionName: "claim", args: [BigInt(a.id)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      const won = a.highestBidder === address.toLowerCase();
      toast({ title: "Auction claimed", description: won ? `Claimed your won ${assetLabel(a)} #${a.tokenId}.` : `Settled auction #${a.id}.` });
      refetchClaim();
    } catch (e) {
      toast({ title: "Claim failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

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
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_ABI, functionName: "commitBid", args: [BigInt(a.id), bidWei, BigInt(a.highestBid || "0"), a.contract as `0x${string}`, BigInt(a.tokenId), BigInt(a.quantity || "1"), "0x"] });
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

  const buyItNow = async (a: Auction) => {
    if (!isConnected || !address || !publicClient) return toast({ title: "Connect wallet", variant: "destructive" });
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const priceWei = BigInt(a.buyNowPrice || "0");
    if (priceWei <= 0n) return;
    setBusyId(a.id);
    try {
      const allowance = (await publicClient.readContract({ address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "allowance", args: [address, GBM_DIAMOND_BASE] })) as bigint;
      if (allowance < priceWei) {
        const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GHST_TOKEN_BASE, abi: ERC20_ABI, functionName: "approve", args: [GBM_DIAMOND_BASE, MAX_UINT256] });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: GBM_ABI, functionName: "buyNow", args: [BigInt(a.id)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Bought now", description: `Bought ${assetLabel(a)} #${a.tokenId} for ${ghst(a.buyNowPrice)} GHST.` });
      setDetail(null);
      refetch();
    } catch (e) {
      toast({ title: "Buy now failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const live = detail ? rows.find((r) => r.id === detail.id) ?? detail : null;
  const claimRows = claimable ?? [];

  if (rows.length === 0 && claimRows.length === 0)
    return <div className="text-center py-12 text-muted-foreground text-sm">No live auctions right now.</div>;

  return (
    <>
      {claimRows.length > 0 && (
        <div className="p-2">
          <div className="flex items-center gap-1.5 px-1 pb-1.5 text-sm font-semibold text-amber-500"><Gavel className="w-4 h-4" /> Ready to claim ({claimRows.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {claimRows.map((a) => {
              const won = a.highestBidder === (address?.toLowerCase() ?? "");
              return (
                <div key={a.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs"><span className="font-mono text-muted-foreground">#{a.tokenId}</span><span className="uppercase text-[9px] bg-muted/50 px-1 rounded">{a.type}</span></div>
                  <div className="h-20 flex items-center justify-center rounded-lg overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40"><AuctionItemImage a={a} /></div>
                  <div className="text-[10px] text-muted-foreground">{won ? "You won this" : a.totalBids > 0 ? `Sold · ${ghst(a.highestBid)} GHST` : "Ended · no bids"}</div>
                  <button disabled={busyId === a.id} onClick={() => doClaim(a)} className="h-7 w-full rounded bg-amber-500 text-black text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1">{busyId === a.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Claiming…</> : "Claim"}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No live auctions right now.</div>
      ) : (
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
              {(() => {
                const g = gotchiInfo?.[a.tokenId];
                if (!g) return null;
                return (
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-semibold truncate" title={g.name}>{g.name}</div>
                    <div className="text-[9px] text-muted-foreground">RAR {g.brs} · KIN {g.kin} · L{g.lvl} · H{g.haunt}</div>
                    <div className="grid grid-cols-6 gap-px text-center text-[8px] leading-tight">
                      {AUCTION_TRAITS.map((t, i) => (
                        <div key={t} className="rounded bg-muted/40 py-0.5">
                          <div className="text-muted-foreground">{t}</div>
                          <div className="font-semibold tabular-nums">{g.traits[i]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="text-[11px] text-muted-foreground">
                Top bid <span className="text-emerald-500 font-semibold">{ghst(a.highestBid)} GHST</span>
              </div>
              <div className="text-[11px] text-foreground">Ends in {countdown(left)}</div>
            </button>
          );
        })}
      </div>
      )}

      {live && (
        <AuctionDetailModal
          a={live}
          nowSec={nowSec}
          busy={busyId === live.id}
          bidValue={bidValue}
          setBidValue={setBidValue}
          onBid={() => placeBid(live)}
          onBuyNow={() => buyItNow(live)}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function AuctionDetailModal({
  a, nowSec, busy, bidValue, setBidValue, onBid, onBuyNow, onClose,
}: {
  a: Auction; nowSec: number; busy: boolean; bidValue: string;
  setBidValue: (v: string) => void; onBid: () => void; onBuyNow: () => void; onClose: () => void;
}) {
  const left = a.endsAt - nowSec;
  // GBM minimum next bid: ceil(highestBid * (bidDecimals + stepMin) / bidDecimals);
  // for an auction with no bids yet, the start bid floor (or any positive amount).
  const minNextWei = useMemo(() => {
    const hb = BigInt(a.highestBid || "0"), dec = BigInt(a.bidDecimals || "0"), step = BigInt(a.stepMin || "0");
    if (a.totalBids > 0 && hb > 0n && dec > 0n) return (hb * (dec + step) + dec - 1n) / dec;
    const sb = BigInt(a.startBidPrice || "0");
    return sb > 0n ? sb : 1n;
  }, [a]);
  const minNext = Number(minNextWei) / 1e18;
  const stepPct = Number(a.bidDecimals) > 0 ? (Number(a.stepMin) / Number(a.bidDecimals)) * 100 : 0;
  const inHammer = left > 0 && a.hammerTimeDuration > 0 && left <= a.hammerTimeDuration;
  const bidNum = Number(bidValue);
  const bidValid = bidNum > 0 && bidNum >= minNext - 1e-9;
  useEffect(() => { setBidValue(minNext > 0 ? String(Math.ceil(minNext * 100) / 100) : ""); /* prefill min next on open */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [a.id]);
  const { data: bids } = useQuery({ queryKey: ["auction-bids", a.id], queryFn: () => fetchBids(a.id), staleTime: 30_000 });
  const isGotchi = a.contract === AAVEGOTCHI_DIAMOND_BASE.toLowerCase() && a.type === "erc721";
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
          {isGotchi ? (
            <div className="max-w-[260px] mx-auto"><GotchiAuctionCard tokenId={a.tokenId} /></div>
          ) : (
            <div className="w-40 h-40 mx-auto flex items-center justify-center rounded-xl overflow-hidden bg-gradient-to-b from-muted/15 to-muted/40">
              <AuctionItemImage a={a} />
            </div>
          )}

          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top bid</div>
              <div className="text-lg font-bold text-emerald-500">{ghst(a.highestBid)} GHST</div>
              <div className="text-[11px] text-muted-foreground">{a.totalBids} bid{a.totalBids === 1 ? "" : "s"}</div>
            </div>
            <div className="text-right text-sm">
              <span className={left <= 3600 ? "text-red-500 font-semibold" : "text-foreground"}>
                {left <= 0 ? "Ended" : `Ends in ${countdown(left)}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Addr label="Seller" addr={a.seller} />
            <Addr label="Highest bidder" addr={a.highestBidder} />
          </div>

          {Number(a.buyNowPrice) > 0 && left > 0 && (
            <button disabled={busy} onClick={onBuyNow} className="h-11 w-full rounded-lg bg-amber-500 text-black text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5 hover:bg-amber-400">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Buy now · ${ghst(a.buyNowPrice)} GHST`}
            </button>
          )}

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1.5"><Gavel className="w-4 h-4 text-primary" /> Place a bid</div>
            <p className="text-[11px] text-muted-foreground">
              Minimum next bid <span className="font-semibold text-foreground">{minNext.toLocaleString(undefined, { maximumFractionDigits: 2 })} GHST</span>
              {a.totalBids > 0 && stepPct > 0 ? ` (+${stepPct.toFixed(0)}% over the current top bid)` : a.totalBids === 0 ? " (opening bid)" : ""}. Signed in your wallet (GHST approval + commitBid).
            </p>
            <div className="flex items-center gap-2">
              <input autoFocus type="number" value={bidValue} onChange={(e) => setBidValue(e.target.value)} placeholder={`≥ ${minNext}`} className="h-10 flex-1 min-w-0 rounded border border-border bg-background px-3 text-sm" />
              <button disabled={busy || left <= 0 || !bidValid} onClick={onBid} className="h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Bidding…</> : "Place bid"}
              </button>
            </div>
            {bidValue !== "" && !bidValid && <div className="text-[10px] text-red-500">Below the minimum next bid — a lower bid would revert and waste gas.</div>}
            {inHammer && <div className="text-[10px] text-amber-500">⏱ Hammer time — a bid now extends the auction by ~{Math.round(a.hammerTimeDuration / 60)} min (anti-snipe).</div>}
          </div>

          {bids && bids.length > 0 && (
            <div className="rounded-lg border border-border/40">
              <div className="px-3 py-1.5 text-xs font-semibold border-b border-border/40">Bid history · {bids.length}</div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <tbody>
                    {bids.map((b, i) => (
                      <tr key={i} className="border-b border-border/20 last:border-0">
                        <td className="px-3 py-1.5"><Link to={`/u/${b.bidder}`} onClick={onClose} className="font-mono text-primary hover:underline">{short(b.bidder)}</Link></td>
                        <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">{ghst(b.amount)} GHST</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{b.outbid ? "outbid" : "leading"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const num = (a: any): number[] => (Array.isArray(a) ? a.map((n) => Number(n)) : []);

// Fetch an auctioned gotchi as a full ExplorerGotchi so we can render the exact
// same card the Explorer uses (traits, BRS, wearables, info overlay).
async function fetchAuctionGotchi(id: string): Promise<ExplorerGotchi | null> {
  const q = `{ aavegotchi(id:"${id}"){ id gotchiId name hauntId collateral level kinship experience numericTraits modifiedNumericTraits withSetsNumericTraits baseRarityScore modifiedRarityScore withSetsRarityScore equippedWearables owner{ id } createdAt usedSkillPoints equippedSetID equippedSetName stakedAmount lastInteracted } }`;
  const res = await fetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const json = await res.json();
  const g = json.data?.aavegotchi;
  if (!g) return null;
  return {
    id: g.id,
    tokenId: String(g.gotchiId ?? id),
    name: g.name || "Unnamed",
    hauntId: Number(g.hauntId) || 1,
    level: Number(g.level) || 0,
    baseRarityScore: Number(g.baseRarityScore) || 0,
    modifiedRarityScore: Number(g.modifiedRarityScore) || 0,
    withSetsRarityScore: Number(g.withSetsRarityScore) || 0,
    numericTraits: num(g.numericTraits),
    modifiedNumericTraits: num(g.modifiedNumericTraits),
    withSetsNumericTraits: num(g.withSetsNumericTraits),
    equippedWearables: num(g.equippedWearables),
    collateral: g.collateral || "",
    owner: g.owner?.id || "",
    kinship: Number(g.kinship) || 0,
    experience: Number(g.experience) || 0,
    createdAt: g.createdAt ? Number(g.createdAt) : undefined,
    usedSkillPoints: g.usedSkillPoints != null ? Number(g.usedSkillPoints) : undefined,
    equippedSetID: g.equippedSetID != null ? Number(g.equippedSetID) : undefined,
    equippedSetName: g.equippedSetName || undefined,
    stakedAmount: g.stakedAmount || undefined,
    lastInteracted: g.lastInteracted ? Number(g.lastInteracted) : undefined,
  };
}

// Renders the auctioned gotchi as the standard Explorer card.
function GotchiAuctionCard({ tokenId }: { tokenId: string }) {
  const { data } = useQuery({ queryKey: ["auction-gotchi", tokenId], queryFn: () => fetchAuctionGotchi(tokenId), staleTime: 60_000 });
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  return <GotchiExplorerCard gotchi={data} frequencyLoading />;
}
