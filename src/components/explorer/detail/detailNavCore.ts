// Pure, framework-free logic for detail-dialog navigation. Kept separate from
// the React/router wiring in useDetailNav so it can be unit-tested without a DOM
// (the repo has no jsdom/testing-library — only pure-function vitest specs).

export type NavView<T> = {
  open: T | null;
  index: number;
  hasPrev: boolean;
  hasNext: boolean;
  shareUrl: string | null;
};

/** Resolve the currently-open item + neighbour availability from an ordered list. */
export function navView<T>(items: T[], getId: (i: T) => string, asset: string, openId: string | null): NavView<T> {
  const index = openId == null ? -1 : items.findIndex((i) => getId(i) === openId);
  const open = index >= 0 ? items[index] : null;
  return {
    open,
    index,
    hasPrev: index > 0,
    hasNext: index >= 0 && index < items.length - 1,
    shareUrl: open ? `?asset=${asset}&id=${getId(open)}` : null,
  };
}

/** Id of the neighbour `delta` steps from the open item, or null at the bounds. */
export function neighborId<T>(items: T[], getId: (i: T) => string, openId: string | null, delta: number): string | null {
  if (openId == null) return null;
  const index = items.findIndex((i) => getId(i) === openId);
  if (index < 0) return null;
  const ni = index + delta;
  if (ni < 0 || ni >= items.length) return null;
  return getId(items[ni]);
}

/** True when advancing forward should trigger a load-more (open item is last, more exist). */
export function atForwardEdge<T>(items: T[], getId: (i: T) => string, openId: string | null, hasMore: boolean): boolean {
  if (!hasMore || openId == null || items.length === 0) return false;
  return getId(items[items.length - 1]) === openId;
}

/** The id to auto-open from URL params, or null if they don't target this asset/list. */
export function adoptedId(paramAsset: string | null, paramId: string | null, asset: string, isPresent: (id: string) => boolean): string | null {
  if (paramAsset !== asset || !paramId) return null;
  return isPresent(paramId) ? paramId : null;
}
