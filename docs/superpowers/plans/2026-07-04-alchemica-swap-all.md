# Alchemica Swap-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card to `/get-tokens` that shows the connected wallet's held alchemica (FUD/FOMO/ALPHA/KEK) balances and swaps all of them to GHST in one click via LiFi, skipping any token whose swap fails instead of aborting the rest.

**Architecture:** Extract the LiFi quote/approve/send flow already inlined in `SwapCard.tsx` into shared, independently-testable helpers (`src/lib/swap/lifi.ts`). Build a new `AlchemicaSwapCard` on top of those helpers that reads all 4 alchemica balances in one multicall, then sequentially quotes+swaps every nonzero one straight to GHST. Wire it into `GetTokensPage.tsx` above the existing `SwapCard`.

**Tech Stack:** React + TypeScript, wagmi/viem (Base chain, chainId 8453), TanStack Query (via wagmi's `useReadContracts`), LiFi aggregator (`li.quest/v1/quote`), Vitest.

Spec: `docs/superpowers/specs/2026-07-04-alchemica-swap-all-design.md`

---

### Task 1: Extract shared LiFi helpers

**Files:**
- Create: `src/lib/swap/lifi.ts`
- Test: `src/lib/swap/lifi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/swap/lifi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLifiQuoteParams, parseLifiQuoteResponse, fmtUnits } from "./lifi";

describe("buildLifiQuoteParams", () => {
  it("builds same-chain params with default slippage", () => {
    const params = buildLifiQuoteParams({
      fromToken: "0xFUD",
      toToken: "0xGHST",
      fromAmountWei: 1_000_000_000_000_000_000n,
      fromAddress: "0xWALLET",
      chainId: 8453,
    });
    expect(params.get("fromChain")).toBe("8453");
    expect(params.get("toChain")).toBe("8453");
    expect(params.get("fromToken")).toBe("0xFUD");
    expect(params.get("toToken")).toBe("0xGHST");
    expect(params.get("fromAmount")).toBe("1000000000000000000");
    expect(params.get("fromAddress")).toBe("0xWALLET");
    expect(params.get("slippage")).toBe("0.005");
  });

  it("honors a custom slippage", () => {
    const params = buildLifiQuoteParams({
      fromToken: "0xA", toToken: "0xB", fromAmountWei: 1n, fromAddress: "0xC", slippage: "0.01",
    });
    expect(params.get("slippage")).toBe("0.01");
  });
});

describe("parseLifiQuoteResponse", () => {
  it("parses a successful quote", () => {
    const quote = parseLifiQuoteResponse({
      transactionRequest: { to: "0xROUTER", data: "0xdead", value: "0" },
      estimate: {
        toAmount: "2500000000000000000",
        toAmountMin: "2487500000000000000",
        approvalAddress: "0xROUTER",
        gasCosts: [{ amountUSD: "0.12" }],
      },
      toolDetails: { name: "aerodrome" },
    });
    expect(quote.toAmount).toBe(2_500_000_000_000_000_000n);
    expect(quote.toAmountMin).toBe(2_487_500_000_000_000_000n);
    expect(quote.approvalAddress).toBe("0xROUTER");
    expect(quote.tx).toEqual({ to: "0xROUTER", data: "0xdead", value: 0n });
    expect(quote.gasUsd).toBe("0.12");
    expect(quote.tool).toBe("aerodrome");
  });

  it("throws when no route was found", () => {
    expect(() => parseLifiQuoteResponse({ message: "No routes found" })).toThrow("No routes found");
  });

  it("throws a generic message when the API gives no reason", () => {
    expect(() => parseLifiQuoteResponse({})).toThrow("No route found");
  });
});

describe("fmtUnits", () => {
  it("formats 18-decimal amounts with up to 4 decimal places", () => {
    expect(fmtUnits(1_234_500_000_000_000_000n, 18)).toBe("1.2345");
  });
  it("drops to 2 decimal places above 1000", () => {
    expect(fmtUnits(1_500_000_000_000_000_000_000n, 18)).toBe("1,500");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/swap/lifi.test.ts`
Expected: FAIL — `Cannot find module './lifi'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/swap/lifi.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/swap/lifi.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/swap/lifi.ts src/lib/swap/lifi.test.ts
git commit -m "feat(swap): extract shared LiFi quote/swap helpers"
```

---

### Task 2: Refactor `SwapCard` to use the shared helpers

**Files:**
- Modify: `src/components/swap/SwapCard.tsx`

This is a pure extraction — `SwapCard`'s behavior must not change. No new test; verified by the existing suite + typecheck + a manual smoke check in Task 5.

- [ ] **Step 1: Replace the top-of-file constants/types with imports from `lifi.ts`**

In `src/components/swap/SwapCard.tsx`, replace lines 1–36 (imports through the `fmtUnits` function) with:

```ts
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract, useSendTransaction } from "wagmi";
import { ArrowDownUp, Fuel, Loader2, Sparkles, Zap } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { NATIVE, fetchLifiQuote, executeLifiSwap, fmtUnits, type Token, type Quote } from "@/lib/swap/lifi";

const GHST: Token = { symbol: "GHST", address: "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB", decimals: 18 };
const PAY_TOKENS: Token[] = [
  { symbol: "ETH", address: NATIVE, decimals: 18 },
  { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
];
```

(This removes the local `LIFI_QUOTE` constant, the local `NATIVE` constant, the local `Token`/`Quote` type declarations, and the local `fmtUnits` function — all now imported from `@/lib/swap/lifi`.)

- [ ] **Step 2: Replace the quote-fetching `useEffect` body**

Find the `useEffect` that fetches the debounced live quote (starts with `useEffect(() => { setQuote(null);`). Replace its `setTimeout` callback body with:

```ts
    const t = setTimeout(async () => {
      try {
        const q = await fetchLifiQuote({
          fromToken: fromToken.address,
          toToken: toToken.address,
          fromAmountWei: amountWei,
          fromAddress: address ?? "0x0000000000000000000000000000000000000001",
        });
        if (cancelled) return;
        setQuote(q);
      } catch (e: any) {
        if (!cancelled) setQuoteError(e?.message ?? "Quote failed — try again");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 450);
```

- [ ] **Step 3: Replace `doSwap`'s body**

```ts
  const doSwap = async () => {
    if (!quote || !address || !publicClient) return;
    setSwapping(true);
    try {
      await executeLifiSwap({ quote, fromToken, amountWei, address, publicClient, writeContractAsync, sendTransactionAsync });
      toast({ title: "Swap complete", description: `Received ~${fmtUnits(quote.toAmount, toToken.decimals)} ${toToken.symbol}.` });
      setAmount("");
      setQuote(null);
    } catch (e) {
      toast({ title: "Swap failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
    } finally {
      setSwapping(false);
    }
  };
```

- [ ] **Step 4: Typecheck and run the full unit suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test:unit`
Expected: all existing tests still pass (this refactor touches no other file).

- [ ] **Step 5: Commit**

```bash
git add src/components/swap/SwapCard.tsx
git commit -m "refactor(swap): SwapCard uses shared LiFi helpers"
```

---

### Task 3: Build `AlchemicaSwapCard`

**Files:**
- Create: `src/components/swap/AlchemicaSwapCard.tsx`

No automated test for this file (matches the existing convention — `SwapCard` itself has no test; this is wallet-interaction UI). Verified by typecheck now and manual check in Task 5.

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContracts, useSendTransaction, useWriteContract } from "wagmi";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { ALCHEMICA_TOKENS_BASE, ERC20_ABI, GHST_TOKEN_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { executeLifiSwap, fetchLifiQuote, fmtUnits, type Token } from "@/lib/swap/lifi";

const GHST: Token = { symbol: "GHST", address: GHST_TOKEN_BASE, decimals: 18 };
// All 4 alchemica tokens are 18-decimal ERC20s (confirmed in LandAlchemicaBar.tsx).
const ALCH_TOKENS: Token[] = ALCHEMICA_TOKENS_BASE.map((t) => ({ symbol: t.symbol, address: t.address, decimals: 18 }));

type RowStatus = "idle" | "quoting" | "swapping" | "done" | "failed";
type Row = { token: Token; balance: bigint; status: RowStatus; receivedGhst?: bigint; error?: string };

function StatusBadge({ row }: { row: Row }) {
  switch (row.status) {
    case "quoting":
      return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Quoting…</span>;
    case "swapping":
      return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Swapping…</span>;
    case "done":
      return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500"><CheckCircle2 className="w-3 h-3" /> +{fmtUnits(row.receivedGhst ?? 0n, 18)} GHST</span>;
    case "failed":
      return <span className="inline-flex items-center gap-1 text-[10px] text-rose-500" title={row.error}><XCircle className="w-3 h-3" /> Failed</span>;
    default:
      return null;
  }
}

/**
 * One-click liquidation: swap every held alchemica token (FUD/FOMO/ALPHA/KEK)
 * to GHST via LiFi, one swap per token in sequence. A failed/rejected token
 * is skipped so it doesn't block the rest (see design doc
 * docs/superpowers/specs/2026-07-04-alchemica-swap-all-design.md).
 */
export function AlchemicaSwapCard() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { toast } = useToast();

  const balanceContracts = useMemo(
    () =>
      ALCH_TOKENS.map((t) => ({
        address: t.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: address ? ([address] as const) : undefined,
        chainId: BASE_CHAIN_ID,
      })),
    [address]
  );
  const { data: balanceData, refetch } = useReadContracts({
    contracts: balanceContracts,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const heldTokens = useMemo<{ token: Token; balance: bigint }[]>(() => {
    if (!balanceData) return [];
    return ALCH_TOKENS.map((t, i) => ({
      token: t,
      balance: balanceData[i]?.status === "success" ? (balanceData[i].result as bigint) : 0n,
    })).filter((r) => r.balance > 0n);
  }, [balanceData]);

  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const displayRows: Row[] = rows.length > 0 ? rows : heldTokens.map((r) => ({ ...r, status: "idle" }));

  const swapAll = async () => {
    if (!address || !publicClient || heldTokens.length === 0) return;
    setRunning(true);
    const working: Row[] = heldTokens.map((r) => ({ ...r, status: "idle" }));
    setRows(working);

    let totalGhst = 0n;
    let succeeded = 0;
    for (let i = 0; i < working.length; i++) {
      working[i] = { ...working[i], status: "quoting" };
      setRows([...working]);
      try {
        const quote = await fetchLifiQuote({
          fromToken: working[i].token.address,
          toToken: GHST.address,
          fromAmountWei: working[i].balance,
          fromAddress: address,
        });
        working[i] = { ...working[i], status: "swapping" };
        setRows([...working]);
        await executeLifiSwap({
          quote,
          fromToken: working[i].token,
          amountWei: working[i].balance,
          address,
          publicClient,
          writeContractAsync,
          sendTransactionAsync,
        });
        working[i] = { ...working[i], status: "done", receivedGhst: quote.toAmount };
        totalGhst += quote.toAmount;
        succeeded++;
      } catch (e) {
        working[i] = { ...working[i], status: "failed", error: parseRevert(e) };
      }
      setRows([...working]);
    }

    setRunning(false);
    refetch();

    const total = working.length;
    if (succeeded === total) {
      toast({ title: "Swap complete", description: `Swapped ${succeeded}/${total} — received ~${fmtUnits(totalGhst, 18)} GHST total.` });
    } else if (succeeded > 0) {
      const failedSymbols = working.filter((r) => r.status === "failed").map((r) => r.token.symbol).join(", ");
      toast({ title: "Partial swap", description: `Swapped ${succeeded}/${total} — received ~${fmtUnits(totalGhst, 18)} GHST. Failed: ${failedSymbols}.` });
    } else {
      toast({ title: "Swap failed", description: "None of the alchemica swaps went through.", variant: "destructive" });
    }
  };

  const doneOrFailed = rows.filter((r) => r.status === "done" || r.status === "failed").length;

  return (
    <div className="relative rounded-2xl border border-border/40 bg-gradient-to-b from-primary/[0.07] to-background/60 p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-1.5 text-sm font-bold"><Sparkles className="w-4 h-4 text-primary" /> Your alchemica</div>
      </div>

      {!isConnected ? (
        <ConnectButton className="w-full h-10" />
      ) : displayRows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3">No alchemica to swap</div>
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {displayRows.map((r) => (
              <div key={r.token.symbol} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-sm">
                <span className="font-semibold">{r.token.symbol}</span>
                <span className="tabular-nums text-muted-foreground">{fmtUnits(r.balance, r.token.decimals)}</span>
                <StatusBadge row={r} />
              </div>
            ))}
          </div>
          <button
            disabled={running}
            onClick={swapAll}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-sm font-bold shadow hover:opacity-95 disabled:opacity-40 transition-opacity inline-flex items-center justify-center gap-2"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Swapping {Math.min(doneOrFailed + 1, rows.length)} of {rows.length}…</>
            ) : (
              "Swap all ALCH → GHST"
            )}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/swap/AlchemicaSwapCard.tsx
git commit -m "feat(swap): add AlchemicaSwapCard (swap all ALCH to GHST)"
```

---

### Task 4: Wire `AlchemicaSwapCard` into `/get-tokens`

**Files:**
- Modify: `src/pages/GetTokensPage.tsx`

- [ ] **Step 1: Import the new card**

In `src/pages/GetTokensPage.tsx`, change:

```ts
import { SwapCard } from "@/components/swap/SwapCard";
```

to:

```ts
import { SwapCard } from "@/components/swap/SwapCard";
import { AlchemicaSwapCard } from "@/components/swap/AlchemicaSwapCard";
```

- [ ] **Step 2: Render it above `SwapCard` on the Swap tab**

Change:

```tsx
      {tab === "swap" && (
        <div className="mb-4">
          <SwapCard />
          <div className="text-[10px] text-muted-foreground text-center mt-2">Or use an external venue:</div>
        </div>
      )}
```

to:

```tsx
      {tab === "swap" && (
        <div className="mb-4">
          <AlchemicaSwapCard />
          <SwapCard />
          <div className="text-[10px] text-muted-foreground text-center mt-2">Or use an external venue:</div>
        </div>
      )}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/GetTokensPage.tsx
git commit -m "feat(get-tokens): show AlchemicaSwapCard above the manual swap card"
```

---

### Task 5: Manual verification (wallet-required — cannot be automated)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Connect a Base wallet holding at least one nonzero alchemica balance**

Navigate to `http://localhost:5000/get-tokens`, connect a wallet (injected or WalletConnect) that holds FUD/FOMO/ALPHA/KEK on Base (8453). Confirm:
- Only tokens with a nonzero balance appear as rows.
- If the wallet holds zero of all 4, the card shows "No alchemica to swap" and no button.

- [ ] **Step 3: Run the swap-all flow**

Click "Swap all ALCH → GHST". Confirm:
- The wallet prompts sequentially — one approve (if that token's allowance was 0) then one swap per held token.
- Each row updates through Quoting… → Swapping… → a final ✓/✗ state.
- The button shows "Swapping N of M…" while running and is disabled.

- [ ] **Step 4: Reject one prompt mid-sequence**

Re-run with at least 2 nonzero tokens held; reject one wallet prompt. Confirm the sequence continues to the remaining token(s) instead of stopping, and the final toast reports a partial result (e.g. "Swapped 1/2 — FOMO failed: Transaction rejected in wallet.").

- [ ] **Step 5: Confirm balances refresh**

After a successful swap, confirm the swapped token's row disappears from the list (balance re-read as 0) and the header wallet chip's GHST balance updates within ~30s (it polls independently — see design doc's Post-run section).
