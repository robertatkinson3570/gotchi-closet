import { useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, StopCircle, ArrowRightLeft } from "lucide-react";
import { useAccount } from "wagmi";
import { useAddressState } from "@/lib/addressState";
import { useToast } from "@/ui/use-toast";
import { useClaimAndEndLending } from "@/hooks/useLendingTx";

type Status = "available" | "active" | "completed" | "cancelled";

type Props = {
  borrower: string | null;
  gotchiTokenId: string;
  status: Status;
  // Used to label the action; the borrower can return any time during an active rental.
  timeAgreed?: number;
  periodSeconds?: number;
  onAfterTx?: () => void;
};

/**
 * Buttons for the wallet that is currently borrowing the gotchi.
 * Borrower can call `claimAndEndGotchiLending` at any time during an active rental
 * to return the gotchi early. The protocol settles all splits as configured.
 */
export function BorrowerActions({
  borrower,
  gotchiTokenId,
  status,
  timeAgreed,
  periodSeconds,
  onAfterTx,
}: Props) {
  const { address: connected } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const tokenIdNum = Number(gotchiTokenId);

  const end = useClaimAndEndLending();

  useEffect(() => {
    if (end.step === "success") {
      toast({
        title: "Rental returned",
        description: `#${gotchiTokenId} returned to lender; your rev-split has been settled.`,
      });
      onAfterTx?.();
    }
  }, [end.step, toast, gotchiTokenId, onAfterTx]);

  useEffect(() => {
    if (end.errorMsg) {
      toast({
        title: "Return failed",
        description:
          end.errorMsg.length > 120 ? end.errorMsg.slice(0, 120) + "…" : end.errorMsg,
        variant: "destructive",
      });
    }
  }, [end.errorMsg, toast]);

  // Only show for the wallet currently borrowing this gotchi
  if (
    status !== "active" ||
    !borrower ||
    !connected ||
    connected.toLowerCase() !== borrower.toLowerCase()
  ) {
    return null;
  }

  if (!isOnBase) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400 inline-flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Switch to Base to return this rental
      </div>
    );
  }

  if (end.step === "success") {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Returned · earnings settled
      </div>
    );
  }

  const periodEnd = (timeAgreed ?? 0) + (periodSeconds ?? 0);
  const remainingSec = Math.max(0, periodEnd - Math.floor(Date.now() / 1000));
  const remainingDays = Math.round((remainingSec / 86400) * 10) / 10;
  const busy = end.step === "submitting" || end.step === "confirming";

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
      <div className="text-sm font-medium text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4" />
        You're borrowing this gotchi
        {remainingSec > 0 && (
          <span className="text-[10px] uppercase tracking-wide bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">
            {remainingDays}d remaining
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => end.send(tokenIdNum)}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 disabled:opacity-50 text-sm font-semibold text-destructive transition-colors"
        data-testid="borrower-return-btn"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {end.step === "submitting" ? "Submitting…" : "Confirming…"}
          </>
        ) : (
          <>
            <StopCircle className="w-4 h-4" />
            Return gotchi early
          </>
        )}
      </button>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Returning early sends the gotchi back to its owner and settles your rev-split share of any
        accumulated earnings (channelling alchemica, tournament prizes if claimed, etc).
        The {Math.round((periodSeconds ?? 0) / 86400)}-day period is forfeited.
      </p>
    </div>
  );
}
