import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, AlertCircle, Coins, Clock, Zap, Lock, Info, Sparkles, RotateCw } from "lucide-react";
import { AutoPriceModal } from "./AutoPriceModal";
import { useSetLendingOperator } from "@/hooks/useLendingTx";
import { useAccount } from "wagmi";
import { useToast } from "@/ui/use-toast";
import { useAddListing } from "@/hooks/useLendingTx";
import { useWhitelistsForAddress } from "@/hooks/useWhitelists";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { env } from "@/lib/env";

type Props = {
  gotchiTokenId: string;
  gotchiName: string | null;
  // wallet that owns this gotchi (defaults to connected wallet)
  originalOwner?: string;
  // Optional BRS w/ wearables — enables Auto-price button
  modBRS?: number;
  onClose: () => void;
  onListed?: () => void;
};

const ZERO = "0x0000000000000000000000000000000000000000";

const PERIOD_PRESETS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

export function ListLendingModal({ gotchiTokenId, gotchiName, originalOwner, modBRS, onClose, onListed }: Props) {
  const { address } = useAccount();
  const { isOnBase } = useAddressState();
  const { toast } = useToast();
  const ownerAddr = (originalOwner || address || "").toLowerCase();
  const myWhitelists = useWhitelistsForAddress(ownerAddr);

  const feeAddr = env.lendingFeeAddress.toLowerCase();
  const feePctNum = Math.max(0, Math.min(50, Number(env.lendingFeePct) || 0));
  const hasFee = Boolean(feeAddr) && feePctNum > 0;

  const [periodDays, setPeriodDays] = useState<number>(7);
  const [upfrontGhst, setUpfrontGhst] = useState<string>("");
  const [splitBorrower, setSplitBorrower] = useState<number>(hasFee ? 80 - feePctNum : 80);
  const [splitOwner, setSplitOwner] = useState<number>(20);
  const [whitelistId, setWhitelistId] = useState<string>("0");
  const [channelling, setChannelling] = useState<boolean>(true);
  const [thirdParty, setThirdParty] = useState<string>(hasFee ? feeAddr : "");
  const [splitOther, setSplitOther] = useState<number>(hasFee ? feePctNum : 0);
  const [submitted, setSubmitted] = useState(false);
  const [showAutoPrice, setShowAutoPrice] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);
  const setOperator = useSetLendingOperator();
  const autoRenewOperator = env.autoRenewOperator;
  const autoRenewAvailable = Boolean(autoRenewOperator);
  const autoRenewFeeAddr = env.autoRenewFeeAddress.toLowerCase();
  const autoRenewFeePct = Math.max(0, Math.min(20, Number(env.autoRenewFeePct) || 0));

  // When auto-renew is enabled, override third-party config to point at the service fee address.
  useEffect(() => {
    if (autoRenew && autoRenewFeeAddr && autoRenewFeePct > 0) {
      setThirdParty(autoRenewFeeAddr);
      setSplitOther(autoRenewFeePct);
    } else if (!autoRenew && hasFee) {
      setThirdParty(feeAddr);
      setSplitOther(feePctNum);
    } else if (!autoRenew && !hasFee) {
      setSplitOther(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRenew]);

  // ensure splits always sum to 100
  useEffect(() => {
    const sum = splitOwner + splitBorrower + splitOther;
    if (sum !== 100) {
      // auto-adjust borrower to balance
      const next = Math.max(0, 100 - splitOwner - splitOther);
      if (next !== splitBorrower) setSplitBorrower(next);
    }
  }, [splitOwner, splitOther, splitBorrower]);

  const list = useAddListing();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && list.step !== "submitting" && list.step !== "confirming") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, list.step]);

  useEffect(() => {
    if (list.step !== "success") return;
    toast({
      title: "Gotchi listed",
      description: `${gotchiName ?? `#${gotchiTokenId}`} is now available for rent.`,
    });
    onListed?.();

    // If auto-renew opted in, fire setLendingOperator + register with backend.
    if (autoRenew && autoRenewAvailable) {
      setOperator.send(autoRenewOperator as `0x${string}`, Number(gotchiTokenId), true);
      // Best-effort POST to backend to register the listing template.
      if (env.autoRenewApiUrl) {
        // Recompute these here so we don't have to reference forward-declared consts.
        const ghst = Number(upfrontGhst) || 0;
        const [whole, frac = ""] = String(ghst).split(".");
        const fracPad = (frac + "000000000000000000").slice(0, 18);
        const wei = ghst
          ? BigInt(whole) * (BigInt(10) ** BigInt(18)) + BigInt(fracPad)
          : BigInt(0);
        fetch(`${env.autoRenewApiUrl}/listings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tokenId: Number(gotchiTokenId),
            owner: address,
            template: {
              initialCostWei: wei.toString(),
              periodSeconds: periodDays * 86400,
              splitOwner,
              splitBorrower,
              splitOther,
              thirdParty: splitOther > 0 ? thirdParty : ZERO,
              whitelistId: Number(whitelistId) || 0,
              channelling,
            },
          }),
        }).catch(() => {});
      }
    }

    // auto-close after a moment
    const t = setTimeout(onClose, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.step]);

  useEffect(() => {
    if (list.step === "error" && list.errorMsg) {
      toast({
        title: "Listing failed",
        description:
          list.errorMsg.length > 140 ? list.errorMsg.slice(0, 140) + "…" : list.errorMsg,
        variant: "destructive",
      });
    }
  }, [list.step, list.errorMsg, toast]);

  const ghstNum = Number(upfrontGhst) || 0;
  const initialCostWei = useMemo(() => {
    if (!ghstNum) return BigInt(0);
    // Convert GHST to wei (1e18)
    const [whole, frac = ""] = String(ghstNum).split(".");
    const fracPad = (frac + "000000000000000000").slice(0, 18);
    return BigInt(whole) * (BigInt(10) ** BigInt(18)) + BigInt(fracPad);
  }, [ghstNum]);

  const splitsValid = splitOwner + splitBorrower + splitOther === 100;
  const periodSec = periodDays * 86400;
  const periodValid = periodSec > 0 && periodSec <= 30 * 86400;
  const thirdPartyValid =
    splitOther === 0 ||
    (thirdParty.length === 42 && thirdParty.startsWith("0x"));
  const formValid =
    Boolean(address) && isOnBase && splitsValid && periodValid && thirdPartyValid;

  const handleSubmit = () => {
    if (!formValid || !address) return;
    setSubmitted(true);
    list.send({
      tokenId: Number(gotchiTokenId),
      initialCostWei,
      periodSeconds: periodSec,
      splitOwner,
      splitBorrower,
      splitOther,
      originalOwner: address as `0x${string}`,
      thirdParty: (splitOther > 0 ? thirdParty : ZERO) as `0x${string}`,
      whitelistId: Number(whitelistId) || 0,
      revenueTokens: [],
      // permissions: bit 0 = channelling allowed (best guess; protocol stores
      // channellingAllowed flag derived from this). 0 means default.
      permissions: channelling ? BigInt(0) : BigInt(1),
    });
  };

  const busy = list.step === "submitting" || list.step === "confirming";

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
            List {gotchiName ?? `#${gotchiTokenId}`} for rent
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60 disabled:opacity-50"
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

        <div className="p-5 space-y-5">
          {/* Period */}
          <Section title="Rental period" icon={<Clock className="w-3.5 h-3.5" />}>
            <div className="flex flex-wrap gap-1.5 items-center">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setPeriodDays(p.days)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    periodDays === p.days
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-background/50 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={30}
                value={periodDays}
                onChange={(e) => setPeriodDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-20 h-8 px-2 rounded border border-border/40 bg-background/70 text-xs"
                title="Custom days (1-30)"
              />
              <span className="text-xs text-muted-foreground self-center">days</span>
              {modBRS != null && modBRS > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAutoPrice(true)}
                  className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-primary/40 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                  title="Auto-price using market data"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-price
                </button>
              )}
            </div>
          </Section>

          {/* Upfront GHST */}
          <Section title="Upfront cost (GHST)" icon={<Coins className="w-3.5 h-3.5" />}>
            <input
              type="number"
              min={0}
              step="any"
              value={upfrontGhst}
              onChange={(e) => setUpfrontGhst(e.target.value)}
              placeholder="0 = free rental"
              className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Charged once when borrower agrees. 0 = free, suitable for friend/whitelist rentals.
            </p>
          </Section>

          {/* Splits */}
          <Section title="Revenue split (must total 100%)">
            <div className="grid grid-cols-3 gap-2">
              <SplitInput label="Lender (you)" value={splitOwner} onChange={setSplitOwner} />
              <SplitInput label="Borrower" value={splitBorrower} onChange={setSplitBorrower} />
              <SplitInput label="3rd party" value={splitOther} onChange={setSplitOther} />
            </div>
            {!splitsValid && (
              <p className="text-[10px] text-destructive mt-1">
                Splits sum to {splitOwner + splitBorrower + splitOther}%, must be 100.
              </p>
            )}
            {hasFee && (
              <p className="text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Info className="w-3 h-3" />
                {feePctNum}% pre-filled to {feeAddr.slice(0, 6)}…{feeAddr.slice(-4)} as the GotchiCloset
                marketplace fee. Set to 0 to opt out.
              </p>
            )}
          </Section>

          {splitOther > 0 && (
            <Section title="Third-party address">
              <input
                type="text"
                value={thirdParty}
                onChange={(e) => setThirdParty(e.target.value)}
                placeholder="0x…"
                className={`w-full h-9 px-2 rounded border bg-background/70 text-sm font-mono ${
                  thirdPartyValid ? "border-border/40" : "border-destructive/50"
                }`}
              />
            </Section>
          )}

          {/* Whitelist */}
          <Section title="Whitelist" icon={<Lock className="w-3.5 h-3.5" />}>
            <select
              value={whitelistId}
              onChange={(e) => setWhitelistId(e.target.value)}
              className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm"
            >
              <option value="0">Open (any borrower)</option>
              {myWhitelists.asOwner.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || `Whitelist #${w.id}`} (id {w.id})
                </option>
              ))}
            </select>
            {myWhitelists.asOwner.length === 0 && !myWhitelists.loading && (
              <p className="text-[10px] text-muted-foreground mt-1">
                You don't own any whitelists yet. Manage them at /lending/whitelists.
              </p>
            )}
          </Section>

          {/* Channelling */}
          <Section title="Channelling" icon={<Zap className="w-3.5 h-3.5" />}>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={channelling}
                onChange={(e) => setChannelling(e.target.checked)}
                className="w-4 h-4 rounded border-border/40"
              />
              Allow borrower to channel alchemica from realm parcels
            </label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Recommended on — widens borrower pool. Battler-only borrowers ignore it.
            </p>
          </Section>

          {autoRenewAvailable && (
            <Section title="Auto-renew (premium)" icon={<RotateCw className="w-3.5 h-3.5" />}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="w-4 h-4 rounded border-border/40"
                />
                Re-list automatically when this rental ends
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">
                You'll authorize the GotchiCloset operator wallet (one-time per gotchi) via{" "}
                <code className="text-[9px]">setLendingOperator</code>. Our backend re-lists with these
                params after each rental ends.
              </p>
              {autoRenew && (
                <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-700 dark:text-amber-400">
                  <div className="font-medium">Service fee: {autoRenewFeePct}% splitOther → GHST to{" "}
                    <span className="font-mono">{autoRenewFeeAddr.slice(0, 6)}…{autoRenewFeeAddr.slice(-4)}</span>
                  </div>
                  <div className="opacity-80 mt-0.5">
                    Paid through the protocol on every rental. Borrower split decreases by {autoRenewFeePct}%;
                    your lender split is unchanged. Disabling auto-renew reverts these.
                  </div>
                </div>
              )}
              {autoRenew && setOperator.step !== "idle" && (
                <div className="mt-1.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  {setOperator.step === "submitting" || setOperator.step === "confirming" ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Authorizing operator…
                    </>
                  ) : setOperator.step === "success" ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-500" /> Operator authorized
                    </>
                  ) : null}
                </div>
              )}
            </Section>
          )}

          {/* Submit */}
          <div className="border-t border-border/30 pt-4">
            {list.step === "success" ? (
              <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Listed successfully
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!formValid || busy}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold transition-colors"
                data-testid="list-submit-btn"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {list.step === "submitting" ? "Submitting…" : "Confirming on-chain…"}
                  </>
                ) : (
                  <>List for rent</>
                )}
              </button>
            )}
            {submitted && list.errorMsg && list.step === "error" && (
              <div className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive break-words">
                {list.errorMsg.slice(0, 240)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(body, document.body)}
      {showAutoPrice && modBRS != null && (
        <AutoPriceModal
          brs={modBRS}
          gotchiName={gotchiName}
          gotchiTokenId={gotchiTokenId}
          onApply={(r) => {
            setPeriodDays(r.recommendedPeriodDays);
            setUpfrontGhst(
              r.recommendedUpfrontGhst < 1
                ? r.recommendedUpfrontGhst.toFixed(2)
                : String(Math.round(r.recommendedUpfrontGhst))
            );
            setChannelling(r.recommendedChannellingAllowed);
            setShowAutoPrice(false);
            toast({
              title: "Auto-price applied",
              description: `${r.recommendedPeriodDays}d at ${
                r.recommendedUpfrontGhst < 1
                  ? r.recommendedUpfrontGhst.toFixed(2)
                  : Math.round(r.recommendedUpfrontGhst)
              } GHST · ${r.confidence}/100 confidence`,
            });
          }}
          onClose={() => setShowAutoPrice(false)}
        />
      )}
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SplitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        className="w-full h-8 px-2 rounded border border-border/40 bg-background/70 text-sm text-right"
      />
    </div>
  );
}
