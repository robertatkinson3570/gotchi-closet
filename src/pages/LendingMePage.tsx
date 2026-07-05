import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import {
  ArrowLeft,
  Coins,
  Users,
  ListPlus,
  Wallet,
  BarChart3,
  Share2,
  Check,
  CheckSquare,
  Square,
  XCircle,
  Pencil,
  HandCoins,
  StopCircle,
  RotateCw,
  Loader2,
} from "lucide-react";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { LendingCard } from "@/components/lending/LendingCard";
import { LendingDetailModal } from "@/components/lending/LendingDetailModal";
import { UnlistedGotchiList } from "@/components/lending/UnlistedGotchiList";
import { AutoRenewTab } from "@/components/lending/AutoRenewTab";
import { BulkEditModal } from "@/components/lending/BulkEditModal";
import { BulkReturnAndSweepModal } from "@/components/lending/BulkReturnAndSweepModal";
import { BulkRentDiscoveryModal } from "@/components/lending/BulkRentDiscoveryModal";
import { EscrowSummaryBar } from "@/components/lending/EscrowSummaryBar";
import { LandAlchemicaBar } from "@/components/lending/LandAlchemicaBar";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ghstFromWei } from "@/lib/lending/transform";
import {
  useBatchCancelLending,
  useBatchClaimLending,
  useBatchClaimAndEndLending,
  useBatchClaimAndEndAndRelistLending,
} from "@/hooks/useLendingTx";
import { useToast } from "@/ui/use-toast";

type Tab = "unlisted" | "active" | "rented" | "borrowing" | "ended" | "autorenew";

