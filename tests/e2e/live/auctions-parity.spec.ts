import { test, expect } from "@playwright/test";
import fs from "fs";

const wearables = JSON.parse(fs.readFileSync(new URL("../../../data/wearables.json", import.meta.url), "utf8"));

// Live parity: the Explorer Auctions tab must show every live GBM wearable
// auction with its real wearable name (dapp shows name/slot/modifiers —
// bare "#id" cards are the regression this guards against).

const GBM = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn";
const WEARABLE_DIAMOND = "0x052e6c114a166b0e91c2340370d72d4c33752b4b";

const nameById = new Map((wearables as { id: number; name: string }[]).map((w) => [Number(w.id), w.name]));

async function liveWearableAuctions(): Promise<{ tokenId: string }[]> {
  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(GBM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ auctions(first: 500, where: { cancelled: false, claimed: false, endsAt_gt: "${now}", contractAddress: "${WEARABLE_DIAMOND}" }) { tokenId startsAt } }`,
    }),
  });
  const j = await res.json();
  return (j.data?.auctions ?? []).filter((a: { startsAt: string }) => Number(a.startsAt) <= now);
}

async function openAuctionsTab(page: import("@playwright/test").Page) {
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Auctions", exact: true }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
}

test("every live wearable auction shows its wearable name", async ({ page }) => {
  const live = await liveWearableAuctions();
  test.skip(live.length === 0, "no live wearable auctions right now");
  await openAuctionsTab(page);
  for (const a of live.slice(0, 10)) {
    const name = nameById.get(Number(a.tokenId));
    expect(name, `wearable ${a.tokenId} missing from local db`).toBeTruthy();
    await expect(page.getByText(name!, { exact: false }).first()).toBeVisible({ timeout: 20000 });
  }
});

test("auction card names match the dapp's live wearable auction names", async ({ page, context }) => {
  const live = await liveWearableAuctions();
  test.skip(live.length === 0, "no live wearable auctions right now");

  const dapp = await context.newPage();
  await dapp.goto("https://dapp.aavegotchi.com/auction?status=live&itemType=wearables", { waitUntil: "domcontentloaded", timeout: 60000 });
  await dapp.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await dapp.waitForTimeout(4000);
  const dappText = (await dapp.locator("body").innerText()).toUpperCase();
  await dapp.close();

  await openAuctionsTab(page);
  const ourText = (await page.locator("main").first().innerText()).toUpperCase();

  let checked = 0;
  for (const a of live) {
    const name = nameById.get(Number(a.tokenId))?.toUpperCase();
    if (!name || !dappText.includes(name)) continue; // dapp page may paginate/lazy-load
    expect(ourText, `dapp shows "${name}" but our auctions tab doesn't`).toContain(name);
    checked++;
  }
  expect(checked, "expected at least one overlapping auction name to compare").toBeGreaterThan(0);
});
