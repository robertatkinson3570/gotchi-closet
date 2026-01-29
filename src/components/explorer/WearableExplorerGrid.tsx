import { useRef, useEffect, useCallback } from "react";
import { WearableExplorerCard } from "./WearableExplorerCard";
import { Loader2 } from "lucide-react";
import type { ExplorerWearable } from "@/lib/explorer/wearableTypes";

interface WearableExplorerGridProps {
  wearables: ExplorerWearable[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  mode: "all" | "mine" | "baazaar";
  quantities?: Record<number, number>;
  prices?: Record<number, string>;
  onCardClick?: (wearable: ExplorerWearable) => void;
}

export function WearableExplorerGrid({
  wearables,
  loading,
  hasMore,
  loadMore,
  mode,
  quantities = {},
  prices = {},
  onCardClick,
}: WearableExplorerGridProps) {
  const loaderRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loading) {
        loadMore();
      }
    },
    [hasMore, loading, loadMore]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "200px",
      threshold: 0,
    });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  if (wearables.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No wearables found
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
        {wearables.map((wearable) => (
          <WearableExplorerCard
            key={wearable.id}
            wearable={wearable}
            quantity={mode === "mine" ? quantities[wearable.id] : undefined}
            price={mode === "baazaar" ? prices[wearable.id] : undefined}
            onClick={() => onCardClick?.(wearable)}
          />
        ))}
      </div>

      <div ref={loaderRef} className="flex justify-center py-4">
        {loading && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
        {!loading && hasMore && (
          <div className="text-sm text-muted-foreground">Scroll for more...</div>
        )}
      </div>
    </div>
  );
}
