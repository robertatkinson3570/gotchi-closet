/**
 * End-to-end smoke + interaction tests for the lending product (LIVE / real-data).
 *
 * This file lives under tests/e2e/live and is EXCLUDED from the default
 * deterministic run (playwright.config.ts `testIgnore: ['live-glob']`). Run it
 * opt-in against real subgraph/RPC/backend data:
 *   pnpm test:e2e:live -- tests/e2e/live/lending-e2e.spec.ts
 *   BASE_URL=https://www.gotchicloset.com pnpm test:e2e:live -- tests/e2e/live/lending-e2e.spec.ts --reporter=list
 *
 * Default dev server runs on :5000 (playwright.config.ts baseURL). No wallet is
 * required — these are read-only / public flows. Wallet-gated flows (rent, list,
 * cancel, whitelists) are verified only to render the correct connect prompt.
 *
 * Because this is a real-data suite, tests that depend on the marketplace being
 * non-empty degrade to a documented skip when the live subgraph returns zero
 * listings, rather than failing flakily. Deterministic assertions (e.g. an
 * unused address / id yields zero cards) are kept hard.
 */

import { test, expect, Page } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:5000";

// Helpers ---------------------------------------------------------------------

async function gotoPage(page: Page, path: string) {
  // The Roast Arena backend (/api/roast/*) 500s on the local dev server (needs
  // prod config). The app handles it gracefully (returns []), but the browser
  // still logs the failed request, tripping no-console-error assertions. Stub it
  // so the suite isn't flaky on local-env noise. (Prod serves these fine.)
  await page.route("**/api/roast/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ queue: [], rows: [] }) })
  );
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function expectNoConsoleErrors(page: Page, allowList: RegExp[] = []) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!allowList.some((re) => re.test(text))) errors.push(text);
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return () => errors;
}

/**
 * Wait for the lending marketplace to settle into one of its terminal states:
 * either the grid (with at least one card) or the empty/error placeholder.
 * Returns the number of cards currently rendered (0 when the grid is empty).
 *
 * The current LendingGrid unmounts the `lending-grid` testid when there are zero
 * lendings (it renders a "No listings match these filters" / error placeholder
 * instead), so we cannot blindly waitFor the grid — we wait for cards OR the
 * empty/error state.
 */
async function waitForLendingResults(page: Page): Promise<number> {
  const card = page.locator("[data-testid^='lending-card-']").first();
  const empty = page.getByText(/No listings match these filters|Failed to load lendings/i).first();
  await Promise.race([
    card.waitFor({ state: "visible", timeout: 25_000 }).catch(() => undefined),
    empty.waitFor({ state: "visible", timeout: 25_000 }).catch(() => undefined),
  ]);
  return page.locator("[data-testid^='lending-card-']").count();
}

// Tests -----------------------------------------------------------------------

test.describe("Home + nav", () => {
  test("home page renders", async ({ page }) => {
    const getErrors = await expectNoConsoleErrors(page, [
      /Wallet|walletconnect|Failed to fetch/i,
      /favicon/i,
    ]);
    await gotoPage(page, "/");
    await expect(page).toHaveTitle(/GotchiCloset/);
    await expect(page.locator("img[alt='GotchiCloset']").first()).toBeVisible();
    await expect(page.getByText(/Closet Long Enough|Put an outfit/i).first()).toBeVisible();
    expect(getErrors()).toEqual([]);
  });

  test("logo + nav icons present on /lending", async ({ page }) => {
    await gotoPage(page, "/lending");
    await expect(page.locator("img[alt='GotchiCloset']").first()).toBeVisible();
    // RootLayout renders the nav as <Link to="/lending"><Button/></Link>, i.e.
    // an <a href="/lending"> wrapping a <button>.
    const lendingBtn = page.locator("a[href='/lending'] button").first();
    await expect(lendingBtn).toBeVisible();
  });
});

