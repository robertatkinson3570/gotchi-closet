import { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { FamilyPhotoItem } from "./FamilyPhotoItem";
import type { ExplorerGotchi } from "@/lib/explorer/types";

type Props = {
  gotchis: ExplorerGotchi[];
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onLoadMore: () => void;
};

export function FamilyPhotoGrid({ gotchis, loading, hasMore, error, onLoadMore }: Props) {
  const loaderRef = useRef<HTMLDivElement>(null);

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
        <div className="text-xs mt-1">Connect wallet to see your gotchis</div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-xs text-muted-foreground">
          {gotchis.length} gotchi{gotchis.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div 
        data-family-photo="true"
        className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1 bg-background"
      >
        {gotchis.map((gotchi) => (
          <FamilyPhotoItem
            key={gotchi.id}
            gotchi={gotchi}
          />
        ))}
      </div>

      <div ref={loaderRef} className="flex justify-center py-6">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        )}
        {!hasMore && gotchis.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Your complete collection: {gotchis.length} gotchis
          </div>
        )}
      </div>
    </div>
  );
}
