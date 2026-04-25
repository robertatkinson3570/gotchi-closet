import type { Lending } from "@/lib/lending/types";
import { LendingCard } from "./LendingCard";

type Props = {
  lendings: Lending[];
  loading: boolean;
  error: string | null;
};

export function LendingGrid({ lendings, loading, error }: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-destructive">
        <div className="text-4xl mb-2">⚠️</div>
        <div className="text-sm font-medium">Failed to load lendings</div>
        <div className="text-xs mt-1 text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!loading && lendings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="text-4xl mb-2">👻</div>
        <div className="text-sm">No listings match these filters</div>
        <div className="text-xs mt-1">Try clearing filters or searching</div>
      </div>
    );
  }

  if (loading && lendings.length === 0) {
    return (
      <div className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 md:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-3" data-testid="lending-grid">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 md:gap-3">
        {lendings.map((l) => (
          <LendingCard key={l.id} lending={l} />
        ))}
      </div>
    </div>
  );
}
