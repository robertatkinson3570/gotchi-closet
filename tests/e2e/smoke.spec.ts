import { test, expect, type Page } from "@playwright/test";

// Deterministic smoke suite for the critical user journeys. All external calls
// (subgraphs, RPC, SVG API) are stubbed so the tests never depend on live data
// or third-party uptime — they assert the app shell, navigation, and the
// marketplace tab structure render and don't crash.
test.use({ headless: true });

async function stubNetwork(page: Page) {
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
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test("app shell + global nav load", async ({ page }) => {
  await stubNetwork(page);
  const errors = trackPageErrors(page);
  await page.goto("/");
  await expect(page.getByRole("img", { name: "GotchiCloset" }).first()).toBeVisible();
  // Global nav links present on every page.
  await expect(page.getByTitle("Explorer / Baazaar")).toBeVisible();
  await expect(page.getByTitle("My Profile")).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("explorer renders all marketplace tabs", async ({ page }) => {
  await stubNetwork(page);
  const errors = trackPageErrors(page);
  await page.goto("/explorer");
  for (const tab of ["Gotchis", "Wearables", "Items", "Parcels", "Installations", "Tiles", "Auctions"]) {
    await expect(page.getByTitle(tab, { exact: true })).toBeVisible();
  }
  // Switching to a market tab swaps the content without crashing.
  await page.getByTitle("Parcels", { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByTitle("Auctions", { exact: true }).click();
  await page.waitForTimeout(500);
  expect(errors, errors.join("\n")).toHaveLength(0);
});

for (const route of ["/activity", "/me", "/lending/lands", "/dress", "/lending"]) {
  test(`route ${route} mounts without crashing`, async ({ page }) => {
    await stubNetwork(page);
    const errors = trackPageErrors(page);
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(400);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
}
