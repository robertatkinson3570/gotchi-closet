import { lazy, type ComponentType } from "react";

// A redeploy invalidates the old code-split chunk hashes. A browser still running
// the previous index.html will 404 on import() of a route chunk, surfacing as
// "Failed to fetch dynamically imported module". Retry once via a hard reload so
// the client picks up the fresh index; session-guarded so it can never loop.
const RELOAD_KEY = "gc-chunk-reload";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        // The reload takes over; never resolve so React doesn't render an error.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
