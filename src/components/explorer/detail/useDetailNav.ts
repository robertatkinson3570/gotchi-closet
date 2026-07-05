import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { navView, neighborId, atForwardEdge, adoptedId, type NavView } from "./detailNavCore";

export type DetailNavOptions<T> = {
  /** The ordered, currently-filtered list backing the grid. */
  items: T[];
  getId: (item: T) => string;
  /** URL discriminator, e.g. "gotchi" | "wearable" | "item" | "auction". */
  asset: string;
  /** Set false for grids that shouldn't own the ?asset=&id= params. Default true. */
  urlSync?: boolean;
  /** Called when next() is invoked on the last loaded item and more can be fetched. */
  onNeedMore?: () => void;
  hasMore?: boolean;
};

export type DetailNav<T> = NavView<T> & {
  openItem: (item: T) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
};

/**
 * Controller for a detail dialog: which item is open, its neighbours, and URL
 * deep-linking (?asset=&id=). Backed by the pure helpers in detailNavCore.
 */
export function useDetailNav<T>({
  items, getId, asset, urlSync = true, onNeedMore, hasMore = false,
}: DetailNavOptions<T>): DetailNav<T> {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep-link entry: adopt the URL's id once, if it targets this asset and is loaded.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !urlSync) return;
    const id = adoptedId(params.get("asset"), params.get("id"), asset, (x) => items.some((it) => getId(it) === x));
    if (id) { adopted.current = true; setOpenId(id); }
  }, [params, asset, items, getId, urlSync]);

  const view = navView(items, getId, asset, openId);

  const writeUrl = useCallback((id: string | null) => {
    if (!urlSync) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id == null) { next.delete("asset"); next.delete("id"); }
      else { next.set("asset", asset); next.set("id", id); }
      return next;
    }, { replace: true });
  }, [setParams, asset, urlSync]);

  const openItem = useCallback((item: T) => { const id = getId(item); setOpenId(id); writeUrl(id); }, [getId, writeUrl]);
  const close = useCallback(() => { setOpenId(null); writeUrl(null); }, [writeUrl]);

  const go = useCallback((delta: number) => {
    if (delta > 0 && atForwardEdge(items, getId, openId, hasMore)) { onNeedMore?.(); return; }
    const id = neighborId(items, getId, openId, delta);
    if (id == null) return;
    setOpenId(id); writeUrl(id);
  }, [items, getId, openId, hasMore, onNeedMore, writeUrl]);

  return {
    ...view,
    openItem, close,
    next: () => go(1),
    prev: () => go(-1),
  };
}
