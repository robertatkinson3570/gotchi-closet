import { test, expect } from "@playwright/test";
import { stubNetwork, trackPageErrors } from "./_helpers";

// Deterministic smoke suite for the critical user journeys. All external calls
// (subgraphs, RPC, SVG API) are stubbed (see _helpers) so the tests never
// depend on live data or third-party uptime — they assert the app shell,
// navigation, and the marketplace tab structure render and don't crash.
test.use({ headless: true });

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
