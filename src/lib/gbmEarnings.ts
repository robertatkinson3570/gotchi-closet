/**
 * GBM bid-to-earn payouts, per-wallet scorecard, and seller net-proceeds.
 * Mirrors the GBM fetchers in UserActivityPage.tsx (same subgraph, same
 * gql-over-fetch pattern) but kept standalone so it's unit-testable without
 * pulling in the page's React/wagmi dependencies.
 */
import { GBM_SUBGRAPH } from "@/lib/subgraph";

export type IncentiveRow = {
  amountGhst: number;
  receiveTime: number;
  tokenId: string;
  contractAddress: string;
  auctionId: string;
};

export type GbmScorecard = {
  bids: number;
  outbids: number;
  wins: number;
  payoutGhst: number;
  auctionsCreated: number;
} | null;

export type SellerSale = {
  auctionId: string;
  tokenId: string;
  contractAddress: string;
  type: string;
  endsAt: number;
  proceedsGhst: number;
  platformFeesGhst: number;
  gbmFeesGhst: number;
  royaltyFeesGhst: number;
};

const wei = (v: unknown) => Number(v ?? 0) / 1e18;

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GBM_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

/** GHST earned from being outbid — every incentive payout to this wallet. */
export async function fetchIncentives(addr: string): Promise<IncentiveRow[]> {
  const a = addr.toLowerCase();
  const d = await gql(
    `query($a: Bytes!){ incentives(first: 500, where: { earner: $a }, orderBy: receiveTime, orderDirection: desc){ earner amount receiveTime tokenId contractAddress auctionID } }`,
    { a }
  );
  return (d?.incentives ?? []).map((i: any) => ({
    amountGhst: wei(i.amount),
    receiveTime: Number(i.receiveTime),
    tokenId: i.tokenId,
    contractAddress: (i.contractAddress ?? "").toLowerCase(),
    auctionId: i.auctionID,
  }));
}

/** Per-wallet GBM scorecard: bids placed, times outbid, wins, lifetime payouts. */
export async function fetchScorecard(addr: string): Promise<GbmScorecard> {
  const a = addr.toLowerCase();
  const d = await gql(`query($a: ID!){ user(id: $a){ id bids outbids wins payoutAmount totalAuctionsCreated } }`, { a });
  const u = d?.user;
  if (!u) return null;
  return {
    bids: Number(u.bids) || 0,
    outbids: Number(u.outbids) || 0,
    wins: Number(u.wins) || 0,
    payoutGhst: wei(u.payoutAmount),
    auctionsCreated: Number(u.totalAuctionsCreated) || 0,
  };
}

/** Seller-side P&L: net proceeds and fee breakdown for claimed auctions this wallet sold. */
export async function fetchSellerSales(addr: string): Promise<SellerSale[]> {
  const a = addr.toLowerCase();
  const d = await gql(
    `query($a: Bytes!){ auctions(first: 200, where: { seller: $a, claimed: true }, orderBy: endsAt, orderDirection: desc){ id type tokenId contractAddress endsAt sellerProceeds platformFees gbmFees royaltyFees } }`,
    { a }
  );
  return (d?.auctions ?? []).map((au: any) => ({
    auctionId: au.id,
    tokenId: au.tokenId,
    contractAddress: (au.contractAddress ?? "").toLowerCase(),
    type: au.type,
    endsAt: Number(au.endsAt),
    proceedsGhst: wei(au.sellerProceeds),
    platformFeesGhst: wei(au.platformFees),
    gbmFeesGhst: wei(au.gbmFees),
    royaltyFeesGhst: wei(au.royaltyFees),
  }));
}
