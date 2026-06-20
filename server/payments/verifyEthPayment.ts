// On-chain payment verification for Wisp billing (Base). Native ETH is checked by
// the tx's to/value; USDC by an ERC-20 Transfer event. Mirrors the GHST checker in
// server/lending/verifyPayment.ts. Never throws on a bad tx — returns { ok:false }.

import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
// Native USDC on Base. VERIFY before production use.
const USDC_BASE = (process.env.WISP_USDC_ADDRESS ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

let client: ReturnType<typeof createPublicClient> | null = null;
function c() {
  if (!client) client = createPublicClient({ chain: base, transport: http(RPC_URL, { timeout: 6000, retryCount: 1 }) });
  return client;
}

export type VerifyResult = { ok: true; valueWei: bigint } | { ok: false; error: string };

/** Verify a native ETH transfer: status success, to == expectedTo, value >= minValueWei. */
export async function verifyEthPayment(args: {
  txHash: `0x${string}`;
  expectedTo: `0x${string}`;
  minValueWei: bigint;
  expectedFrom?: `0x${string}`;
}): Promise<VerifyResult> {
  try {
    const [tx, receipt] = await Promise.all([
      c().getTransaction({ hash: args.txHash }),
      c().getTransactionReceipt({ hash: args.txHash }),
    ]);
    if (!tx || !receipt) return { ok: false, error: "tx not found" };
    if (receipt.status !== "success") return { ok: false, error: "tx reverted" };
    if (!tx.to || tx.to.toLowerCase() !== args.expectedTo.toLowerCase())
      return { ok: false, error: "wrong recipient" };
    if (args.expectedFrom && tx.from.toLowerCase() !== args.expectedFrom.toLowerCase())
      return { ok: false, error: "wrong sender" };
    if (tx.value < args.minValueWei) return { ok: false, error: "underpaid" };
    return { ok: true, valueWei: tx.value };
  } catch (err: any) {
    return { ok: false, error: err?.shortMessage || err?.message || String(err) };
  }
}

/** Verify a USDC (ERC-20) transfer: status success, a Transfer to expectedTo of >= minUnits. */
export async function verifyUsdcPayment(args: {
  txHash: `0x${string}`;
  expectedTo: `0x${string}`;
  minUnits: bigint;
  expectedFrom?: `0x${string}`;
}): Promise<VerifyResult> {
  try {
    const receipt = await c().getTransactionReceipt({ hash: args.txHash });
    if (!receipt) return { ok: false, error: "tx not found" };
    if (receipt.status !== "success") return { ok: false, error: "tx reverted" };
    const toLc = args.expectedTo.toLowerCase();
    const fromLc = args.expectedFrom?.toLowerCase();
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics });
        if (decoded.eventName !== "Transfer") continue;
        const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
        if (to.toLowerCase() === toLc && (!fromLc || from.toLowerCase() === fromLc) && value >= args.minUnits) {
          return { ok: true, valueWei: value };
        }
      } catch {
        // not a Transfer — skip
      }
    }
    return { ok: false, error: "no matching USDC transfer in tx receipt" };
  } catch (err: any) {
    return { ok: false, error: err?.shortMessage || err?.message || String(err) };
  }
}