export default function LendingMePage() {
  const { address, isConnected } = useAccount();
  const { lender, borrower, loading, error } = useMyConnectedLendings();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("unlisted");
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get("l");
  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("l");
    setSearchParams(next, { replace: true });
  };

  // Bulk-select state. Selection is a set of lending ids; we always reset
  // when the user switches tabs so an "active" selection doesn't accidentally
  // bleed into a "rented out" bulk-end action with mixed-state tokens.
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showReturnAndSweep, setShowReturnAndSweep] = useState(false);
  const [showBulkRent, setShowBulkRent] = useState(false);
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Reset selection whenever tab changes — different tabs surface different
  // bulk actions, and a selection from "active" can't be applied to "rented".
  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  const sections = useMemo(() => {
    const active = lender.filter((l) => !l.cancelled && !l.completed && !l.borrower);
    const rented = lender.filter((l) => !l.cancelled && !l.completed && l.borrower);
    const borrowing = borrower.filter((l) => !l.cancelled && !l.completed);
    const ended = [...lender, ...borrower].filter((l) => l.cancelled || l.completed);
    return { active, rented, borrowing, ended };
  }, [lender, borrower]);

  const counts = {
    active: sections.active.length,
    rented: sections.rented.length,
    borrowing: sections.borrowing.length,
    ended: sections.ended.length,
  };

  // P&L summary
  const totalUpfrontEarned = lender
    .filter((l) => !l.cancelled && (l.borrower || l.completed))
    .reduce((s, l) => s + ghstFromWei(l.upfrontCost), 0);
  const totalUpfrontSpent = borrower
    .filter((l) => !l.cancelled)
    .reduce((s, l) => s + ghstFromWei(l.upfrontCost), 0);

  // Suppress unused warning for ended count tab logic below
  void error;

  const visible =
    tab === "active"
      ? sections.active
      : tab === "rented"
      ? sections.rented
      : tab === "borrowing"
      ? sections.borrowing
      : tab === "ended"
      ? sections.ended
      : [];

  // Tabs that support bulk select. "ended" has no bulk actions worth
  // surfacing. Borrowing surfaces "Return early" — the borrower-side path
  // to flush channelled alchemica from the escrow before the period expires.
  const supportsBulk = tab === "active" || tab === "rented" || tab === "borrowing";

  const selectedRows = useMemo(
    () => visible.filter((l) => selected.has(l.id)),
    [visible, selected]
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <Seo
        title="My Lendings · GotchiCloset"
        description="Manage your Aavegotchi lending listings, rentals, and earnings."
        canonical={siteUrl("/lending/me")}
      />

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link
            to="/lending"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to marketplace
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">My Lendings</h1>
          {address && (
            <p className="text-xs text-muted-foreground font-mono">
              {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {address && <ShareLink address={address} />}
          <Link
            to="/lending/whitelists"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
          >
            <Users className="w-3.5 h-3.5" /> Whitelists
          </Link>
          <Link
            to="/lending/me/list"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5" /> Bulk list
          </Link>
          <button
            type="button"
            onClick={() => setShowBulkRent(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
            title="Bulk-rent listings you're whitelisted on (sequential signing: Aavegotchi has no batch agree)"
            data-testid="bulk-rent-open"
          >
            <HandCoins className="w-3.5 h-3.5" /> Bulk rent
          </button>
          <Link
            to="/lending/analytics"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </Link>
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium mb-3">Connect a wallet to see your lendings</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          {/* P&L cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Active listings"
              value={counts.active.toString()}
              icon={<ListPlus className="w-4 h-4 text-primary" />}
            />
            <Stat
              label="Currently rented out"
              value={counts.rented.toString()}
              icon={<Coins className="w-4 h-4 text-amber-500" />}
            />
            <Stat
              label="Earned upfront"
              value={`${Math.round(totalUpfrontEarned).toLocaleString()} GHST`}
              icon={<Coins className="w-4 h-4 text-green-500" />}
              hint="from agreed/completed rentals"
            />
            <Stat
              label="Spent upfront"
              value={`${Math.round(totalUpfrontSpent).toLocaleString()} GHST`}
              icon={<Coins className="w-4 h-4 text-pink-500" />}
              hint="as borrower"
            />
          </div>

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Escrow sweep — only renders when there's alch sitting in
              per-gotchi escrows on unlocked gotchis. Surfaces a one-tx
              batchTransferEscrow to recover it. */}
          <EscrowSummaryBar />

          {/* Land reservoir claim — sweeps claimable alchemica from the
              connected wallet's Gotchiverse parcels in one click (batched). */}
          <LandAlchemicaBar />

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-border/30 overflow-x-auto">
            {(
              [
                { value: "unlisted", label: "Unlisted (list these)" },
                { value: "active", label: "Listed" },
                { value: "rented", label: "Rented out" },
                { value: "borrowing", label: "I'm borrowing" },
                { value: "autorenew", label: "Auto-renew" },
                { value: "ended", label: "Past" },
              ] as { value: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.value !== "unlisted" && t.value !== "autorenew" && (
                  <span className="text-[10px] text-muted-foreground ml-1">({counts[t.value as keyof typeof counts]})</span>
                )}
              </button>
            ))}
          </div>

          {tab === "unlisted" ? (
            address ? <UnlistedGotchiList ownerAddress={address.toLowerCase()} /> : null
          ) : tab === "autorenew" ? (
            <AutoRenewTab />
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {tab === "active" && "No listings yet. Switch to the Unlisted tab to list some."}
              {tab === "rented" && "No active rentals out at the moment."}
              {tab === "borrowing" && "You're not currently renting any gotchis."}
              {tab === "ended" && "No past lendings yet."}
            </div>
          ) : (
            <>
              {supportsBulk && (
                <BulkToolbar
                  bulkMode={bulkMode}
                  setBulkMode={setBulkMode}
                  visible={visible}
                  selected={selected}
                  setSelected={setSelected}
                />
              )}
              {bulkMode && supportsBulk && selectedRows.length > 0 && (
                <BulkActionBar
                  tab={tab}
                  selectedRows={selectedRows}
                  onClearSelection={() => setSelected(new Set())}
                  onOpenEdit={() => setShowBulkEdit(true)}
                  onOpenReturnAndSweep={() => setShowReturnAndSweep(true)}
                  onAfterTx={() => {
                    setSelected(new Set());
                    setBulkMode(false);
                  }}
                  toast={toast}
                />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {visible.map((l) => (
                  <LendingCard
                    key={l.id}
                    lending={l}
                    selectable={bulkMode && supportsBulk}
                    selected={selected.has(l.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {detailId && <LendingDetailModal lendingId={detailId} onClose={closeDetail} />}
      {showBulkEdit && (
        <BulkEditModal
          listings={selectedRows}
          onClose={() => {
            setShowBulkEdit(false);
            setSelected(new Set());
            setBulkMode(false);
          }}
        />
      )}
      {showReturnAndSweep && (
        <BulkReturnAndSweepModal
          rentals={selectedRows.map((r) => ({
            id: r.id,
            gotchiTokenId: r.gotchiTokenId,
            lender: r.lender,
          }))}
          onClose={() => {
            setShowReturnAndSweep(false);
            setSelected(new Set());
            setBulkMode(false);
          }}
        />
      )}
      {showBulkRent && (
        <BulkRentDiscoveryModal onClose={() => setShowBulkRent(false)} />
      )}
    </div>
  );
}

function BulkToolbar({
  bulkMode,
  setBulkMode,
  visible,
  selected,
  setSelected,
}: {
  bulkMode: boolean;
  setBulkMode: (b: boolean) => void;
  visible: { id: string }[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  const allSelected = bulkMode && visible.length > 0 && visible.every((v) => selected.has(v.id));
  return (
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div className="text-xs text-muted-foreground">
        {bulkMode
          ? `${selected.size} of ${visible.length} selected`
          : `${visible.length} listing${visible.length === 1 ? "" : "s"}`}
      </div>
      <div className="flex items-center gap-1.5">
        {bulkMode && (
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(visible.map((v) => v.id)))
            }
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium"
          >
            {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setBulkMode(!bulkMode);
            if (bulkMode) setSelected(new Set());
          }}
          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-semibold transition-colors ${
            bulkMode
              ? "bg-primary/15 text-primary border border-primary/40"
              : "border border-border/40 bg-background/70 hover:bg-muted/50"
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          {bulkMode ? "Exit bulk mode" : "Bulk select"}
        </button>
      </div>
    </div>
  );
}

type BulkRow = {
  id: string;
  gotchiTokenId: string;
  period: number;
  // Lender address from the listing; needed by the return-and-sweep flow
  // to know which wallet must sign the post-end escrow sweep tx.
  lender: string;
  borrower?: string | null;
  timeAgreed?: number;
  cancelled?: boolean;
  completed?: boolean;
};

function BulkActionBar({
  tab,
  selectedRows,
  onClearSelection,
  onOpenEdit,
  onOpenReturnAndSweep,
  onAfterTx,
  toast,
}: {
  tab: Tab;
  selectedRows: BulkRow[];
  onClearSelection: () => void;
  onOpenEdit: () => void;
  onOpenReturnAndSweep: () => void;
  onAfterTx: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const cancel = useBatchCancelLending();
  const claim = useBatchClaimLending();
  const claimEnd = useBatchClaimAndEndLending();
  const claimEndRelist = useBatchClaimAndEndAndRelistLending();

  const tokenIds = useMemo(
    () => selectedRows.map((r) => Number(r.gotchiTokenId)),
    [selectedRows]
  );

  // For "rented out" tab: only include rentals whose period has expired —
  // the contract reverts on end-before-period for any single one. We tick
  // every 15s so a user staring at the bar past a period boundary sees the
  // End/Relist buttons enable without needing to navigate away. Without the
  // tick the memo's `nowSec` is captured at first render and stays stale.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (tab !== "rented") return;
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      15_000
    );
    return () => clearInterval(id);
  }, [tab]);
  const endableTokenIds = useMemo(() => {
    if (tab !== "rented") return tokenIds;
    return selectedRows
      .filter((r) => {
        const ta = r.timeAgreed ?? 0;
        return ta && nowSec >= ta + r.period;
      })
      .map((r) => Number(r.gotchiTokenId));
  }, [selectedRows, tab, tokenIds, nowSec]);

  const someNotEndable = tab === "rented" && endableTokenIds.length < selectedRows.length;

  const onSuccess = (label: string, count: number) => {
    toast({
      title: label,
      description: `Applied to ${count} listing${count === 1 ? "" : "s"}.`,
    });
    onAfterTx();
  };

  useEffect(() => {
    if (cancel.step === "success") onSuccess("Bulk cancel done", tokenIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel.step]);
  useEffect(() => {
    if (claim.step === "success") onSuccess("Bulk claim done", tokenIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.step]);
  useEffect(() => {
    if (claimEnd.step === "success") onSuccess("Bulk end done", endableTokenIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimEnd.step]);
  useEffect(() => {
    if (claimEndRelist.step === "success")
      onSuccess("Bulk claim + end + relist done", endableTokenIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimEndRelist.step]);

  useEffect(() => {
    const err = cancel.errorMsg || claim.errorMsg || claimEnd.errorMsg || claimEndRelist.errorMsg;
    if (err) {
      toast({
        title: "Bulk action failed",
        description: err.length > 140 ? err.slice(0, 140) + "…" : err,
        variant: "destructive",
      });
    }
  }, [cancel.errorMsg, claim.errorMsg, claimEnd.errorMsg, claimEndRelist.errorMsg, toast]);

  const anyBusy =
    cancel.step === "submitting" ||
    cancel.step === "confirming" ||
    claim.step === "submitting" ||
    claim.step === "confirming" ||
    claimEnd.step === "submitting" ||
    claimEnd.step === "confirming" ||
    claimEndRelist.step === "submitting" ||
    claimEndRelist.step === "confirming";

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-lg border border-primary/40 bg-primary/10 backdrop-blur p-2.5 flex items-center justify-between gap-2 flex-wrap">
      <div className="text-xs font-medium text-primary inline-flex items-center gap-2">
        <Check className="w-3.5 h-3.5" />
        {selectedRows.length} selected
        {someNotEndable && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
            ({endableTokenIds.length} have period expired)
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tab === "active" && (
          <>
            <ActionButton
              onClick={onOpenEdit}
              disabled={anyBusy}
              icon={<Pencil className="w-3.5 h-3.5" />}
              variant="primary"
            >
              Edit ({selectedRows.length})
            </ActionButton>
            <ActionButton
              onClick={() => cancel.send(tokenIds)}
              busy={cancel.step === "submitting" || cancel.step === "confirming"}
              busyLabel={cancel.step === "submitting" ? "Sign…" : "Confirming…"}
              disabled={anyBusy}
              icon={<XCircle className="w-3.5 h-3.5" />}
              variant="danger"
            >
              Cancel ({selectedRows.length})
            </ActionButton>
          </>
        )}
        {tab === "borrowing" && (
          <>
            <ActionButton
              onClick={onOpenReturnAndSweep}
              disabled={anyBusy}
              title="Auto-chains two txs: (1) end rentals from this borrower wallet, (2) switch to lender wallet → sweep gotchi escrows to your wallet. Required for listings with empty revenueTokens: claim alone can't pay out on those."
              icon={<Coins className="w-3.5 h-3.5" />}
              variant="primary"
            >
              Return & sweep alch ({selectedRows.length})
            </ActionButton>
            <ActionButton
              onClick={() => claimEnd.send(tokenIds)}
              busy={claimEnd.step === "submitting" || claimEnd.step === "confirming"}
              busyLabel={claimEnd.step === "submitting" ? "Sign…" : "Confirming…"}
              disabled={anyBusy}
              title="End rentals only: does NOT auto-sweep the gotchi escrows. Use 'Return & sweep' above for the full one-flow recovery."
              icon={<StopCircle className="w-3.5 h-3.5" />}
            >
              End only ({selectedRows.length})
            </ActionButton>
          </>
        )}
        {tab === "rented" && (
          <>
            <ActionButton
              onClick={() => claim.send(tokenIds)}
              busy={claim.step === "submitting" || claim.step === "confirming"}
              busyLabel={claim.step === "submitting" ? "Sign…" : "Confirming…"}
              disabled={anyBusy}
              title="Mid-rental lending-facet claim. On Base this typically returns 0 because farming alch goes to each gotchi's escrow (locked during rentals). To actually withdraw alch: end the rental (or use Return early & flush alch on the Borrowing tab), then use the Escrow sweep bar that appears above the tabs."
              icon={<HandCoins className="w-3.5 h-3.5" />}
            >
              Claim ({selectedRows.length})
            </ActionButton>
            <ActionButton
              onClick={() => claimEnd.send(endableTokenIds)}
              busy={claimEnd.step === "submitting" || claimEnd.step === "confirming"}
              busyLabel={claimEnd.step === "submitting" ? "Sign…" : "Confirming…"}
              disabled={anyBusy || endableTokenIds.length === 0}
              title={endableTokenIds.length === 0 ? "No selected rentals have an expired period" : undefined}
              icon={<StopCircle className="w-3.5 h-3.5" />}
              variant="danger"
            >
              End ({endableTokenIds.length})
            </ActionButton>
            <ActionButton
              onClick={() => claimEndRelist.send(endableTokenIds)}
              busy={
                claimEndRelist.step === "submitting" ||
                claimEndRelist.step === "confirming"
              }
              busyLabel={claimEndRelist.step === "submitting" ? "Sign…" : "Confirming…"}
              disabled={anyBusy || endableTokenIds.length === 0}
              title={
                endableTokenIds.length === 0
                  ? "No selected rentals have an expired period"
                  : "Atomically claim earnings, end rental, and re-list with same terms"
              }
              icon={<RotateCw className="w-3.5 h-3.5" />}
              variant="primary"
            >
              Auto claim + relist ({endableTokenIds.length})
            </ActionButton>
          </>
        )}
        <button
          type="button"
          onClick={onClearSelection}
          disabled={anyBusy}
          className="h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  busyLabel,
  disabled,
  icon,
  children,
  variant = "default",
  title,
}: {
  onClick: () => void;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "primary" | "danger";
  title?: string;
}) {
  const cls =
    variant === "primary"
      ? "border border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "danger"
      ? "border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive"
      : "border border-border/40 bg-background/70 hover:bg-muted/50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {busy ? busyLabel ?? "Working…" : children}
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function ShareLink({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/lending?owner=${address.toLowerCase()}`
      : `/lending?owner=${address.toLowerCase()}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium transition-colors"
      title={url}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-500" /> Copied
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" /> Share
        </>
      )}
    </button>
  );
}