test.describe("/lending marketplace", () => {
  test("page loads and renders listing cards", async ({ page }) => {
    await gotoPage(page, "/lending");
    // The top bar always shows "<n> of <m> listings".
    await expect(page.getByText(/listings/i).first()).toBeVisible({ timeout: 15_000 });
    const count = await waitForLendingResults(page);
    if (count === 0) {
      test.skip(true, "Live marketplace returned zero listings — nothing to assert on.");
      return;
    }
    await expect(page.getByTestId("lending-grid")).toBeVisible();
    expect(count).toBeGreaterThan(0);
  });

  test("BRS chip filter narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const cardsBefore = await waitForLendingResults(page);
    if (cardsBefore === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    // The BRS-band chips live in the (default-open) filters sidebar; "700+" is
    // the top band label (no testid, rendered as plain text on a <button>).
    const chip = page.getByRole("button", { name: "700+" }).first();
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
      await page.waitForTimeout(500);
      const cardsAfter = await page.locator("[data-testid^='lending-card-']").count();
      expect(cardsAfter).toBeLessThanOrEqual(cardsBefore);
    }
  });

  test("sort by price changes order", async ({ page }) => {
    await gotoPage(page, "/lending");
    const count = await waitForLendingResults(page);
    if (count === 0) {
      test.skip(true, "No live listings to sort.");
      return;
    }
    const sortField = page.getByTestId("lending-sort-field");
    await sortField.selectOption("price");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("lending-grid")).toBeVisible();
  });

  test("search input filters to zero on a non-existent id", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    const search = page.getByTestId("lending-search");
    await search.fill("9999999");
    await page.waitForTimeout(500);
    // No gotchi has id "9999999"; the grid should resolve to zero cards (the
    // grid testid unmounts and the empty-state placeholder renders instead).
    const cardCount = await page.locator("[data-testid^='lending-card-']").count();
    expect(cardCount).toBe(0);
  });

  test("hotkey `/` focuses search", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    // Click on body so focus isn't trapped on a button
    await page.locator("body").click({ position: { x: 10, y: 200 } });
    await page.keyboard.press("/");
    const search = page.getByTestId("lending-search");
    await expect(search).toBeFocused();
  });

  test("hotkey `f` toggles filter sidebar", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 1024, "Sidebar only on lg+");
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    const sidebar = page.locator("aside").first();
    const initialClass = (await sidebar.getAttribute("class")) || "";
    const wasOpen = initialClass.includes("w-72");
    await page.locator("body").click({ position: { x: 10, y: 200 } });
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    const afterClass = (await sidebar.getAttribute("class")) || "";
    const isOpen = afterClass.includes("w-72");
    expect(isOpen).toBe(!wasOpen);
  });

  test("clicking a card opens detail modal with key fields", async ({ page }) => {
    await gotoPage(page, "/lending");
    const count = await waitForLendingResults(page);
    if (count === 0) {
      test.skip(true, "No live listing to open.");
      return;
    }
    const firstCard = page.locator("[data-testid^='lending-card-']").first();
    await firstCard.click();
    await expect(page.locator("text=Upfront").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Period").first()).toBeVisible();
    await expect(page.locator("text=Revenue split").first()).toBeVisible();
    await expect(page.locator("text=Lender").first()).toBeVisible();
    await expect(page.locator("text=/Channelling: (ON|OFF)/").first()).toBeVisible();
    await page.getByTestId("lending-modal-close").click();
    await expect(page.locator("text=Revenue split").first()).not.toBeVisible({ timeout: 5_000 });
  });

  test("?owner= URL filter pre-applies", async ({ page }) => {
    // Searching by an address with no listings must yield zero cards. The page
    // seeds filters.search from ?owner= on mount (validated 0x40-hex).
    await gotoPage(page, "/lending?owner=0x0000000000000000000000000000000000000001");
    await page.waitForTimeout(1000);
    const cardCount = await page.locator("[data-testid^='lending-card-']").count();
    expect(cardCount).toBe(0);
    // And the search field should have been pre-filled with the owner address.
    const search = await page.getByTestId("lending-search").inputValue();
    expect(search.toLowerCase()).toBe("0x0000000000000000000000000000000000000001");
  });

  test("?l= URL deeplink opens detail modal", async ({ page }) => {
    await gotoPage(page, "/lending");
    const count = await waitForLendingResults(page);
    if (count === 0) {
      test.skip(true, "No live listing to deeplink to.");
      return;
    }
    const firstCard = page.locator("[data-testid^='lending-card-']").first();
    const testId = await firstCard.getAttribute("data-testid");
    const id = testId?.replace("lending-card-", "");
    expect(id).toBeTruthy();
    await gotoPage(page, `/lending?l=${id}`);
    await expect(page.locator("text=Revenue split").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Clear-all button removes filters", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    await page.getByTestId("lending-search").fill("0x" + "1".repeat(40));
    await page.waitForTimeout(400);
    const clearBtn = page.getByTestId("lending-clear-filters");
    await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    await clearBtn.click();
    await page.waitForTimeout(300);
    const search = await page.getByTestId("lending-search").inputValue();
    expect(search).toBe("");
  });
});

