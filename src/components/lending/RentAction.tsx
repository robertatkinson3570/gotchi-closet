import { useEffect } from "react";
import { CheckCircle2, Loader2, AlertCircle, Coins, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { useRentLending } from "@/hooks/useRentLending";
import type { Lending } from "@/lib/lending/types";
import { formatGhst, formatPeriod } from "@/lib/lending/transform";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { useToast } from "@/ui/use-toast";

type Props = {
  lending: Lending;
  // Status of the lending: must be "available" to rent.
  status: "available" | "active" | "completed" | "cancelled";
  onRentSuccess?: () => void;
};

export function RentAction({ lending, status, onRentSuccess }: Props) {
  const { address: connected } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();

  const params = status === "available"
    ? {
        listingId: lending.id,
        gotchiTokenId: lending.gotchiTokenId,
        upfrontCostWei: lending.upfrontCost,
        periodSeconds: lending.period,
        splitOwner: lending.splitOwner,
        splitBorrower: lending.splitBorrower,
        splitOther: lending.splitOther,
      }
    : null;

  const rent = useRentLending(params);

  useEffect(() => {
    if (rent.step === "success") {
      toast({
        title: "Rental confirmed",
        description: `You're now renting ${lending.gotchi?.name ?? `#${lending.gotchiTokenId}`} for ${formatPeriod(lending.period)}.`,
      });
      onRentSuccess?.();
    }
  }, [rent.step, toast, lending, onRentSuccess]);

  useEffect(() => {
    if (rent.step === "error" && rent.errorMsg) {
      toast({
        title: "Transaction failed",
        description: rent.errorMsg.length > 120 ? rent.errorMsg.slice(0, 120) + "…" : rent.errorMsg,
        variant: "destructive",
      });
    }
  }, [rent.step, rent.errorMsg, toast]);

  if (status === "active") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        This gotchi is currently rented out
      </div>
    );
  }

  if (status === "completed" || status === "cancelled") {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-sm text-muted-foreground">
        This listing is no longer available ({status}).
      </div>
    );
  }

  // status === "available"
  if (!connected) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="w-4 h-4 text-primary" />
          Connect a wallet to rent
        </div>
        <ConnectButton className="w-full" />
      </div>
    );
  }

  // Can't rent your own gotchi (the diamond would revert; surface this clearly).
  // Compare against both `lender` (caller of addGotchiListing — always the owner
  // or operator) and `originalOwner` (where revenue routes) just to be safe.
  const connectedLc = connected.toLowerCase();
  const isOwnGotchi =
    lending.lender.toLowerCase() === connectedLc ||
    lending.originalOwner.toLowerCase() === connectedLc;
  if (isOwnGotchi) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-sm text-muted-foreground inline-flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        This is your own listing. You can't rent your own gotchi. Use the
        Cancel action instead.
      </div>
    );
  }

  if (!isOnBase) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4" />
          Wrong network, switch to Base
        </div>
        <button
          type="button"
          onClick={() => switchToBaseChain().catch(() => {})}
          className="w-full inline-flex items-center justify-center h-9 rounded-md bg-amber-500 hover:bg-amber-500/90 text-amber-950 text-sm font-semibold transition-colors"
        >
          Switch to Base
        </button>
      </div>
    );
  }

  const upfrontGhst = formatGhst(lending.upfrontCost);

  if (rent.step === "success") {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Rental confirmed. Gotchi is now in your custody
      </div>
    );
  }

  const needsApproval = rent.requiresApproval && !rent.hasEnoughAllowance;
  const insufficient = rent.requiresApproval && !rent.hasEnoughGhst;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Coins className="w-4 h-4 text-primary" />
          Rent this gotchi
        </div>
        <div className="text-right text-xs">
          <div className="font-semibold text-foreground">
            {upfrontGhst} GHST upfront
          </div>
          <div className="text-muted-foreground">
            for {formatPeriod(lending.period)} · borrower keeps {lending.splitBorrower}%
          </div>
        </div>
      </div>

      {rent.requiresApproval && rent.balanceGhst !== null && (
        <div className="text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Wallet balance</span>
          <span className={insufficient ? "text-destructive font-semibold" : ""}>
            {rent.balanceGhst.toFixed(2)} GHST
          </span>
        </div>
      )}

      {insufficient ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
          Not enough GHST to cover {upfrontGhst} GHST upfront cost.
        </div>
      ) : needsApproval ? (
        <button
          type="button"
          onClick={rent.sendApproval}
          disabled={rent.step === "approving"}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-sm font-semibold transition-colors"
          data-testid="rent-approve-btn"
        >
          {rent.step === "approving" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Approving GHST…
            </>
          ) : (
            <>Approve GHST (one-time)</>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={rent.sendRent}
          disabled={rent.step === "renting"}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-sm font-semibold transition-colors"
          data-testid="rent-confirm-btn"
        >
          {rent.step === "renting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming rental…
            </>
          ) : (
            <>Rent for {upfrontGhst} GHST</>
          )}
        </button>
      )}

      {rent.errorMsg && rent.step === "error" && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive break-words">
          {rent.errorMsg.length > 200
            ? rent.errorMsg.slice(0, 200) + "…"
            : rent.errorMsg}
        </div>
      )}
    </div>
  );
}
