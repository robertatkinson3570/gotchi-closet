import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import {
  X,
  Search,
  ArrowRight,
  CheckSquare,
  Square,
  HandCoins,
  Lock,
} from "lucide-react";
import { useLendings } from "@/hooks/useLendings";
import { useMyWhitelistMemberIds } from "@/hooks/useWhitelists";
import { BulkRentModal } from "./BulkRentModal";
import { formatGhst, formatPeriod } from "@/lib/lending/transform";
import type { Lending } from "@/lib/lending/types";

type Props = {
  onClose: () => void;
};

/**
 * Discovery + selection step for bulk rent. Filters all active listings to
 * the ones the connected wallet is eligible to agree to (open lendings
 * with no whitelist OR whitelists this wallet is a member of) and lets
 * the user toggle a subset before kicking off sequential signing.
 *
 * Rental availability is loose — we surface anything the wallet *could*
 * theoretically rent, but the on-chain agree call still has to validate
 * (already-rented listings will revert). The sequential modal stops on
 * the first revert so a stale listing doesn't burn the rest.
 */
export function BulkRentDiscoveryModal({ onClose }: Props) {
  const { address } = useAccount();
  const myAddrLower = address?.toLowerCase() ?? "";
  const { lendings, loading } = useLendings();
  const myWhitelistIds = useMyWhitelistMemberIds();

  // Eligible = listings with no agreed borrower AND (open OR whitelisted to me).
  // useLendings only returns ACTIVE (not yet rented) listings so the borrower
  // check is structural, but we keep an explicit sanity filter on whitelistId.
  const eligible = useMemo<Lending[]>(() => {
    if (loading) return [];
    return lendings.filter((l) => {
      // Never let a user try to rent their own listing — the diamond reverts.
      if (l.lender.toLowerCase() === myAddrLower) return false;
      const wlId = l.whitelistId ?? "0";
      if (wlId === "0" || wlId === "" || wlId == null) return true;
      if (!myWhitelistIds) return false;
      return myWhitelistIds.has(wlId);
    });
  }, [lendings, loading, myAddrLower, myWhitelistIds]);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRentFlow, setShowRentFlow] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return eligible;
    const q = search.toLowerCase();
    return eligible.filter(
      (l) =>
        l.gotchi?.name?.toLowerCase().includes(q) ||
        l.gotchiTokenId.includes(q) ||
        l.lender.toLowerCase().includes(q)
    );
  }, [eligible, search]);

  const allSelected =
    filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const selectedListings = useMemo(
    () => filtered.filter((l) => selected.has(l.id)),
    [filtered, selected]
  );

  // When the rent-flow modal closes, also close this discovery modal so the
  // user lands back on /lending/me with their newly-rented gotchis visible.
  if (showRentFlow) {
    return (
      <BulkRentModal
        listings={selectedListings}
        onClose={() => {
          setShowRentFlow(false);
          onClose();
        }}
      />
    );
  }

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border/50 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <HandCoins className="w-4 h-4" /> Bulk rent
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="text-xs text-muted-foreground">
            Listings you can agree to right now: {eligible.length}{" "}
            <span className="opacity-70">
              (open lendings + ones on whitelists you're a member of, excluding your own)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by gotchi name, id, or lender address"
                className="w-full h-9 pl-7 pr-2 rounded border border-border/40 bg-background/70 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(filtered.map((l) => l.id)))
              }
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border/40 bg-background/70 hover:bg-muted/50 text-xs font-medium disabled:opacity-50"
            >
              {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allSelected ? "Clear" : "Select all"}
            </button>
          </div>

          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/30 animate-pulse rounded" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-card/50 p-6 text-center text-sm text-muted-foreground">
              {eligible.length === 0
                ? "No listings are currently rentable by your wallet. If you expect listings to be here, check that you're on the lender's whitelist."
                : `No matches for "${search}".`}
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30 max-h-[55vh] overflow-y-auto">
              {filtered.map((l) => {
                const checked = selected.has(l.id);
                const isOpen = !l.whitelistId || l.whitelistId === "0";
                return (
                  <label
                    key={l.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 ${
                      checked ? "bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(l.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {l.gotchi?.name || "Unnamed"}{" "}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          #{l.gotchiTokenId}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        BRS {l.gotchiBRS} · {formatPeriod(l.period)} · L/B {l.splitOwner}/{l.splitBorrower}%
                        {!isOpen && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-cyan-500">
                            <Lock className="w-2.5 h-2.5" /> WL {l.whitelistName ?? `#${l.whitelistId}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                        {formatGhst(l.upfrontCost)} GHST
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {l.lender.slice(0, 6)}…{l.lender.slice(-4)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="border-t border-border/30 pt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {selected.size} selected
            </div>
            <button
              type="button"
              onClick={() => setShowRentFlow(true)}
              disabled={selected.size === 0}
              data-testid="bulk-rent-discover-continue"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
            >
              Continue ({selected.size}) <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
