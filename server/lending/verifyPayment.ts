import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;

let client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!client) client = createPublicClient({ chain: base, transport: http(RPC_URL) });
  return client;
}

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export type VerifyResult =
  | { ok: true; from: `0x${string}`; to: `0x${string}`; valueWei: bigint; blockNumber: bigint }
  | { ok: false; error: string };

/**
 * Verify a GHST payment by reading the tx receipt from Base mainnet.
 *
 * Checks:
 *  - tx exists, mined, status=success
 *  - emits an ERC-20 Transfer event from `expectedFrom` to `expectedTo`
 *  - value equals `expectedValueWei` (exact)
 *  - emitter is the GHST contract address
 */
export async function verifyGhstPayment(args: {
  txHash: `0x${string}`;
  expectedFrom: `0x${string}`;
  expectedTo: `0x${string}`;
  expectedValueWei: bigint;
}): Promise<VerifyResult> {
  try {
    const c = getClient();
    const receipt = await c.getTransactionReceipt({ hash: args.txHash });
    if (!receipt) return { ok: false, error: "tx not found" };
    if (receipt.status !== "success") return { ok: false, error: "tx reverted" };

    const fromLc = args.expectedFrom.toLowerCase();
    const toLc = args.expectedTo.toLowerCase();

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== GHST_BASE.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
        if (decoded.eventName !== "Transfer") continue;
        const { from, to, value } = decoded.args as {
          from: `0x${string}`;
          to: `0x${string}`;
          value: bigint;
        };
        if (
          from.toLowerCase() === fromLc &&
          to.toLowerCase() === toLc &&
          value === args.expectedValueWei
        ) {
          return {
            ok: true,
            from,
            to,
            valueWei: value,
            blockNumber: receipt.blockNumber,
          };
        }
      } catch {
        // not a Transfer event — skip
      }
    }
    return { ok: false, error: "no matching GHST Transfer event in tx receipt" };
  } catch (err: any) {
    return { ok: false, error: err?.shortMessage || err?.message || String(err) };
  }
}
