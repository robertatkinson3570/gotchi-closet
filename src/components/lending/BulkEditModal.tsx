import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Coins,
  Clock,
  Lock,
  Zap,
  XCircle,
  ArrowRight,
} from "lucide-react";
import {
  useBatchCancelLending,
  useBatchAddListing,
  type ListingParams,
} from "@/hooks/useLendingTx";
import { useWhitelistsForAddress } from "@/hooks/useWhitelists";
import { useToast } from "@/ui/use-toast";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { ghstFromWei, ghstToWei } from "@/lib/lending/transform";
import { ALCHEMICA_TOKEN_ADDRESSES_BASE } from "@/lib/lending/contracts";
import type { Lending } from "@/lib/lending/types";

type Props = {
  // Listings being edited. Caller has already filtered to the connected
  // wallet's available (not-yet-rented) listings.
  listings: Lending[];
  onClose: () => void;
};

const ZERO = "0x0000000000000000000000000000000000000000";

type FieldMode = "keep" | "set";

export function BulkEditModal({ listings, onClose }: Props) {
  const { address } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const ownerAddr = (address || "").toLowerCase();
  const myWhitelists = useWhitelistsForAddress(ownerAddr);

  const cancel = useBatchCancelLending();
  const add = useBatchAddListing();

  // Two-phase auto-chain: idle → cancelling → relisting → done. We watch
  // cancel.step and trigger add.send() the moment it succeeds, so the user
  // signs two prompts back-to-back without a manual "next" click.
  const [phase, setPhase] = useState<
    "idle" | "cancelling" | "relisting" | "done" | "error"
  >("idle");

  // Field-by-field mode: "keep" = leave each listing's current value untouched,
  // "set" = override with the value entered below. Defaults to "keep" when
  // values differ across selections, "set" when they all match.
  const initial = useMemo(() => {
    const periods = [...new Set(listings.map((l) => l.period))];
    const upfronts = [...new Set(listings.map((l) => l.upfrontCost))];
    const splitOwners = [...new Set(listings.map((l) => l.splitOwner))];
    const whitelists = [...new Set(listings.map((l) => l.whitelistId ?? "0"))];
    const channellings = [...new Set(listings.map((l) => l.channellingAllowed))];
    return {
      period: periods.length === 1 ? periods[0] : 7 * 86400,
      periodMode: (periods.length === 1 ? "set" : "keep") as FieldMode,
      upfrontGhst:
        upfronts.length === 1 ? String(Math.round(ghstFromWei(upfronts[0]))) : "",
      upfrontMode: (upfronts.length === 1 ? "set" : "keep") as FieldMode,
      splitOwner: splitOwners.length === 1 ? splitOwners[0] : 20,
      splitMode: (splitOwners.length === 1 ? "set" : "keep") as FieldMode,
      whitelistId: whitelists.length === 1 ? whitelists[0] || "0" : "0",
      whitelistMode: (whitelists.length === 1 ? "set" : "keep") as FieldMode,
      channelling: channellings.length === 1 ? channellings[0] : true,
      channellingMode: (channellings.length === 1 ? "set" : "keep") as FieldMode,
    };
  }, [listings]);

  const [periodUnit, setPeriodUnit] = useState<"days" | "hours">("days");
  const [periodValue, setPeriodValue] = useState<number>(
    Math.max(1, Math.round(initial.period / 86400))
  );
  const [periodMode, setPeriodMode] = useState<FieldMode>(initial.periodMode);
  const periodSec = periodUnit === "days" ? periodValue * 86400 : periodValue * 3600;

  const [upfrontGhst, setUpfrontGhst] = useState<string>(initial.upfrontGhst);
  const [upfrontMode, setUpfrontMode] = useState<FieldMode>(initial.upfrontMode);

  const [splitOwner, setSplitOwner] = useState<number>(initial.splitOwner);
  const [splitMode, setSplitMode] = useState<FieldMode>(initial.splitMode);

  const [whitelistId, setWhitelistId] = useState<string>(initial.whitelistId);
  const [whitelistMode, setWhitelistMode] = useState<FieldMode>(initial.whitelistMode);

  const [channelling, setChannelling] = useState<boolean>(initial.channelling);
  const [channellingMode, setChannellingMode] = useState<FieldMode>(initial.channellingMode);

  // Esc to close + body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const eligible = useMemo(
    () =>
      listings.filter(
        (l) =>
          ownerAddr &&
          l.lender.toLowerCase() === ownerAddr &&
          l.originalOwner.toLowerCase() === ownerAddr
      ),
    [listings, ownerAddr]
  );
  const skipped = listings.length - eligible.length;

  const newTuples = useMemo<ListingParams[]>(() => {
    return eligible.map((l) => {
      const upfrontWei =
        upfrontMode === "set"
          ? ghstToWei(Number(upfrontGhst) || 0)
          : BigInt(l.upfrontCost);
      const period = periodMode === "set" ? periodSec : l.period;
      const owner = splitMode === "set" ? splitOwner : l.splitOwner;
      const borrower = 100 - owner;
      const wl = whitelistMode === "set" ? Number(whitelistId) || 0 : Number(l.whitelistId) || 0;
      const ch = channellingMode === "set" ? channelling : l.channellingAllowed;
      return {
        tokenId: Number(l.gotchiTokenId),
        initialCostWei: upfrontWei,
        periodSeconds: period,
        splitOwner: owner,
        splitBorrower: borrower,
        splitOther: 0,
        originalOwner: (address ?? ZERO) as `0x${string}`,
        thirdParty: ZERO as `0x${string}`,
        whitelistId: wl,
        // Declare alchemica so future claims pay out per splits.
        revenueTokens: ALCHEMICA_TOKEN_ADDRESSES_BASE,
        permissions: ch ? BigInt(0x101) : BigInt(0),
      };
    });
  }, [
    eligible,
    upfrontMode,
    upfrontGhst,
    periodMode,
    periodSec,
    splitMode,
    splitOwner,
    whitelistMode,
    whitelistId,
    channellingMode,
    channelling,
    address,
  ]);

  const handleStart = () => {
    if (!address || eligible.length === 0) return;
    setPhase("cancelling");
    cancel.send(eligible.map((l) => Number(l.gotchiTokenId)));
  };

  // After cancel succeeds, fire the add tx. Wait a beat so wagmi resets state
  // cleanly between two writeContract calls in the same hook tree.
  useEffect(() => {
    if (phase === "cancelling" && cancel.step === "success") {
      setPhase("relisting");
      const t = setTimeout(() => add.send(newTuples), 250);
      return () => clearTimeout(t);
    }
    if (phase === "cancelling" && cancel.step === "error") {
      setPhase("error");
      toast({
        title: "Bulk cancel failed",
        description: cancel.errorMsg?.slice(0, 140) || "Tx reverted.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel.step, phase]);

  useEffect(() => {
    if (phase === "relisting" && add.step === "success") {
      setPhase("done");
      toast({
        title: "Bulk edit complete",
        description: `Re-listed ${eligible.length} gotchi${eligible.length === 1 ? "" : "s"} with new terms.`,
      });
      const t = setTimeout(onClose, 2000);
      return () => clearTimeout(t);
    }
    if (phase === "relisting" && add.step === "error") {
      setPhase("error");
      toast({
        title: "Re-list failed",
        description:
          (add.errorMsg?.slice(0, 140) || "Tx reverted.") +
          ". Listings were cancelled. Re-list manually from /lending/me.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add.step, phase]);

  const busy = phase === "cancelling" || phase === "relisting";
  const splitsValid = splitOwner >= 0 && splitOwner <= 100;
  const periodValid = periodSec >= 3600 && periodSec <= 30 * 86400;
  const formValid =
    Boolean(address) && eligible.length > 0 && splitsValid && periodValid;

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Bulk edit {eligible.length} listing{eligible.length === 1 ? "" : "s"}
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

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="font-medium mb-1">Two transactions, signed back-to-back</div>
            <div className="text-muted-foreground">
              The lending contract has no edit op, so we{" "}
              <span className="text-foreground font-medium">cancel</span> the
              selected listings in one tx, then{" "}
              <span className="text-foreground font-medium">re-list</span> them
              with the new terms in a second tx. Fields set to{" "}
              <span className="text-foreground font-medium">Keep current</span>{" "}
              are preserved per-listing.
            </div>
          </div>

          {skipped > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
              {skipped} of {listings.length} skipped, owned by a different
              wallet than the connected one. Switch wallets to edit those.
            </div>
          )}

          <FieldSection
            title="Rental period"
            icon={<Clock className="w-3.5 h-3.5" />}
            mode={periodMode}
            setMode={setPeriodMode}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-md border border-border/40 bg-background/40 p-0.5">
                {(["days", "hours"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      if (u === periodUnit) return;
                      if (u === "hours") {
                        setPeriodValue(Math.max(1, Math.min(720, Math.round(periodValue * 24))));
                      } else {
                        setPeriodValue(Math.max(1, Math.min(30, Math.max(1, Math.round(periodValue / 24)))));
                      }
                      setPeriodUnit(u);
                    }}
                    disabled={periodMode !== "set"}
                    className={`px-2.5 h-7 rounded text-xs font-medium transition-colors ${
                      periodUnit === u ? "bg-primary/15 text-primary" : "text-muted-foreground"
                    } disabled:opacity-50`}
                  >
                    {u === "days" ? "Days" : "Hours"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={periodUnit === "days" ? 30 : 720}
                value={periodValue}
                disabled={periodMode !== "set"}
                onChange={(e) => {
                  const max = periodUnit === "days" ? 30 : 720;
                  setPeriodValue(Math.max(1, Math.min(max, Number(e.target.value) || 1)));
                }}
                className="w-24 h-9 px-2 rounded border border-border/40 bg-background/70 text-sm disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground">
                max {periodUnit === "days" ? "30 days" : "720 hours"}
              </span>
            </div>
          </FieldSection>

          <FieldSection
            title="Upfront cost (GHST)"
            icon={<Coins className="w-3.5 h-3.5" />}
            mode={upfrontMode}
            setMode={setUpfrontMode}
          >
            <input
              type="number"
              min={0}
              step="any"
              value={upfrontGhst}
              disabled={upfrontMode !== "set"}
              onChange={(e) => setUpfrontGhst(e.target.value)}
              placeholder="e.g. 50"
              className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm disabled:opacity-50"
            />
          </FieldSection>

          <FieldSection
            title="Lender / borrower split"
            mode={splitMode}
            setMode={setSplitMode}
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground">Lender %</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={splitOwner}
                  disabled={splitMode !== "set"}
                  onChange={(e) =>
                    setSplitOwner(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="w-full h-8 px-2 rounded border border-border/40 bg-background/70 text-sm text-right disabled:opacity-50"
                />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Borrower %</div>
                <input
                  type="number"
                  value={100 - splitOwner}
                  disabled
                  className="w-full h-8 px-2 rounded border border-border/40 bg-background/70 text-sm text-right opacity-60"
                />
              </div>
            </div>
          </FieldSection>

          <FieldSection
            title="Whitelist"
            icon={<Lock className="w-3.5 h-3.5" />}
            mode={whitelistMode}
            setMode={setWhitelistMode}
          >
            <select
              value={whitelistId}
              disabled={whitelistMode !== "set"}
              onChange={(e) => setWhitelistId(e.target.value)}
              className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm disabled:opacity-50"
            >
              <option value="0">Open (any borrower)</option>
              {myWhitelists.asOwner.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || `Whitelist #${w.id}`} (id {w.id})
                </option>
              ))}
            </select>
          </FieldSection>

          <FieldSection
            title="Channelling"
            icon={<Zap className="w-3.5 h-3.5" />}
            mode={channellingMode}
            setMode={setChannellingMode}
          >
            <label className={`flex items-center gap-2 text-sm ${channellingMode !== "set" ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={channelling}
                disabled={channellingMode !== "set"}
                onChange={(e) => setChannelling(e.target.checked)}
                className="w-4 h-4"
              />
              Allow borrower to channel alchemica
            </label>
          </FieldSection>

          <div className="border-t border-border/30 pt-4 space-y-2">
            <PhaseStatus
              phase={phase}
              cancelStep={cancel.step}
              addStep={add.step}
              cancelErr={cancel.errorMsg}
              addErr={add.errorMsg}
              count={eligible.length}
            />

            {phase === "idle" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={!formValid}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
              >
                Cancel & re-list {eligible.length} listing{eligible.length === 1 ? "" : "s"}
                <ArrowRight className="w-4 h-4" />
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

function FieldSection({
  title,
  icon,
  mode,
  setMode,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  mode: FieldMode;
  setMode: (m: FieldMode) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          {icon}
          <span>{title}</span>
        </div>
        <div className="inline-flex rounded-md border border-border/40 bg-background/40 p-0.5">
          {(["keep", "set"] as FieldMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 h-6 rounded text-[10px] font-medium transition-colors ${
                mode === m
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "keep" ? "Keep current" : "Override"}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function PhaseStatus({
  phase,
  cancelStep,
  addStep,
  cancelErr,
  addErr,
  count,
}: {
  phase: "idle" | "cancelling" | "relisting" | "done" | "error";
  cancelStep: string;
  addStep: string;
  cancelErr: string | null;
  addErr: string | null;
  count: number;
}) {
  if (phase === "idle") return null;

  return (
    <div className="space-y-1.5">
      <Step
        label={`Step 1: Cancel ${count} listing${count === 1 ? "" : "s"}`}
        state={
          cancelStep === "success"
            ? "ok"
            : cancelStep === "error"
            ? "fail"
            : phase === "cancelling"
            ? "busy"
            : "queued"
        }
        sub={
          cancelStep === "submitting"
            ? "Confirm in wallet…"
            : cancelStep === "confirming"
            ? "Confirming on-chain…"
            : cancelStep === "error"
            ? cancelErr?.slice(0, 140) ?? "Reverted"
            : undefined
        }
      />
      <Step
        label={`Step 2: Re-list with new terms`}
        state={
          addStep === "success"
            ? "ok"
            : addStep === "error"
            ? "fail"
            : phase === "relisting"
            ? "busy"
            : "queued"
        }
        sub={
          addStep === "submitting"
            ? "Confirm in wallet…"
            : addStep === "confirming"
            ? "Confirming on-chain…"
            : addStep === "error"
            ? addErr?.slice(0, 140) ?? "Reverted"
            : undefined
        }
      />
    </div>
  );
}

function Step({
  label,
  state,
  sub,
}: {
  label: string;
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
      <div className="w-4 h-4 rounded-full border border-border/40" />
    );
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/30 bg-card/40 p-2 text-sm">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={state === "queued" ? "text-muted-foreground" : ""}>{label}</div>
        {sub && (
          <div className={`text-[10px] mt-0.5 ${state === "fail" ? "text-destructive" : "text-muted-foreground"} break-words`}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
