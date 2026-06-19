import { type Page } from "@playwright/test";

/**
 * Stub every external dependency (subgraphs, SVG/thumb API, RPC, image CDNs,
 * walletconnect) so deterministic e2e specs never touch live data or depend on
 * third-party uptime. Shared by the deterministic suite; the live/ specs that
 * assert on real data deliberately do NOT use this.
 */
export async function stubNetwork(page: Page) {
  // Subgraphs (Goldsky) -> empty but well-formed GraphQL responses.
  await page.route("**/api.goldsky.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) })
  );
  // SVG/thumbs API -> empty svg.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg: "<svg/>" }) })
  );
  // Any other third-party (RPC, image CDNs, walletconnect) -> abort cheaply.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => {
    const u = route.request().url();
    if (u.includes("goldsky.com") || u.includes("/api/")) return route.fallback();
    return route.abort();
  });
  // Public arena pages (/g, /arena) hit a backend API. Registered last so it
  // wins precedence: return 404 so they render their not-found state instead of
  // receiving the generic SVG-shaped /api/** stub (which would slip past the
  // null guard and crash on the malformed body).
  await page.route("**/api/arena/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) })
  );
}

/** Collect uncaught page errors so a spec can assert the page never threw. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}
