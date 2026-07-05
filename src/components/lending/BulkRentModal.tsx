import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  HandCoins,
} from "lucide-react";
import { useSequentialAgreeLending } from "@/hooks/useSequentialAgreeLending";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { formatGhst, formatPeriod } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

type Props = {
  // Listings the connected wallet is eligible to agree to. Caller has
  // already filtered (open lendings or whitelist membership confirmed)
  // and the user has selected the subset they want to rent.
  listings: Lending[];
  onClose: () => void;
};

/**
 * Sequential bulk-rent. Aavegotchi's diamond has no batchAgreeGotchiLending,
 * so this modal walks the user through N back-to-back wallet prompts. We
 * stop on the first failure so a single bad listing doesn't burn N gas.
 */
export function BulkRentModal({ listings, onClose }: Props) {
  const { isOnBase } = useAddressState();
  const { start, progress, running, isOnBase: hookIsOnBase } = useSequentialAgreeLending();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (running) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, running]);

  const handleStart = () => {
    start(
      listings.map((l) => ({
        listingId: Number(l.id),
        tokenId: Number(l.gotchiTokenId),
        initialCostWei: BigInt(l.upfrontCost),
        periodSeconds: l.period,
        splitOwner: l.splitOwner,
        splitBorrower: l.splitBorrower,
        splitOther: l.splitOther,
      }))
    );
  };

  const successCount = progress.results.filter((r) => r.status === "success").length;
  const failCount = progress.results.filter((r) => r.status === "error").length;

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={running ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Rent {listings.length} gotchi{listings.length === 1 ? "" : "s"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isOnBase && (
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
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <div className="font-medium mb-1">{listings.length} wallet prompts coming up</div>
            <div className="text-muted-foreground leading-relaxed">
              Aavegotchi's diamond has no `batchAgreeGotchiLending` function, so
              renting in bulk = signing one tx per gotchi. We submit them
              sequentially (each waits for the previous to confirm) so your
              wallet popup queue doesn't get jumbled. Stops on the first
              failure, you can re-open with the remaining selection to retry.
            </div>
          </div>

          {progress.total === 0 && (
            <div className="rounded-md border border-border/30 bg-card/40 p-3 text-xs space-y-1.5 max-h-[40vh] overflow-y-auto">
              {listings.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {l.gotchi?.name || "Unnamed"}{" "}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        #{l.gotchiTokenId}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      BRS {l.gotchiBRS} · {formatPeriod(l.period)} · {formatGhst(l.upfrontCost)} GHST upfront
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    L/B {l.splitOwner}/{l.splitBorrower}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {progress.total > 0 && (
            <div className="rounded-md border border-border/30 bg-card/40 p-3 max-h-[50vh] overflow-y-auto">
              <div className="text-xs text-muted-foreground mb-2">
                {progress.index + (running ? 0 : 1)} / {progress.total} processed
                {successCount > 0 && (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    · {successCount} ok
                  </span>
                )}
                {failCount > 0 && (
                  <span className="ml-2 text-destructive">· {failCount} failed</span>
                )}
              </div>
              <div className="space-y-1">
                {progress.results.map((r, i) => {
                  const matched = listings.find(
                    (l) => Number(l.id) === r.params.listingId
                  );
                  const label =
                    (matched?.gotchi?.name ?? "Unnamed") +
                    ` (#${r.params.tokenId})`;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className="mt-0.5 w-4">
                        {r.status === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : r.status === "error" ? (
                          <XCircle className="w-4 h-4 text-destructive" />
                        ) : r.status === "queued" ? (
                          <div className="w-3 h-3 rounded-full border border-border/40 mt-0.5" />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          {label}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            ·{" "}
                            {r.status === "submitting"
                              ? "Sign in wallet…"
                              : r.status === "confirming"
                              ? "Confirming…"
                              : r.status === "success"
                              ? "Rented"
                              : r.status === "error"
                              ? "Failed"
                              : "Queued"}
                          </span>
                        </div>
                        {r.status === "error" && r.error && (
                          <div className="text-[10px] text-destructive mt-0.5 break-words">
                            {r.error.slice(0, 140)}
                          </div>
                        )}
                        {r.hash && (
                          <a
                            href={`https://basescan.org/tx/${r.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline font-mono"
                          >
                            {r.hash.slice(0, 10)}…{r.hash.slice(-6)} ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-border/30 pt-3 flex items-center justify-between gap-2">
            {!running && progress.total === 0 && (
              <button
                type="button"
                onClick={handleStart}
                disabled={listings.length === 0 || !hookIsOnBase}
                data-testid="bulk-rent-start"
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
              >
                <HandCoins className="w-4 h-4" />
                Start renting {listings.length} ({listings.length} wallet prompts)
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {progress.done && successCount > 0 && (
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-md bg-green-500/15 text-green-600 dark:text-green-400 font-semibold text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Done: rented {successCount} of {progress.total}
              </button>
            )}
            {progress.done && successCount === 0 && (
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-md border border-border/40 hover:bg-muted/50 text-sm"
              >
                Close
              </button>
            )}
            {running && (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 w-full justify-center h-11">
                <Loader2 className="w-4 h-4 animate-spin" />
                Working on #{progress.current?.tokenId} ({progress.index + 1}/{progress.total})…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
