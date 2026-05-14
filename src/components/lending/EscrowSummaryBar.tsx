import { useEffect, useMemo, useState } from "react";
import { Coins, Loader2, CheckCircle2, XCircle, Sparkles, Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { useEscrowBalances, useBatchTransferEscrow } from "@/hooks/useEscrowWithdraw";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";

const DECIMALS = BigInt(10) ** BigInt(18);

function formatAlch(amount: bigint): string {
  // 4 decimals max for readability — alchemica often comes in fractional
  // amounts well below 1 (e.g. 0.05 KEK from a partial channel).
  const whole = amount / DECIMALS;
  const frac = amount % DECIMALS;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = (frac * BigInt(10000) / DECIMALS).toString().padStart(4, "0").replace(/0+$/, "");
  if (!fracStr) return whole.toString();
  return `${whole}.${fracStr}`;
}

/**
 * Shown above the tabs on /lending/me. Reads alchemica balances stuck in
 * each gotchi's per-token escrow and surfaces a one-click batch sweep.
 *
 * Only unlocked gotchis (no active lending) can have their escrow withdrawn
 * — the diamond's onlyUnlocked modifier reverts otherwise. So the user has
 * to cancel listings / end rentals first; once those gotchis return to the
 * wallet, they show up here ready to sweep.
 */
export function EscrowSummaryBar() {
  const { address } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const { gotchis } = useGotchisByOwner(address?.toLowerCase() ?? "");
  // Lender records — gotchis the connected wallet is the originalOwner of,
  // which includes both currently-listed and currently-rented-out gotchis.
  // Crucial because the subgraph's `gotchisOwned` returns 0 for these
  // while a rental is active (current owner = lending contract / borrower),
  // so without this the bar would be blank for the user's actual scenario.
  const { lender } = useMyConnectedLendings();

  // Build the full set of token IDs the user has a claim over:
  // owned outright (Unlisted) + listed/rented (Listed/Rented out).
  // We track lock state per id so we can split the totals into
  // "withdrawable now" vs "locked — end rental first" for the UI.
  const { allIds, lockedSet } = useMemo(() => {
    const set = new Map<number, boolean>(); // id → locked
    for (const g of gotchis ?? []) {
      const lendingFlag = Number((g as any).lending ?? 0);
      const id = Number((g as any).gotchiId ?? (g as any).id);
      if (!Number.isFinite(id)) continue;
      // Subgraph's `lending` is the active listing id (>0 when locked).
      set.set(id, lendingFlag > 0);
    }
    for (const l of lender) {
      // Any lending record where the user is lender → gotchi is locked
      // (whether agreed/rented or just listed). Cancelled/completed records
      // are filtered out upstream by useMyLendings semantics.
      const id = Number(l.gotchiTokenId);
      if (Number.isFinite(id)) set.set(id, true);
    }
    return {
      allIds: Array.from(set.keys()),
      lockedSet: new Set(
        Array.from(set.entries())
          .filter(([, locked]) => locked)
          .map(([id]) => id)
      ),
    };
  }, [gotchis, lender]);

  const { balances, isLoading, refetch } = useEscrowBalances(allIds);

  // Split balances into withdrawable now vs locked. The "Withdraw all" CTA
  // operates only on the unlocked subset — locked ones would revert.
  const unlockedRows = useMemo(
    () => balances.filter((b) => !lockedSet.has(b.tokenId)),
    [balances, lockedSet]
  );
  const lockedRows = useMemo(
    () => balances.filter((b) => lockedSet.has(b.tokenId)),
    [balances, lockedSet]
  );

  const sumBySymbol = (rows: typeof balances) => {
    const t: Record<string, bigint> = {};
    for (const b of rows) t[b.symbol] = (t[b.symbol] ?? BigInt(0)) + b.amount;
    return t;
  };
  const unlockedTotals = useMemo(() => sumBySymbol(unlockedRows), [unlockedRows]);
  const lockedTotals = useMemo(() => sumBySymbol(lockedRows), [lockedRows]);

  const withdraw = useBatchTransferEscrow();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (withdraw.step === "success") {
      toast({
        title: "Alchemica withdrawn",
        description: `${unlockedRows.length} escrow transfer${unlockedRows.length === 1 ? "" : "s"} swept to your wallet.`,
      });
      refetch();
      setConfirming(false);
      withdraw.reset();
    }
    if (withdraw.step === "error" && withdraw.errorMsg) {
      toast({
        title: "Withdraw failed",
        description: withdraw.errorMsg.slice(0, 160),
        variant: "destructive",
      });
      setConfirming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdraw.step]);

  if (!address) return null;
  if (isLoading) return null;
  if (balances.length === 0) return null;

  const fmtSummary = (totals: Record<string, bigint>) =>
    ["FUD", "FOMO", "ALPHA", "KEK"]
      .map((sym) => {
        const t = totals[sym];
        if (!t || t === BigInt(0)) return null;
        return `${formatAlch(t)} ${sym}`;
      })
      .filter(Boolean)
      .join(" · ");

  const unlockedSummary = fmtSummary(unlockedTotals);
  const lockedSummary = fmtSummary(lockedTotals);
  const unlockedGotchiCount = new Set(unlockedRows.map((b) => b.tokenId)).size;
  const lockedGotchiCount = new Set(lockedRows.map((b) => b.tokenId)).size;

  const busy = withdraw.step === "submitting" || withdraw.step === "confirming" || confirming;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="text-sm font-semibold inline-flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <Coins className="w-3.5 h-3.5 text-amber-500" />
        Alchemica in gotchi escrows
      </div>

      {unlockedRows.length > 0 && (
        <div className="rounded border border-green-500/30 bg-green-500/5 p-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs min-w-0">
            <div className="font-semibold text-green-600 dark:text-green-400">
              Ready to withdraw
            </div>
            <div className="text-muted-foreground break-words">
              <span className="text-foreground font-medium">{unlockedSummary}</span>
              <span className="ml-1">
                · {unlockedGotchiCount} unlocked gotchi{unlockedGotchiCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!address) return;
              setConfirming(true);
              withdraw.send(unlockedRows, address as `0x${string}`);
            }}
            disabled={busy || !isOnBase}
            title={!isOnBase ? "Switch to Base to withdraw" : "Sweep every unlocked escrow balance to your wallet in one tx"}
            data-testid="escrow-withdraw-all"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {withdraw.step === "submitting" ? "Sign in wallet…" : "Confirming…"}
              </>
            ) : withdraw.step === "success" ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Done
              </>
            ) : withdraw.step === "error" ? (
              <>
                <XCircle className="w-4 h-4" /> Retry
              </>
            ) : (
              <>Withdraw all to wallet</>
            )}
          </button>
        </div>
      )}

      {lockedRows.length > 0 && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs min-w-0">
            <div className="font-semibold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Locked — end the rental first
            </div>
            <div className="text-muted-foreground break-words">
              <span className="text-foreground font-medium">{lockedSummary}</span>
              <span className="ml-1">
                · across {lockedGotchiCount} rented/listed gotchi{lockedGotchiCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="text-[10px] mt-0.5">
              `transferEscrow` reverts while a gotchi is in an active lending.
              Connect the <span className="font-mono">borrower</span> wallet and use{" "}
              <span className="font-medium">"Return early &amp; flush alch"</span> on the
              Borrowing tab to end each rental — the gotchis unlock, then come back here
              with the lender wallet to sweep.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
