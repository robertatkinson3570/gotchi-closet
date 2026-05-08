import { useEffect } from "react";
import { Loader2, XCircle, CheckCircle2, StopCircle, AlertCircle, HandCoins, RotateCw } from "lucide-react";
import { useAccount } from "wagmi";
import { useAddressState } from "@/lib/addressState";
import { useToast } from "@/ui/use-toast";
import {
  useCancelLending,
  useClaimAndEndLending,
  useClaimLending,
  useClaimAndEndAndRelistLending,
} from "@/hooks/useLendingTx";

type Status = "available" | "active" | "completed" | "cancelled";

type Props = {
  lender: string;
  gotchiTokenId: string;
  status: Status;
  // For active rentals: when did they agree, what's the period? Used to gate "End rental".
  timeAgreed?: number;
  periodSeconds?: number;
  onAfterTx?: () => void;
};

export function OwnerActions({
  lender,
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

  const cancel = useCancelLending();
  const claimEnd = useClaimAndEndLending();
  const claim = useClaimLending();
  const claimEndRelist = useClaimAndEndAndRelistLending();

  // success toasts
  useEffect(() => {
    if (cancel.step === "success") {
      toast({ title: "Listing cancelled", description: `#${gotchiTokenId} is back in your wallet.` });
      onAfterTx?.();
    }
  }, [cancel.step, toast, gotchiTokenId, onAfterTx]);

  useEffect(() => {
    if (claimEnd.step === "success") {
      toast({ title: "Rental ended", description: `#${gotchiTokenId} returned and earnings claimed.` });
      onAfterTx?.();
    }
  }, [claimEnd.step, toast, gotchiTokenId, onAfterTx]);

  useEffect(() => {
    if (claim.step === "success") {
      toast({ title: "Earnings claimed", description: `Channelling/income for #${gotchiTokenId} sent to your wallet.` });
      onAfterTx?.();
    }
  }, [claim.step, toast, gotchiTokenId, onAfterTx]);

  useEffect(() => {
    if (claimEndRelist.step === "success") {
      toast({
        title: "Auto-relisted",
        description: `#${gotchiTokenId} claimed, ended, and re-listed with the same terms.`,
      });
      onAfterTx?.();
    }
  }, [claimEndRelist.step, toast, gotchiTokenId, onAfterTx]);

  // error toasts
  useEffect(() => {
    const err = cancel.errorMsg || claimEnd.errorMsg || claim.errorMsg || claimEndRelist.errorMsg;
    if (err) {
      toast({
        title: "Transaction failed",
        description: err.length > 120 ? err.slice(0, 120) + "…" : err,
        variant: "destructive",
      });
    }
  }, [cancel.errorMsg, claimEnd.errorMsg, claim.errorMsg, claimEndRelist.errorMsg, toast]);

  if (!connected || connected.toLowerCase() !== lender.toLowerCase()) {
    return null;
  }

  if (!isOnBase) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Switch to Base to manage this listing
      </div>
    );
  }

  // success state shows confirmation card
  if (cancel.step === "success" || claimEnd.step === "success") {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="w-4 h-4" />
        {cancel.step === "success" ? "Listing cancelled" : "Rental ended & claimed"}
      </div>
    );
  }

  if (status === "available") {
    const busy = cancel.step === "submitting" || cancel.step === "confirming";
    return (
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
        <div className="text-sm font-medium text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-2">
          <HandCoins className="w-4 h-4" />
          You own this listing
        </div>
        <button
          type="button"
          onClick={() => cancel.send(tokenIdNum)}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 disabled:opacity-60 text-sm font-semibold text-destructive transition-colors"
          data-testid="owner-cancel-btn"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {cancel.step === "submitting" ? "Submitting…" : "Confirming…"}
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              Cancel listing
            </>
          )}
        </button>
      </div>
    );
  }

  if (status === "active") {
    const periodEnd = (timeAgreed ?? 0) + (periodSeconds ?? 0);
    const periodIsOver = Date.now() / 1000 >= periodEnd;
    const claimBusy = claim.step === "submitting" || claim.step === "confirming";
    const endBusy = claimEnd.step === "submitting" || claimEnd.step === "confirming";
    const relistBusy = claimEndRelist.step === "submitting" || claimEndRelist.step === "confirming";

    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <div className="text-sm font-medium text-amber-700 dark:text-amber-400 inline-flex items-center gap-2">
          <HandCoins className="w-4 h-4" />
          You're lending this gotchi
          {periodIsOver && (
            <span className="text-[10px] uppercase tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
              period over
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => claim.send(tokenIdNum)}
            disabled={claimBusy}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 disabled:opacity-60 text-sm font-medium transition-colors"
          >
            {claimBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <HandCoins className="w-4 h-4" />
            )}
            Claim earnings
          </button>
          <button
            type="button"
            onClick={() => claimEnd.send(tokenIdNum)}
            disabled={endBusy || !periodIsOver}
            title={!periodIsOver ? "You can only end after the period expires" : ""}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-destructive transition-colors"
          >
            {endBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <StopCircle className="w-4 h-4" />
            )}
            End rental
          </button>
        </div>
        <button
          type="button"
          onClick={() => claimEndRelist.send(tokenIdNum)}
          disabled={relistBusy || !periodIsOver}
          title={
            !periodIsOver
              ? "Only available after the rental period expires"
              : "Claim earnings, end the rental, and re-list with the same terms in one tx"
          }
          data-testid="owner-claim-end-relist-btn"
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-primary transition-colors"
        >
          {relistBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
          Auto claim + end + relist (same terms)
        </button>
      </div>
    );
  }

  return null;
}
