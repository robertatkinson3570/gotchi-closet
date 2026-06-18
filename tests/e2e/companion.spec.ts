import { test, expect } from "@playwright/test";
import { stubNetwork } from "./_helpers";

test("companion mascot opens the chat panel", async ({ page }) => {
  // Register companion-specific stubs before the broad network stub so they
  // take precedence (Playwright matches routes in registration order).
  await page.route("**/api/companion/chat", async (route) => {
    await route.fulfill({ json: { reply: "boo! i'm your gotchi 👻", deflected: false, tier: "free" } });
  });
  await page.route("**/api/companion/premium/**", async (route) => {
    await route.fulfill({ json: { active: false, daysLeft: 0, entitlement: null } });
  });

  // Stub all other external deps (subgraphs, SVG API, third-party) to keep
  // the test deterministic and offline.
  await stubNetwork(page);

  await page.goto("/");

  const mascot = page.getByLabel("open gotchi companion");
  await expect(mascot).toBeVisible();

  // force:true bypasses Playwright's stability check — the button is animated
  // (framer-motion infinite bounce) which makes it perpetually "not stable"
  // even though it is fully interactive.
  await mascot.click({ force: true });
  await expect(page.getByPlaceholder(/talk to your gotchi|connect wallet/)).toBeVisible();
});
