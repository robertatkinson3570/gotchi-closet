import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Image, Type } from "lucide-react";
import { FamilyPhotoItem } from "./FamilyPhotoItem";
import type { ExplorerGotchi } from "@/lib/explorer/types";

type Props = {
  gotchis: ExplorerGotchi[];
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onLoadMore: () => void;
  onSelectGotchi: (gotchi: ExplorerGotchi) => void;
};

const TEXT_ONLY_KEY = "gc_familyPhoto_textOnly";

export function FamilyPhotoGrid({ gotchis, loading, hasMore, error, onLoadMore, onSelectGotchi }: Props) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const [textOnly, setTextOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(TEXT_ONLY_KEY) === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem(TEXT_ONLY_KEY, String(textOnly));
  }, [textOnly]);

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

  const gridCols = textOnly
    ? "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-14"
    : "grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12";

  return (
    <div className="p-2 md:p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-xs text-muted-foreground">
          {gotchis.length} gotchi{gotchis.length !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center border rounded overflow-hidden">
          <button
            onClick={() => setTextOnly(false)}
            className={`p-1.5 transition-colors ${!textOnly ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            title="Thumbnails"
          >
            <Image className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setTextOnly(true)}
            className={`p-1.5 transition-colors ${textOnly ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            title="Text only"
          >
            <Type className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={`grid ${gridCols} gap-1`}>
        {gotchis.map((gotchi) => (
          <FamilyPhotoItem
            key={gotchi.id}
            gotchi={gotchi}
            onClick={() => onSelectGotchi(gotchi)}
            textOnly={textOnly}
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
