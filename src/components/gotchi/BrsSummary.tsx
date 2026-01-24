type BrsSummaryProps = {
  traitBase: number;
  traitWithMods: number;
  wearableFlat: number;
  setFlatBrs: number;
  ageBrs: number;
  totalBrs: number;
  className?: string;
};

function formatNumber(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : "0";
}

export function BrsSummary({ traitBase, totalBrs, className }: BrsSummaryProps) {
  return (
    <div className={`text-[11px] text-muted-foreground ${className ?? ""}`}>
      <div className="text-foreground font-medium" data-testid="rarity-score">
        Rarity Score {formatNumber(totalBrs)} ({formatNumber(traitBase)})
      </div>
      <div className="sr-only">
        <div>Trait BRS (base)</div>
        <div>{formatNumber(traitBase)}</div>
        <div>Total BRS</div>
        <div>{formatNumber(totalBrs)}</div>
      </div>
    </div>
  );
}

