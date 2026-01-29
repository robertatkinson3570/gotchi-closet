import { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { GotchiExplorerCard } from "./GotchiExplorerCard";
import type { ExplorerGotchi } from "@/lib/explorer/types";
import { useTraitFrequency } from "@/hooks/useTraitFrequency";

type Props = {
  gotchis: ExplorerGotchi[];
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onLoadMore: () => void;
};

export function ExplorerGrid({ gotchis, loading, hasMore, error, onLoadMore }: Props) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const { loading: frequencyLoading, getRarities } = useTraitFrequency(gotchis);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "200px",
    });

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [handleIntersection]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-destructive">
        <div className="text-4xl mb-2">⚠️</div>
        <div className="text-sm font-medium">Failed to load gotchis</div>
        <div className="text-xs mt-1 text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (gotchis.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="text-4xl mb-2">👻</div>
        <div className="text-sm">No gotchis found</div>
        <div className="text-xs mt-1">Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 md:gap-3">
        {gotchis.map((gotchi) => (
          <GotchiExplorerCard
            key={gotchi.id}
            gotchi={gotchi}
            eyeRarities={getRarities(gotchi)}
            frequencyLoading={frequencyLoading}
          />
        ))}
      </div>

      <div ref={loaderRef} className="flex justify-center py-8">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        {!hasMore && gotchis.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing all {gotchis.length} gotchis
          </div>
        )}
      </div>
    </div>
  );
}
