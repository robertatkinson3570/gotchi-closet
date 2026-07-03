const TRAIT_LABELS = ["NRG", "AGG", "SPK", "BRN"] as const;

/**
 * Read-only trait rows for the explorer Equip modal: base → (modified) per
 * NRG/AGG/SPK/BRN with the per-slot W:/S: modifier breakdown. Mirrors the dress
 * page's GotchiCard trait rows without the respec controls, which are tangled
 * with store state we deliberately keep out of Phase 1.
 */
export function LiveTraitPanel({
  baseTraits,
  finalTraits,
  wearableDelta,
  setDelta,
}: {
  /** Birth/respec base traits (no wearables), first 4 used. */
  baseTraits: number[];
  /** Traits with wearable + set modifiers applied, first 4 used. */
  finalTraits: number[];
  /** Per-trait wearable modifier total [NRG,AGG,SPK,BRN]. */
  wearableDelta?: number[];
  /** Per-trait set modifier total [NRG,AGG,SPK,BRN]. */
  setDelta?: number[];
}) {
  const safe = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return (
    <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
      <div className="text-[11px] font-semibold text-muted-foreground">Traits</div>
      {TRAIT_LABELS.map((label, i) => {
        const base = safe(baseTraits[i]);
        const modified = safe(finalTraits[i]);
        const wMod = safe(wearableDelta?.[i]);
        const sMod = safe(setDelta?.[i]);
        const hasBreakdown = wMod !== 0 || sMod !== 0;
        const changed = modified !== base;
        return (
          <div key={label} className="flex items-center justify-between text-[11px]" data-testid={`equip-trait-row-${label}`}>
            <span className="text-muted-foreground">{label}</span>
            <span className="flex items-center gap-1.5">
              {hasBreakdown && (
                <span className="text-[9px] text-muted-foreground">
                  {wMod !== 0 && <span>W:{wMod >= 0 ? `+${wMod}` : wMod}</span>}
                  {wMod !== 0 && sMod !== 0 && <span> | </span>}
                  {sMod !== 0 && <span className="text-purple-400">S:{sMod >= 0 ? `+${sMod}` : sMod}</span>}
                </span>
              )}
              <span className="tabular-nums" data-testid={`equip-trait-value-${label}`}>
                {base}
                {changed && (
                  <>
                    {" ("}
                    <span className={modified > base ? "text-emerald-400" : "text-rose-400"}>{modified}</span>
                    {")"}
                  </>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