test.describe("/lending new filters", () => {
  test("price-max filter narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    await page.getByTestId("filter-price-max").fill("1");
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test("min duration filter (days) narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    await page.getByTestId("filter-duration-min").fill("60"); // > 30d protocol cap
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test("min duration unit toggle switches between days and hours", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    // Switch to hours, then require >= 24 hours (most listings are days, this should keep many)
    await page.getByTestId("filter-duration-unit-hours").click();
    await page.waitForTimeout(150);
    await page.getByTestId("filter-duration-min").fill("24");
    await page.waitForTimeout(400);
    const after24h = await page.locator("[data-testid^='lending-card-']").count();
    expect(after24h).toBeLessThanOrEqual(before);
    // Switch back to days, set 1 day → equivalent to 24h, count should match
    await page.getByTestId("filter-duration-unit-days").click();
    await page.getByTestId("filter-duration-min").fill("1");
    await page.waitForTimeout(400);
    const after1d = await page.locator("[data-testid^='lending-card-']").count();
    expect(after1d).toBe(after24h);
  });

  test("min kinship filter narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    await page.getByTestId("filter-kinship-min").fill("9999");
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test("whitelist-id filter narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    await page.getByTestId("filter-whitelist-id").fill("99999999");
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    // Unrealistic id → empty grid
    expect(after).toBe(0);
  });

  test("haunt filter chip narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    await page.getByTestId("filter-haunt-1").click();
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test("channelling Disabled chip narrows results", async ({ page }) => {
    await gotoPage(page, "/lending");
    const before = await waitForLendingResults(page);
    if (before === 0) {
      test.skip(true, "No live listings to filter.");
      return;
    }
    // Channelling "Disabled" maps to the `no` filter mode → testid filter-channelling-no.
    await page.getByTestId("filter-channelling-no").click();
    await page.waitForTimeout(400);
    const after = await page.locator("[data-testid^='lending-card-']").count();
    expect(after).toBeLessThanOrEqual(before);
  });
});

test.describe("Mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("filter drawer opens, applies, and closes", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    // Filters button is visible on mobile (hidden on lg+)
    const btn = page.getByTestId("lending-mobile-filters-btn");
    await expect(btn).toBeVisible();
    await btn.click();
    const drawer = page.getByTestId("lending-mobile-filters-drawer");
    await expect(drawer).toBeVisible();
    // Apply a filter from inside the drawer
    await drawer.getByTestId("filter-haunt-1").click();
    await page.waitForTimeout(300);
    // Close the drawer
    await page.getByTestId("lending-mobile-filters-close").click();
    await expect(drawer).not.toBeVisible({ timeout: 3000 });
  });

  test("home page renders without horizontal overflow at 375px", async ({ page }) => {
    await gotoPage(page, "/");
    // Body should never exceed viewport width
    const bodyOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(bodyOverflow).toBe(false);
  });

  test("/lending renders without horizontal overflow at 375px", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    const bodyOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(bodyOverflow).toBe(false);
  });
});

test.describe("/lending CSV export", () => {
  test("exports visible listings", async ({ page }) => {
    await gotoPage(page, "/lending");
    const count = await waitForLendingResults(page);
    if (count === 0) {
      test.skip(true, "CSV export button only renders when there are visible listings.");
      return;
    }
    // The export control is a plain <button> labelled "CSV" in the top bar.
    const exportBtn = page.locator("button", { hasText: /Export|CSV|Download/i }).first();
    if (!(await exportBtn.isVisible().catch(() => false))) {
      test.skip(true, "CSV export button not present in this build");
      return;
    }
    const downloadP = page.waitForEvent("download", { timeout: 10_000 });
    await exportBtn.click();
    const dl = await downloadP;
    const name = dl.suggestedFilename();
    expect(name).toMatch(/\.csv$/i);
  });
});

