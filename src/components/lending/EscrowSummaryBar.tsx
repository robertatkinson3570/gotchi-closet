import { useEffect, useState } from "react";
import { Coins, Loader2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useAccount } from "wagmi";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
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

  // Only sweep gotchis that are NOT in an active lending — anything with
  // lending state would revert via onlyUnlocked. The fetcher returns a
  // `lending` field that's the listing id (>0 when active).
  const unlockedIds: number[] = [];
  for (const g of gotchis ?? []) {
    const lending = Number((g as any).lending ?? 0);
    if (lending > 0) continue;
    const id = Number((g as any).gotchiId ?? (g as any).id);
    if (Number.isFinite(id)) unlockedIds.push(id);
  }

  const { balances, totalsBySymbol, isLoading, refetch } = useEscrowBalances(unlockedIds);
  const withdraw = useBatchTransferEscrow();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (withdraw.step === "success") {
      toast({
        title: "Alchemica withdrawn",
        description: `${balances.length} escrow transfer${balances.length === 1 ? "" : "s"} swept to your wallet.`,
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

  const totalRows = balances.length;
  const totalGotchis = new Set(balances.map((b) => b.tokenId)).size;
  const summary = ["FUD", "FOMO", "ALPHA", "KEK"]
    .map((sym) => {
      const t = totalsBySymbol[sym];
      if (!t || t === BigInt(0)) return null;
      return `${formatAlch(t)} ${sym}`;
    })
    .filter(Boolean)
    .join(" · ");

  const busy = withdraw.step === "submitting" || withdraw.step === "confirming" || confirming;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            Alchemica sitting in escrow
          </div>
          <div className="text-[11px] text-muted-foreground break-words">
            <span className="text-foreground font-medium">{summary}</span>
            <span className="ml-1">
              across {totalGotchis} unlocked gotchi{totalGotchis === 1 ? "" : "s"} ({totalRows} balance row{totalRows === 1 ? "" : "s"})
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!address) return;
          setConfirming(true);
          withdraw.send(balances, address as `0x${string}`);
        }}
        disabled={busy || !isOnBase}
        title={!isOnBase ? "Switch to Base to withdraw" : "Sweep every escrow balance to your wallet in one tx"}
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
  );
}
