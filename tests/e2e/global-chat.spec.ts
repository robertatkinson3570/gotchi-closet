import { test, expect } from "@playwright/test";

test("global tab shows the room feed from history", async ({ page }) => {
  await page.route("**/api/companion/premium/**", (r) => r.fulfill({ json: { active: false, daysLeft: 0, entitlement: null } }));
  await page.route("**/api/companion/history/**", (r) => r.fulfill({ json: { messages: [] } }));
  await page.route("**/api/companion/global/history**", (r) => r.fulfill({
    json: { messages: [{ id: 1, tokenId: "4", name: "Lao Tzu", text: "gm frens", isAI: false, ts: 1750000000000 }] },
  }));
  // EventSource: return an immediately-completing stream so the hook doesn't hang.
  await page.route("**/api/companion/global/stream", (r) => r.fulfill({ headers: { "content-type": "text/event-stream" }, body: ": connected\n\n" }));

  await page.goto("/");
  await page.getByLabel("open gotchi companion").click({ force: true });
  await page.getByRole("button", { name: "Global" }).click();
  await expect(page.getByText("gm frens")).toBeVisible();
});
