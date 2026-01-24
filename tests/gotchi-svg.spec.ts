import { test, expect } from "@playwright/test";

const OWNER_WITH_GOTCHIS = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";

test("gotchi svg renders after loading dress page", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);

  // Wait for carousel to render
  await expect(page.getByRole("button", { name: "Edit This Gotchi" })).toBeVisible({
    timeout: 20000,
  });

  // Expect at least one SVG to render inside gotchi containers
  const svgLocator = page.locator("[data-testid='gotchi-svg-content'] svg");
  await expect(svgLocator.first()).toBeVisible({ timeout: 20000 });
});

