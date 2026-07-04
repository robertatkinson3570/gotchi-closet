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
