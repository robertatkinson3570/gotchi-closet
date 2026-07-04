import type { useSendTransaction, useWriteContract } from "wagmi";
import type { PublicClient } from "viem";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/lending/contracts";

/** LiFi aggregates every Base DEX and returns a ready-to-send tx. Direct
 * Aerodrome pools were verified too thin (100 USDC -> 5.8 GHST); the
 * aggregator quote returns the true market rate. Shared by SwapCard (manual
 * pay -> GHST swap) and AlchemicaSwapCard (swap-all-alchemica). */
export const LIFI_QUOTE_URL = "https://li.quest/v1/quote";
export const NATIVE = "0x0000000000000000000000000000000000000000";

export type Token = { symbol: string; address: string; decimals: number };

export type Quote = {
  toAmount: bigint;
  toAmountMin: bigint;
  approvalAddress: `0x${string}`;
  tx: { to: `0x${string}`; data: `0x${string}`; value: bigint };
  gasUsd: string | null;
  tool: string;
};

export function buildLifiQuoteParams(opts: {
  fromToken: string;
  toToken: string;
  fromAmountWei: bigint;
  fromAddress: string;
  chainId?: number;
  slippage?: string;
}): URLSearchParams {
  const chainId = opts.chainId ?? BASE_CHAIN_ID;
  return new URLSearchParams({
    fromChain: String(chainId),
    toChain: String(chainId),
    fromToken: opts.fromToken,
    toToken: opts.toToken,
    fromAmount: opts.fromAmountWei.toString(),
    fromAddress: opts.fromAddress,
    slippage: opts.slippage ?? "0.005",
  });
}

/** Turn a raw li.quest/v1/quote JSON body into a Quote, or throw if no route was found. */
export function parseLifiQuoteResponse(json: any): Quote {
  if (!json?.transactionRequest) {
    throw new Error(json?.message ?? "No route found");
  }
  return {
    toAmount: BigInt(json.estimate.toAmount),
    toAmountMin: BigInt(json.estimate.toAmountMin),
    approvalAddress: json.estimate.approvalAddress,
    tx: {
      to: json.transactionRequest.to,
      data: json.transactionRequest.data,
      value: BigInt(json.transactionRequest.value ?? 0),
    },
    gasUsd: json.estimate.gasCosts?.[0]?.amountUSD ?? null,
    tool: json.toolDetails?.name ?? json.tool ?? "aggregator",
  };
}

export async function fetchLifiQuote(opts: {
  fromToken: string;
  toToken: string;
  fromAmountWei: bigint;
  fromAddress: string;
  chainId?: number;
  slippage?: string;
}): Promise<Quote> {
  const params = buildLifiQuoteParams(opts);
  const res = await fetch(`${LIFI_QUOTE_URL}?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
  return parseLifiQuoteResponse(json);
}

/** Approve (if the current allowance is too low) then send the swap tx,
 * awaiting both receipts. Throws on rejection/revert — callers decide
 * whether to abort or skip-and-continue. */
export async function executeLifiSwap(opts: {
  quote: Quote;
  fromToken: Token;
  amountWei: bigint;
  address: `0x${string}`;
  publicClient: PublicClient;
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  sendTransactionAsync: ReturnType<typeof useSendTransaction>["sendTransactionAsync"];
}): Promise<{ hash: `0x${string}` }> {
  const { quote, fromToken, amountWei, address, publicClient, writeContractAsync, sendTransactionAsync } = opts;

  if (fromToken.address !== NATIVE) {
    const allowance = (await publicClient.readContract({
      address: fromToken.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, quote.approvalAddress],
    })) as bigint;
    if (allowance < amountWei) {
      const approveHash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: fromToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [quote.approvalAddress, amountWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
    }
  }

  const hash = await sendTransactionAsync({
    chainId: BASE_CHAIN_ID,
    to: quote.tx.to,
    data: quote.tx.data,
    value: quote.tx.value,
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash };
}

/** $ formatting for raw token amounts (bigint wei -> display string). */
export function fmtUnits(v: bigint, decimals: number, dp = 4): string {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 2 : dp });
}
