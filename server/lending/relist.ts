import { createWalletClient, http, type WalletClient, type PublicClient, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LENDING_FACET_ABI, AAVEGOTCHI_DIAMOND_BASE } from "./abi";
import type { Template } from "./db";
import { subgraphFetch } from "../aavegotchi/subgraphFetch";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

let walletClient: WalletClient | null = null;
let publicClient: PublicClient | null = null;
let operatorAddress: string | null = null;

export function getOperatorAddress(): string | null {
  return operatorAddress;
}

export function initWallet() {
  const key = process.env.AUTORENEW_HOT_WALLET_KEY;
  if (!key) return false;
  const account = privateKeyToAccount(key as `0x${string}`);
  operatorAddress = account.address;
  walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  return true;
}

type ActiveLendingState =
  | { kind: "none" }
  | { kind: "open" } // listed but not yet rented (borrower=null)
  | { kind: "rented_active"; lendingId: string; expiresAt: number }
  | { kind: "rented_expired"; lendingId: string; expiresAt: number };

// Look up the active listing for a tokenId so we can decide between:
//  - relisting (if no active row exists)
//  - claiming-and-ending (if rented and the period has passed)
//  - skipping (if open or rental still in progress)
async function getActiveLendingState(tokenId: number): Promise<ActiveLendingState> {
  const query = `query Q($t: BigInt!) {
    gotchiLendings(
      first: 1
      where: { gotchiTokenId: $t, cancelled: false, completed: false }
    ) { id borrower timeAgreed period }
  }`;
  const res = await subgraphFetch({ query, variables: { t: String(tokenId) } });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const row = json.data?.gotchiLendings?.[0];
  if (!row) return { kind: "none" };
  if (!row.borrower) return { kind: "open" };
  const timeAgreed = Number(row.timeAgreed);
  const period = Number(row.period);
  if (!timeAgreed || !period) return { kind: "rented_active", lendingId: row.id, expiresAt: 0 };
  const expiresAt = timeAgreed + period;
  const now = Math.floor(Date.now() / 1000);
  return expiresAt <= now
    ? { kind: "rented_expired", lendingId: row.id, expiresAt }
    : { kind: "rented_active", lendingId: row.id, expiresAt };
}

async function claimAndEnd(tokenId: number): Promise<{ txHash: string | null; error: string | null }> {
  if (!walletClient || !publicClient) return { txHash: null, error: "wallet not initialized" };
  try {
    const hash = await walletClient.writeContract({
      address: AAVEGOTCHI_DIAMOND_BASE as `0x${string}`,
      abi: LENDING_FACET_ABI,
      functionName: "claimAndEndGotchiLending",
      args: [tokenId],
      chain: base,
      account: walletClient.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") return { txHash: hash, error: "claim-tx reverted" };
    return { txHash: hash, error: null };
  } catch (err: any) {
    return {
      txHash: null,
      error: (err?.shortMessage || err?.message || String(err)).slice(0, 500),
    };
  }
}

export async function maybeRelist(t: Template): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  if (!walletClient || !publicClient) {
    return { success: false, txHash: null, error: "Auto-renew wallet not initialized (set AUTORENEW_HOT_WALLET_KEY)" };
  }
  try {
    const state = await getActiveLendingState(t.token_id);
    if (state.kind === "open" || state.kind === "rented_active") {
      // Open listing waiting on a borrower, or rental still in progress — nothing to do
      return { success: false, txHash: null, error: "already-active" };
    }
    if (state.kind === "rented_expired") {
      // Rental period passed but nobody called claimAndEnd — operator does it,
      // freeing the gotchi from escrow so we can re-list this same tick.
      const claim = await claimAndEnd(t.token_id);
      if (claim.error) {
        return { success: false, txHash: claim.txHash, error: `claim-and-end: ${claim.error}` };
      }
      console.log(`[autorenew] claimed expired rental #${t.token_id} tx=${claim.txHash}`);
    }

    const params = {
      tokenId: t.token_id,
      initialCost: BigInt(t.initial_cost_wei),
      period: t.period_seconds,
      revenueSplit: [t.split_owner, t.split_borrower, t.split_other] as const,
      originalOwner: t.owner as `0x${string}`,
      thirdParty: (t.third_party as `0x${string}`) || ("0x0000000000000000000000000000000000000000" as `0x${string}`),
      whitelistId: t.whitelist_id,
      // Declare alchemica addresses so claimGotchiLending iterates over
      // them and splits gotchi-escrow alch per the lending terms at claim
      // time. Verified canonical via Base subgraph (every real listing
      // uses these 4). Single-listing tx so per-tx gas isn't a concern.
      revenueTokens: [
        "0x2028b4043e6722Ea164946c82fe806c4a43a0fF4",
        "0xA32137bfb57d2b6A9Fd2956Ba4B54741a6D54b58",
        "0x15e7CaC885e3730ce6389447BC0f7AC032f31947",
        "0xE52b9170fF4ece4C35E796Ffd74B57Dec68Ca0e5",
      ] as `0x${string}`[],
      // 0x101 = channelling allowed (bit 0 + bit 8, matching dapp convention
      // verified via getGotchiLendingFromToken on Base); 0x0 = disabled.
      permissions: t.channelling ? BigInt(0x101) : BigInt(0),
    };

    const hash = await walletClient.writeContract({
      address: AAVEGOTCHI_DIAMOND_BASE as `0x${string}`,
      abi: LENDING_FACET_ABI,
      functionName: "addGotchiListing",
      args: [params],
      chain: base,
      account: walletClient.account!,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      return { success: false, txHash: hash, error: "tx reverted" };
    }
    return { success: true, txHash: hash, error: null };
  } catch (err: any) {
    return {
      success: false,
      txHash: null,
      error: (err?.shortMessage || err?.message || String(err)).slice(0, 500),
    };
  }
}
