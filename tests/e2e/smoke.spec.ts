import { test, expect } from "@playwright/test";
import { stubNetwork, trackPageErrors } from "./_helpers";

// Deterministic smoke suite for the critical user journeys. All external calls
// (subgraphs, RPC, SVG API) are stubbed (see _helpers) so the tests never
// depend on live data or third-party uptime — they assert the app shell,
// navigation, and that every route renders and doesn't crash. Real-data and
// transaction-encoding coverage lives in tests/e2e/live/.
test.use({ headless: true });

test("app shell + global nav load", async ({ page }) => {
  await stubNetwork(page);
  const errors = trackPageErrors(page);
  await page.goto("/");
  await expect(page.getByRole("img", { name: "GotchiCloset" }).first()).toBeVisible();
  // Global nav links present on every page (current nav set).
  // Steward is intentionally hidden from the nav while it's vetted (VITE_STEWARD_NAV gate).
  for (const title of ["Explorer / Baazaar", "Activity", "Forge", "Lending", "DAO & Community"]) {
    await expect(page.getByTitle(title, { exact: true })).toBeVisible();
  }
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("explorer renders all marketplace tabs", async ({ page }) => {
  await stubNetwork(page);
  const errors = trackPageErrors(page);
  await page.goto("/explorer");
  for (const tab of [
    "Gotchis",
    "Wearables",
    "Items",
    "Parcels",
    "Installations",
    "Tiles",
    "Portals",
    "FAKE Gotchis",
    "FAKE Cards",
    "Forge",
    "Auctions",
  ]) {
    await expect(page.getByTitle(tab, { exact: true })).toBeVisible();
  }
  // Switching tabs swaps content without crashing.
  await page.getByTitle("Parcels", { exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByTitle("Auctions", { exact: true }).click();
  await page.waitForTimeout(400);
  expect(errors, errors.join("\n")).toHaveLength(0);
});

// Every route in the router must mount without throwing. Param routes use
// representative sample values; with stubbed empty data they should render an
// empty/"not found" state, never crash.
const SAMPLE_ADDR = "0x0000000000000000000000000000000000000001";
const ROUTES = [
  "/",
  "/explorer",
  "/baazaar",
  "/dress",
  "/wardrobe-lab",
  "/sets",
  "/sets/aagent",
  "/traits",
  "/traits/energy",
  "/rarity-score",
  "/wearables",
  "/wearable/aagent",
  "/gotchi/4895",
  "/me",
  "/me/activity",
  `/u/${SAMPLE_ADDR}`,
  `/u/${SAMPLE_ADDR}/activity`,
  "/activity",
  "/stats",
  "/leaderboard",
  "/dao",
  "/get-tokens",
  "/forge",
  "/steward",
  "/soul/verify/4895",
  "/g/4895",
  "/arena/4895/vs/4896",
  "/lending",
  "/lending/analytics",
  "/lending/me",
  "/lending/lands",
  "/lending/me/list",
  "/lending/whitelists",
];

for (const route of ROUTES) {
  test(`route ${route} mounts without crashing`, async ({ page }) => {
    await stubNetwork(page);
    const errors = trackPageErrors(page);
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(400);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
}
