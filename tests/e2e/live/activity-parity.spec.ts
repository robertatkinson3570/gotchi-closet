import { test, expect } from "@playwright/test";
import fs from "fs";

const wearables = JSON.parse(fs.readFileSync(new URL("../../../data/wearables.json", import.meta.url), "utf8"));

// Live parity: /activity must show dapp-level item detail — names for 1155
// assets (not bare #id) and both sides (seller AND buyer) for wearable sales.

const CORE = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const GBM = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-gbm-baazaar-base/prod/gn";
const WEARABLE_DIAMOND = "0x052e6c114a166b0e91c2340370d72d4c33752b4b";

const nameById = new Map((wearables as { id: number; name: string }[]).map((w) => [Number(w.id), w.name]));

async function gql(url: string, query: string) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return (await res.json()).data;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

test("sales feed shows wearable names and the buyer side", async ({ page }) => {
  const d = await gql(CORE, `{ erc1155Purchases(first: 5, orderBy: timeLastPurchased, orderDirection: desc, where: { category: 0 }) { erc1155TypeId buyer recipient } }`);
  const purchases: { erc1155TypeId: string; buyer: string; recipient: string }[] = d?.erc1155Purchases ?? [];
  test.skip(purchases.length === 0, "no recent wearable purchases");

  await page.goto("/activity");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  const text = await page.locator("main").first().innerText();

  const p = purchases[0];
  const name = nameById.get(Number(p.erc1155TypeId));
  expect(name, `wearable ${p.erc1155TypeId} missing from local db`).toBeTruthy();
  expect(text, "sale row should show the wearable's name").toContain(name!);
  const buyer = (p.recipient || p.buyer || "").toLowerCase();
  expect(text.toLowerCase(), "sale row should show the buyer address").toContain(short(buyer).toLowerCase());
});

test("auctions feed shows wearable names, not bare #id rows", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  const d = await gql(GBM, `{ auctions(first: 20, where: { cancelled: false, claimed: false, endsAt_gt: "${now}", contractAddress: "${WEARABLE_DIAMOND}" }) { tokenId startsAt } }`);
  const live = (d?.auctions ?? []).filter((a: { startsAt: string }) => Number(a.startsAt) <= now);
  test.skip(live.length === 0, "no live wearable auctions right now");

  await page.goto("/activity");
  await page.getByRole("button", { name: "Auctions" }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  const text = await page.locator("main").first().innerText();

  const name = nameById.get(Number(live[0].tokenId));
  expect(name, `wearable ${live[0].tokenId} missing from local db`).toBeTruthy();
  expect(text, "auction row should show the wearable's name").toContain(name!);
});

test("offers feed still renders rows", async ({ page }) => {
  await page.goto("/activity");
  await page.getByRole("button", { name: "Offers" }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  const text = await page.locator("main").first().innerText();
  // Either open offers exist (GHST amounts render) or the explicit empty state shows.
  expect(/GHST|No recent offers/.test(text)).toBeTruthy();
});
