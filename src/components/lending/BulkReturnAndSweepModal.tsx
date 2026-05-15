import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  StopCircle,
  Coins,
} from "lucide-react";
import { useBatchClaimAndEndLending } from "@/hooks/useLendingTx";
import { useEscrowBalances, useBatchTransferEscrow } from "@/hooks/useEscrowWithdraw";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";

type Rental = {
  id: string;
  gotchiTokenId: string;
  // Lender = original owner = the wallet that will own the gotchi (and its
  // escrow) once the rental ends and the gotchi is unlocked. transferEscrow
  // must be called from this address.
  lender: string;
};

type Props = {
  rentals: Rental[];
  onClose: () => void;
};

const DECIMALS = BigInt(10) ** BigInt(18);

function formatAlch(amount: bigint): string {
  const whole = amount / DECIMALS;
  const frac = amount % DECIMALS;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = ((frac * BigInt(10000)) / DECIMALS)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/**
 * Two-phase recovery flow used when existing listings were created with
 * empty revenueTokens (which makes claimGotchiLending a no-op mid-rental):
 *
 *   Phase 1 — Borrower wallet signs `batchClaimAndEndGotchiLending`.
 *             Rentals end, gotchis return to lender, escrow becomes
 *             addressable by the lender wallet.
 *
 *   Phase 2 — User switches to the lender wallet. We refetch escrow
 *             balances (they were just made readable), then the lender
 *             signs `batchTransferEscrow` to sweep every non-zero
 *             alchemica balance into their own wallet.
 *
 * For self-rental users (both wallets controlled by the same human) this
 * is the closest we can get to "one click and I get my alch" while the
 * broken listings remain on-chain. Future listings created after the
 * revenueTokens fix won't need this flow.
 */
export function BulkReturnAndSweepModal({ rentals, onClose }: Props) {
  const { address } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();

  // All rentals in the selection should share the same lender (the connected
  // user as borrower can only rent from one lender at a time per listing;
  // for self-rental setups they're all from the cold wallet).
  const lenderAddr = useMemo(() => {
    const set = new Set(rentals.map((r) => r.lender.toLowerCase()));
    return set.size === 1 ? Array.from(set)[0] : "";
  }, [rentals]);

  const claimEnd = useBatchClaimAndEndLending();
  const sweep = useBatchTransferEscrow();

  type Phase = "idle" | "ending" | "switch-wallet" | "sweeping" | "done" | "error";
  const [phase, setPhase] = useState<Phase>("idle");

  const tokenIds = useMemo(
    () => rentals.map((r) => Number(r.gotchiTokenId)),
    [rentals]
  );

  // We only fetch escrow balances after the rental-end tx confirms — before
  // that the gotchis are locked and the lender wallet can't sweep anyway.
  // We also don't want to surface stale pre-end balances and confuse the
  // user when they switch wallets.
  const escrowEnabled = phase === "switch-wallet" || phase === "sweeping" || phase === "done";
  const { balances, refetch } = useEscrowBalances(escrowEnabled ? tokenIds : []);

  // Esc closes any time except during an in-flight tx. The chain doesn't
  // care if the modal closes; the txs themselves continue on-chain.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "ending" || phase === "sweeping") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, phase]);

  const handleStart = () => {
    if (rentals.length === 0) return;
    setPhase("ending");
    claimEnd.send(tokenIds);
  };

  // Phase 1 → 2: rental-end succeeded. Move user to wallet-switch state and
  // refetch escrow balances so the sweep step has fresh on-chain data.
  useEffect(() => {
    if (phase === "ending" && claimEnd.step === "success") {
      setPhase("switch-wallet");
      // Brief delay so the subgraph has a chance to reflect the ended state.
      setTimeout(() => refetch(), 1000);
    }
    if (phase === "ending" && claimEnd.step === "error") {
      setPhase("error");
      toast({
        title: "Return-rental tx failed",
        description: claimEnd.errorMsg?.slice(0, 160) ?? "Tx reverted.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimEnd.step, phase]);

  // Auto-poll escrow balances during the switch-wallet phase. Multicall is
  // a view call so this is cheap (one RPC per tick), and it covers the case
  // where the rental-end tx confirmed but the on-chain state hadn't yet
  // propagated to the connected RPC at the time of the first refetch.
  // Stops the moment we have any non-zero balance OR phase advances.
  useEffect(() => {
    if (phase !== "switch-wallet") return;
    if (balances.length > 0) return;
    const id = setInterval(() => refetch(), 3_000);
    return () => clearInterval(id);
  }, [phase, balances.length, refetch]);

  // Whether the connected wallet matches the lender (= can sign sweep tx).
  // We surface this in the UI rather than auto-firing on detection because
  // some wallets (Rabby, some MM versions) don't emit accountsChanged
  // reliably on user-initiated switches — auto-fire would silently miss.
  const onLenderWallet =
    Boolean(address) && address?.toLowerCase() === lenderAddr;

  const handleSweep = () => {
    if (!onLenderWallet || balances.length === 0) return;
    setPhase("sweeping");
    sweep.send(balances, address as `0x${string}`);
  };

  useEffect(() => {
    if (phase === "sweeping" && sweep.step === "success") {
      setPhase("done");
      toast({
        title: "Recovery complete",
        description: `Ended ${rentals.length} rental${rentals.length === 1 ? "" : "s"} and swept ${balances.length} escrow balance${balances.length === 1 ? "" : "s"} to your wallet.`,
      });
    }
    if (phase === "sweeping" && sweep.step === "error") {
      setPhase("error");
      toast({
        title: "Escrow sweep failed",
        description:
          (sweep.errorMsg?.slice(0, 160) ?? "Tx reverted.") +
          " — Rentals already ended; you can sweep manually from the escrow bar.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweep.step, phase]);

  const totalsBySymbol = useMemo(() => {
    const t: Record<string, bigint> = {};
    for (const b of balances) t[b.symbol] = (t[b.symbol] ?? BigInt(0)) + b.amount;
    return t;
  }, [balances]);

  const summary = ["FUD", "FOMO", "ALPHA", "KEK"]
    .map((sym) => {
      const v = totalsBySymbol[sym];
      if (!v || v === BigInt(0)) return null;
      return `${formatAlch(v)} ${sym}`;
    })
    .filter(Boolean)
    .join(" · ");

  const busy =
    phase === "ending" ||
    phase === "sweeping" ||
    claimEnd.step === "submitting" ||
    claimEnd.step === "confirming" ||
    sweep.step === "submitting" ||
    sweep.step === "confirming";

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Return {rentals.length} rental{rentals.length === 1 ? "" : "s"} & sweep alch
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isOnBase && address && (
          <div className="mx-5 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-center justify-between">
            <span className="text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Wrong network
            </span>
            <button
              type="button"
              onClick={() => switchToBaseChain().catch(() => {})}
              className="h-8 px-3 rounded-md bg-amber-500 text-amber-950 text-xs font-semibold"
            >
              Switch to Base
            </button>
          </div>
        )}

        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="font-medium mb-1">Two txs across two wallets</div>
            <div className="text-muted-foreground leading-relaxed">
              Your existing listings were created with empty revenueTokens, so
              mid-rental claim can't pay out. Recovery is:{" "}
              <span className="text-foreground font-medium">end rentals</span> from this
              (borrower) wallet, then <span className="text-foreground font-medium">sweep escrow</span>
              {" "}from the lender wallet. The modal walks both signatures.
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Lender: <span className="font-mono">{lenderAddr.slice(0, 6)}…{lenderAddr.slice(-4)}</span>
            </div>
          </div>

          <PhaseRow
            n={1}
            title={`End ${rentals.length} rental${rentals.length === 1 ? "" : "s"} (borrower wallet)`}
            state={
              phase === "ending"
                ? "busy"
                : claimEnd.step === "success"
                ? "ok"
                : claimEnd.step === "error"
                ? "fail"
                : phase === "idle"
                ? "queued"
                : "ok"
            }
            sub={
              claimEnd.step === "submitting"
                ? "Sign in wallet…"
                : claimEnd.step === "confirming"
                ? "Confirming on-chain…"
                : claimEnd.step === "error"
                ? claimEnd.errorMsg?.slice(0, 140)
                : undefined
            }
          />

          <PhaseRow
            n={2}
            title="Switch to lender wallet"
            state={
              phase === "switch-wallet"
                ? onLenderWallet
                  ? "ok"
                  : "busy"
                : phase === "sweeping" || phase === "done"
                ? "ok"
                : "queued"
            }
            sub={
              phase === "switch-wallet" && !onLenderWallet
                ? `Open your wallet UI and switch to the lender ${lenderAddr.slice(0, 6)}…${lenderAddr.slice(-4)}. Connected: ${address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "(disconnected)"}.`
                : phase === "switch-wallet" && onLenderWallet && balances.length === 0
                ? "Wallet detected. Loading escrow balances…"
                : phase === "switch-wallet" && onLenderWallet
                ? "Wallet detected — click Sweep below to fire the second tx."
                : undefined
            }
          />

          <PhaseRow
            n={3}
            title={`Sweep escrow — ${summary || "no balances yet"}`}
            state={
              phase === "sweeping"
                ? "busy"
                : sweep.step === "success"
                ? "ok"
                : sweep.step === "error"
                ? "fail"
                : "queued"
            }
            sub={
              sweep.step === "submitting"
                ? "Sign in wallet…"
                : sweep.step === "confirming"
                ? "Confirming on-chain…"
                : sweep.step === "error"
                ? sweep.errorMsg?.slice(0, 140)
                : undefined
            }
          />

          <div className="border-t border-border/30 pt-3 flex items-center justify-between gap-2">
            {phase === "idle" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={rentals.length === 0}
                data-testid="return-and-sweep-start"
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
              >
                <StopCircle className="w-4 h-4" />
                Return {rentals.length} & sweep alch
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {phase === "switch-wallet" && (
              <button
                type="button"
                onClick={handleSweep}
                disabled={!onLenderWallet || balances.length === 0 || !isOnBase}
                data-testid="return-and-sweep-fire-sweep"
                title={
                  !onLenderWallet
                    ? `Switch your wallet to the lender ${lenderAddr.slice(0, 6)}…${lenderAddr.slice(-4)} first.`
                    : balances.length === 0
                    ? "Loading escrow balances — give it a few seconds, then click."
                    : !isOnBase
                    ? "Switch your wallet to Base."
                    : "Fire the batchTransferEscrow tx now."
                }
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
              >
                <Coins className="w-4 h-4" />
                {!onLenderWallet
                  ? `Waiting for ${lenderAddr.slice(0, 6)}…${lenderAddr.slice(-4)}…`
                  : balances.length === 0
                  ? "Loading escrow…"
                  : `Sweep ${balances.length} balance${balances.length === 1 ? "" : "s"} now`}
              </button>
            )}
            {phase === "done" && (
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-md bg-green-500/15 text-green-600 dark:text-green-400 font-semibold text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Done — alch in your wallet
              </button>
            )}
            {phase === "error" && (
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-md border border-border/40 hover:bg-muted/50 text-sm"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function PhaseRow({
  n,
  title,
  state,
  sub,
}: {
  n: number;
  title: string;
  state: "queued" | "busy" | "ok" | "fail";
  sub?: string;
}) {
  const icon =
    state === "ok" ? (
      <CheckCircle2 className="w-4 h-4 text-green-500" />
    ) : state === "fail" ? (
      <XCircle className="w-4 h-4 text-destructive" />
    ) : state === "busy" ? (
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
    ) : (
      <Coins className="w-4 h-4 text-muted-foreground/50" />
    );
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/30 bg-card/40 p-2.5 text-sm">
      <div className="text-[10px] font-mono text-muted-foreground w-4 mt-0.5">
        {n}.
      </div>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={state === "queued" ? "text-muted-foreground" : ""}>{title}</div>
        {sub && (
          <div
            className={`text-[10px] mt-0.5 leading-relaxed break-words ${
              state === "fail" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
