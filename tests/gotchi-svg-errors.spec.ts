import { test, expect } from "@playwright/test";

const OWNER_WITH_GOTCHIS = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";

test("gotchi svg loads without RPC CORS errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  await expect(page.getByRole("button", { name: "Edit This Gotchi" })).toBeVisible({
    timeout: 20000,
  });

  const svgLocator = page.locator("[data-testid='gotchi-svg-content'] svg");
  await expect(svgLocator.first()).toBeVisible({ timeout: 20000 });

  const corsErrors = consoleErrors.filter((text) =>
    text.toLowerCase().includes("cors")
  );
  expect(corsErrors, `CORS errors detected: ${corsErrors.join("\n")}`).toEqual([]);
});

