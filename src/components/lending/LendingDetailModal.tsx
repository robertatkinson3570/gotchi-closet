import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  X,
  Coins,
  Clock,
  Zap,
  Lock,
  User as UserIcon,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { client } from "@/graphql/client";
import { LENDING_BY_ID } from "@/graphql/lendingQueries";
import {
  transformLending,
  formatGhst,
  formatPeriod,
  formatGhstPerDay,
} from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";
import { brsBandOf } from "@/lib/lending/types";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { RentAction } from "@/components/lending/RentAction";
import { OwnerActions } from "@/components/lending/OwnerActions";
import { BorrowerActions } from "@/components/lending/BorrowerActions";
import { invalidateLendingsCache } from "@/hooks/useLendings";
import { useMyWhitelistMemberIds } from "@/hooks/useWhitelists";

const NAKED_WEARABLES: number[] = new Array(16).fill(0);
const TRAIT_LABELS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

type Props = {
  lendingId: string;
  onClose: () => void;
};

export function LendingDetailModal({ lendingId, onClose }: Props) {
  const [lending, setLending] = useState<Lending | null>(null);
  const [extras, setExtras] = useState<{
    cancelled: boolean;
    completed: boolean;
    borrower: string | null;
    timeAgreed: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .query(LENDING_BY_ID, { id: lendingId })
      .toPromise()
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
          return;
        }
        const raw = res.data?.gotchiLending;
        if (!raw) {
          setError("Lending not found");
          return;
        }
        setLending(transformLending(raw));
        setExtras({
          cancelled: Boolean(raw.cancelled),
          completed: Boolean(raw.completed),
          borrower: raw.borrower ?? null,
          timeAgreed: Number(raw.timeAgreed ?? 0),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load lending");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lendingId]);

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

  const equipped = useMemo(
    () => lending?.gotchi?.equippedWearables ?? NAKED_WEARABLES,
    [lending?.gotchi?.equippedWearables]
  );
  const traits = useMemo(
    () => lending?.gotchi?.numericTraits ?? [0, 0, 0, 0, 0, 0],
    [lending?.gotchi?.numericTraits]
  );
  const wearableCount = equipped.filter((w) => w > 0).length;

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center h-9 w-9 rounded-full bg-background/80 border border-border/40 hover:bg-muted/60 transition-colors"
          aria-label="Close"
          data-testid="lending-modal-close"
        >
          <X className="h-4 w-4" />
        </button>

        {loading && (
          <div className="p-6 grid md:grid-cols-2 gap-6">
            <div className="aspect-square bg-muted/40 animate-pulse rounded-lg" />
            <div className="space-y-3">
              <div className="h-8 w-2/3 bg-muted/50 animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-muted/40 animate-pulse rounded" />
              <div className="h-32 bg-muted/30 animate-pulse rounded" />
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="p-10 text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <div className="font-medium">Couldn't load lending #{lendingId}</div>
            <div className="text-sm text-muted-foreground mt-1">{error}</div>
          </div>
        )}

        {!loading && !error && lending && (
          <DetailContent
            lending={lending}
            extras={extras}
            traits={traits}
            equipped={equipped}
            hovered={hovered}
            setHovered={setHovered}
            wearableCount={wearableCount}
          />
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function DetailContent({
  lending,
  extras,
  traits,
  equipped,
  hovered,
  setHovered,
  wearableCount,
}: {
  lending: Lending;
  extras: { cancelled: boolean; completed: boolean; borrower: string | null; timeAgreed: number } | null;
  traits: number[];
  equipped: number[];
  hovered: boolean;
  setHovered: (b: boolean) => void;
  wearableCount: number;
}) {
  const g = lending.gotchi;
  const band = brsBandOf(lending.gotchiBRS);
  const ghst = formatGhst(lending.upfrontCost);
  const periodLabel = formatPeriod(lending.period);
  const perDay = formatGhstPerDay(lending.upfrontCost, lending.period);
  const isOpen = !lending.whitelistId || lending.whitelistId === "0";
  const wlLabel = isOpen
    ? "Open (any borrower)"
    : lending.whitelistName || `Whitelist #${lending.whitelistId}`;

  const myWhitelistIds = useMyWhitelistMemberIds();
  const onWhitelist =
    !isOpen && lending.whitelistId
      ? Boolean(myWhitelistIds && myWhitelistIds.has(lending.whitelistId))
      : false;
  const cantRentDueToWhitelist =
    !isOpen && Boolean(myWhitelistIds) && !onWhitelist;

  const rentStatus: "available" | "active" | "completed" | "cancelled" = extras?.cancelled
    ? "cancelled"
    : extras?.completed
    ? "completed"
    : extras?.borrower
    ? "active"
    : "available";

  const status = rentStatus === "cancelled"
    ? "Cancelled"
    : rentStatus === "completed"
    ? "Completed"
    : rentStatus === "active"
    ? "Active rental"
    : "Listed (available)";

  return (
    <div className="p-5 sm:p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <div
        className="relative aspect-square rounded-xl border border-border/30 bg-muted/10 overflow-hidden"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {g ? (
          <GotchiSvg
            gotchiId={lending.gotchiTokenId}
            hauntId={g.hauntId}
            collateral={g.collateral}
            numericTraits={traits}
            equippedWearables={hovered && wearableCount > 0 ? NAKED_WEARABLES : equipped}
            mode="preview"
            className="w-full h-full"
            useBlobUrl
          />
        ) : (
          <div className="w-full h-full bg-muted/40 animate-pulse" />
        )}
        {wearableCount > 0 && (
          <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
            hover to undress
          </div>
        )}
      </div>

      <div className="space-y-4 min-w-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">#{lending.gotchiTokenId}</span>
            <span>·</span>
            <span>H{g?.hauntId ?? "?"}</span>
            <span>·</span>
            <span>Lv {g?.level ?? 1}</span>
            <span>·</span>
            <span>Kin {g?.kinship ?? 0}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mt-1 break-words">
            {g?.name || "Unnamed"}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
              BRS {lending.gotchiBRS} ({band})
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                status === "Listed (available)"
                  ? "bg-green-500/10 text-green-500"
                  : status === "Active rental"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {status}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                lending.channellingAllowed
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted/40 text-muted-foreground"
              }`}
              title={lending.channellingAllowed
                ? "Borrower may channel alchemica from realm parcels"
                : "Channelling disabled — battler-style listing"}
            >
              <Zap className="w-3 h-3" /> Channelling: {lending.channellingAllowed ? "ON" : "OFF"}
            </span>
            {!isOpen && (
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-500 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> {wlLabel}
              </span>
            )}
            {onWhitelist && (
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-500 inline-flex items-center gap-1 font-medium">
                ✓ You're on this list
              </span>
            )}
          </div>
        </div>

        <OwnerActions
          lender={lending.lender}
          gotchiTokenId={lending.gotchiTokenId}
          status={rentStatus}
          timeAgreed={extras?.timeAgreed}
          periodSeconds={lending.period}
          onAfterTx={() => invalidateLendingsCache()}
        />

        <BorrowerActions
          borrower={extras?.borrower ?? null}
          gotchiTokenId={lending.gotchiTokenId}
          status={rentStatus}
          timeAgreed={extras?.timeAgreed}
          periodSeconds={lending.period}
          onAfterTx={() => invalidateLendingsCache()}
        />

        {cantRentDueToWhitelist ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            This listing is restricted to members of <span className="font-medium">{wlLabel}</span>.
            Your wallet isn't on it, so you can't rent this gotchi.
          </div>
        ) : (
          <RentAction
            lending={lending}
            status={rentStatus}
            onRentSuccess={() => invalidateLendingsCache()}
          />
        )}

        <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Coins className="w-4 h-4 text-green-500" />
              <span className="text-muted-foreground">Upfront</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-green-500">{ghst} GHST</div>
              <div className="text-[10px] text-muted-foreground">{perDay}</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Period</span>
            </div>
            <span className="font-medium">{periodLabel}</span>
          </div>

          <div className="border-t border-border/30 pt-3 space-y-1.5 text-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Revenue split
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <SplitCell label="Borrower" value={lending.splitBorrower} />
              <SplitCell label="Lender" value={lending.splitOwner} />
              <SplitCell label="3rd party" value={lending.splitOther} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2 text-sm">
          <Row icon={<UserIcon className="w-3.5 h-3.5" />} label="Lender">
            <Address value={lending.lender} />
          </Row>
          {lending.originalOwner && lending.originalOwner !== lending.lender && (
            <Row icon={<UserIcon className="w-3.5 h-3.5" />} label="Original owner">
              <Address value={lending.originalOwner} />
            </Row>
          )}
          {extras?.borrower && (
            <Row icon={<UserIcon className="w-3.5 h-3.5" />} label="Borrower">
              <Address value={extras.borrower} />
            </Row>
          )}
          <Row icon={<Calendar className="w-3.5 h-3.5" />} label="Listed">
            <span className="text-muted-foreground">
              {lending.timeCreated
                ? new Date(lending.timeCreated * 1000).toLocaleString()
                : "—"}
            </span>
          </Row>
        </div>

        {g && (
          <div className="rounded-lg border border-border/40 bg-card/50 p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Traits (with wearables)
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {(g.modifiedNumericTraits.some((v) => v) ? g.modifiedNumericTraits : g.numericTraits)
                .slice(0, 6)
                .map((v, i) => {
                  const isExtreme = v <= 10 || v >= 90;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-border/30 bg-background/50 px-2 py-1"
                    >
                      <span className="text-[10px] text-muted-foreground">{TRAIT_LABELS[i]}</span>
                      <span className={`font-medium ${isExtreme ? "text-purple-400" : ""}`}>
                        {v}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1 text-xs flex-wrap">
          <a
            href={`https://dapp.aavegotchi.com/u/${lending.originalOwner || lending.lender}/inventory?itemType=aavegotchis&chainId=8453&id=${lending.gotchiTokenId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            View on Aavegotchi <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={`https://basescan.org/address/${lending.lender}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Lender on Basescan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function SplitCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border/30 bg-background/50 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}%</div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function Address({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      to={`/lending?owner=${value}`}
      className="font-mono hover:text-primary transition-colors"
      title={value}
    >
      {value.slice(0, 6)}…{value.slice(-4)}
    </Link>
  );
}
