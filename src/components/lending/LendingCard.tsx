import { memo, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Lending } from "@/lib/lending/types";
import { brsBandOf } from "@/lib/lending/types";
import { formatGhst, formatPeriod, formatGhstPerDay } from "@/lib/lending/transform";
import { GotchiSvg, prefetchGotchiSvg } from "@/components/gotchi/GotchiSvg";
import { Zap, Lock, Coins, Clock, Check } from "lucide-react";

const NAKED_WEARABLES: number[] = new Array(16).fill(0);
// Order matches the Aavegotchi int16[6] numericTraits layout the explorer card uses.
const TRAIT_ABBR = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

const tierColors: Record<string, { border: string; bg: string; text: string }> = {
  "<500": { border: "border-gray-400/20", bg: "bg-gray-500/5", text: "text-gray-500" },
  "500-529": { border: "border-purple-400/20", bg: "bg-purple-500/5", text: "text-purple-400" },
  "530-569": { border: "border-pink-400/20", bg: "bg-pink-500/5", text: "text-pink-400" },
  "570-599": { border: "border-pink-400/30", bg: "bg-pink-500/10", text: "text-pink-500" },
  "600-629": { border: "border-pink-500/30", bg: "bg-pink-500/15", text: "text-pink-400" },
  "630-659": { border: "border-fuchsia-500/30", bg: "bg-fuchsia-500/10", text: "text-fuchsia-400" },
  "660-699": { border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/15", text: "text-fuchsia-300" },
  "700+": { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-400" },
};

type Props = {
  lending: Lending;
  // Selection-mode props. When `selectable` is true, the card swallows clicks
  // to toggle selection instead of opening the detail modal — used by the
  // bulk action bar on /lending/me.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (lendingId: string) => void;
};

export const LendingCard = memo(function LendingCard({
  lending,
  selectable,
  selected,
  onToggleSelect,
}: Props) {
  const g = lending.gotchi;
  const band = brsBandOf(lending.gotchiBRS);
  const colors = tierColors[band] ?? tierColors["<500"];
  const [hovered, setHovered] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const openDetail = () => {
    if (selectable) {
      onToggleSelect?.(lending.id);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("l", lending.id);
    setSearchParams(next, { replace: false });
  };

  const equipped = useMemo(() => g?.equippedWearables ?? NAKED_WEARABLES, [g?.equippedWearables]);
  // Render-traits mirror what the explorer's GotchiSvg consumes: prefer
  // withSets, then modified, then base — same precedence order as
  // GotchiExplorerCard so dressed-vs-naked SVGs match what users see there.
  const renderTraits = useMemo(() => {
    if (!g) return [0, 0, 0, 0, 0, 0];
    const arr = (g.withSetsNumericTraits?.length ? g.withSetsNumericTraits :
                 g.modifiedNumericTraits?.length ? g.modifiedNumericTraits :
                 g.numericTraits) ?? [0, 0, 0, 0, 0, 0];
    return arr.length === 6 ? arr : [0, 0, 0, 0, 0, 0];
  }, [g]);
  // For the SVG renderer we still pass numericTraits (raw birth traits) because
  // the GotchiSvg endpoint expects those + equipped wearables to compute its
  // own modified traits. Don't substitute renderTraits here.
  const traits = useMemo(() => g?.numericTraits ?? [0, 0, 0, 0, 0, 0], [g?.numericTraits]);
  const wearableCount = useMemo(() => equipped.filter((w) => w > 0).length, [equipped]);

  useEffect(() => {
    if (!g) return;
    prefetchGotchiSvg({
      gotchiId: lending.gotchiTokenId,
      hauntId: g.hauntId,
      collateral: g.collateral,
      numericTraits: traits,
      equippedWearables: equipped,
      mode: "preview",
    });
    if (wearableCount > 0) {
      prefetchGotchiSvg({
        gotchiId: lending.gotchiTokenId,
        hauntId: g.hauntId,
        collateral: g.collateral,
        numericTraits: traits,
        equippedWearables: NAKED_WEARABLES,
        mode: "preview",
      });
    }
  }, [g, lending.gotchiTokenId, traits, equipped, wearableCount]);

  const activeWearables = hovered && wearableCount > 0 ? NAKED_WEARABLES : equipped;
  const ghst = formatGhst(lending.upfrontCost);
  const periodLabel = formatPeriod(lending.period);
  const perDay = formatGhstPerDay(lending.upfrontCost, lending.period);
  const isOpen = !lending.whitelistId || lending.whitelistId === "0";
  const wlLabel = isOpen ? "Open" : lending.whitelistName || `WL #${lending.whitelistId}`;

  const selectionRing = selectable && selected
    ? "ring-2 ring-primary border-primary/60"
    : selectable
    ? "ring-1 ring-border/30 hover:ring-primary/50"
    : "";

  return (
    <div
      className={`group rounded-lg border ${colors.border} ${colors.bg} glass lift hover:shadow-glow-md hover:border-primary/40 relative overflow-hidden flex flex-col cursor-pointer ${selectionRing}`}
      data-testid={`lending-card-${lending.id}`}
      data-selected={selectable ? (selected ? "true" : "false") : undefined}
      onClick={openDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
    >
      {selectable && (
        <div className="absolute top-1.5 right-1.5 z-20 pointer-events-none">
          <div
            className={`w-5 h-5 rounded border flex items-center justify-center ${
              selected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-background/80 border-border/60"
            }`}
          >
            {selected && <Check className="w-3 h-3" />}
          </div>
        </div>
      )}
      {/* Hover-to-undress: click handling is on the outer card now. */}
      <div
        className="relative aspect-square flex items-center justify-center w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {g ? (
          <GotchiSvg
            gotchiId={lending.gotchiTokenId}
            hauntId={g.hauntId}
            collateral={g.collateral}
            numericTraits={traits}
            equippedWearables={activeWearables}
            mode="preview"
            className="w-full h-full"
            useBlobUrl
          />
        ) : (
          <div className="w-full h-full bg-muted/40 animate-pulse" />
        )}

        <div className="absolute top-1 left-1 flex items-center gap-1">
          {lending.channellingAllowed && (
            <span
              className="bg-amber-500/90 text-amber-950 text-[9px] font-semibold px-1 rounded flex items-center gap-0.5"
              title="Channelling allowed"
            >
              <Zap className="w-2.5 h-2.5" /> CH
            </span>
          )}
          {!isOpen && (
            <span
              className="bg-cyan-500/90 text-cyan-950 text-[9px] font-semibold px-1 rounded flex items-center gap-0.5"
              title={`Whitelist required: ${wlLabel}`}
            >
              <Lock className="w-2.5 h-2.5" /> WL
            </span>
          )}
        </div>

        <div className="absolute top-1 right-1">
          <span className={`text-[9px] font-semibold px-1 rounded ${colors.text} bg-background/80`}>
            BRS {lending.gotchiBRS}
          </span>
        </div>
      </div>

      <div className="px-2 py-1.5 flex flex-col gap-1 flex-1">
        <div className="flex items-center justify-between gap-1 min-h-[16px]">
          <span className="text-xs font-semibold truncate flex-1">
            {g?.name || "Unnamed"}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono shrink-0">
            #{lending.gotchiTokenId}
          </span>
        </div>

        {/* Gotchi stats — mirrors the explorer card so users see the same
            shape of info on lending listings they're considering. */}
        {g && (
          <>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span className="bg-muted/50 px-1 rounded" title="Haunt">
                H{g.hauntId}
              </span>
            </div>

            <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
              <span title="Kinship">KIN <span className="text-foreground">{g.kinship || 0}</span></span>
              <span title="Level">LVL <span className="text-foreground">{g.level}</span></span>
            </div>

            <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px]">
              {renderTraits.slice(0, 6).map((val, i) => {
                // Match explorer's "extreme" rule. EYS/EYC use the 0-99 scale;
                // NRG/AGG/SPK/BRN can be signed offsets from 50 in the raw
                // subgraph data — the same `val <= 10 || val >= 90` test
                // happens to also flag those (negatives + 99-mapped values).
                const isExtreme = val <= 10 || val >= 90;
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{TRAIT_ABBR[i]}</span>
                    <span className={isExtreme ? "text-purple-400 font-semibold" : "text-foreground"}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/30">
          <div className="flex items-center gap-1 text-green-500 font-semibold">
            <Coins className="w-3 h-3" />
            <span>{ghst}</span>
            <span className="text-[8px] text-muted-foreground font-normal">GHST</span>
          </div>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{periodLabel}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span title="Borrower revenue split">
            B {lending.splitBorrower}% / L {lending.splitOwner}%
            {lending.splitOther > 0 ? ` / 3p ${lending.splitOther}%` : ""}
          </span>
          <span title="Effective price per day">{perDay}</span>
        </div>

        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground truncate max-w-[60%]" title={wlLabel}>
            {wlLabel}
          </span>
        </div>
      </div>
    </div>
  );
});