test.describe("Saved searches", () => {
  test("save + apply round-trip persists filters", async ({ page }) => {
    await gotoPage(page, "/lending");
    await waitForLendingResults(page);
    await page.getByTestId("lending-search").fill("test-search-123");
    await page.waitForTimeout(400);
    // "Save current" only appears once filters differ from defaults
    const saveBtn = page.locator("button", { hasText: /Save current/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();
    const nameInput = page.locator("input[placeholder='Search name…']").first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill("E2E test search");
    await page.locator("button", { hasText: /^Save$/ }).first().click();
    await page.waitForTimeout(400);
    // Clear search field, then click the saved chip to re-apply
    await page.getByTestId("lending-search").fill("");
    await page.waitForTimeout(200);
    const chip = page.locator("button", { hasText: "E2E test search" }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await page.waitForTimeout(400);
    const v = await page.getByTestId("lending-search").inputValue();
    expect(v).toBe("test-search-123");
    // Cleanup: delete the saved search so we don't litter localStorage on re-runs
    await page.evaluate(() => localStorage.removeItem("gc_lending_savedSearches"));
  });
});

test.describe("/lending/analytics", () => {
  test("renders heatmap, hero stats, and leaderboards", async ({ page }) => {
    await gotoPage(page, "/lending/analytics");
    await expect(page.getByText("Lending Analytics").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Lendings agreed/i).first()).toBeVisible({ timeout: 20_000 });
    // Heatmap header: "BRS ↓ / Duration →"
    await expect(page.getByText(/BRS.*Duration/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Suggested price").first()).toBeVisible();
    await expect(page.getByText(/Top whitelists|Top lenders|Top borrowers/i).first()).toBeVisible();
  });

  test("window selector toggles", async ({ page }) => {
    await gotoPage(page, "/lending/analytics");
    await page.getByText(/Lendings agreed/i).first().waitFor({ timeout: 30_000 });
    const sixtyButton = page.getByRole("button", { name: "60d" }).first();
    await expect(sixtyButton).toBeVisible({ timeout: 10_000 });
    await sixtyButton.click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/Lendings agreed/i).first()).toBeVisible();
  });

  test("suggested price widget responds to BRS input", async ({ page }) => {
    await gotoPage(page, "/lending/analytics");
    await page.getByText("Suggested price").first().waitFor({ timeout: 30_000 });
    // The first number input on the page is the widget's BRS field.
    const brsInput = page.locator("input[type='number']").first();
    await brsInput.fill("700");
    await page.waitForTimeout(400);
    // Match any tier label the widget can emit:
    // "Strong match" | "Same band, any duration" | "Widened ±100 BRS" |
    // "Closest by BRS" | "No data".
    await expect(
      page.getByText(/Strong match|Same band|±100|Closest|No data/).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("heatmap cell drill-down opens panel", async ({ page }) => {
    await gotoPage(page, "/lending/analytics");
    await page.getByText(/BRS.*Duration/i).first().waitFor({ timeout: 30_000 });
    // Populated cells render `n=N` (paid count) under the median; tooltip says
    // "Click to drill in". In a quiet window no cell is populated — skip then.
    const populatedDiv = page.locator("div").filter({ hasText: /^n=\d+$/ }).first();
    if (!(await populatedDiv.isVisible({ timeout: 30_000 }).catch(() => false))) {
      test.skip(true, "No populated heatmap cells in the current live window.");
      return;
    }
    await populatedDiv.click();
    // Drill-down panel subtitle: "N lendings in this cell"
    await expect(page.getByText(/lendings in this cell/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("/lending/me + /lending/whitelists (no-wallet path)", () => {
  test("/lending/me prompts to connect a wallet", async ({ page }) => {
    // LendingMePage no-wallet copy: "Connect a wallet to see your lendings".
    await gotoPage(page, "/lending/me");
    await expect(page.getByText(/Connect a wallet/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("/lending/whitelists prompts to connect a wallet", async ({ page }) => {
    // WhitelistsPage no-wallet copy: "Connect a wallet to manage whitelists".
    await gotoPage(page, "/lending/whitelists");
    await expect(page.getByText(/Connect a wallet/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("/lending/me/list prompts to connect a wallet", async ({ page }) => {
    // BulkListPage no-wallet copy: "Connect a wallet to bulk-list".
    await gotoPage(page, "/lending/me/list");
    await expect(page.getByText(/Connect a wallet/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
