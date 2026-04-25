import { createWalletClient, http, type WalletClient, type PublicClient, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LENDING_FACET_ABI, AAVEGOTCHI_DIAMOND_BASE } from "./abi";
import type { Template } from "./db";

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
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

// Look up active lendings for a tokenId; we re-list only if there is no active listing.
async function tokenHasActiveListing(tokenId: number): Promise<boolean> {
  const query = `query Q($t: BigInt!) {
    gotchiLendings(
      first: 1
      where: { gotchiTokenId: $t, cancelled: false, completed: false }
    ) { id }
  }`;
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { t: String(tokenId) } }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return Array.isArray(json.data?.gotchiLendings) && json.data.gotchiLendings.length > 0;
}

export async function maybeRelist(t: Template): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  if (!walletClient || !publicClient) {
    return { success: false, txHash: null, error: "Auto-renew wallet not initialized (set AUTORENEW_HOT_WALLET_KEY)" };
  }
  try {
    const hasActive = await tokenHasActiveListing(t.token_id);
    if (hasActive) {
      // Already listed or rented — nothing to do
      return { success: false, txHash: null, error: "already-active" };
    }

    const params = {
      tokenId: t.token_id,
      initialCost: BigInt(t.initial_cost_wei),
      period: t.period_seconds,
      revenueSplit: [t.split_owner, t.split_borrower, t.split_other] as const,
      originalOwner: t.owner as `0x${string}`,
      thirdParty: (t.third_party as `0x${string}`) || ("0x0000000000000000000000000000000000000000" as `0x${string}`),
      whitelistId: t.whitelist_id,
      revenueTokens: [] as `0x${string}`[],
      permissions: t.channelling ? BigInt(0) : BigInt(1),
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
