import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const OWNER_WITH_GOTCHIS = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";

function loadWearables() {
  const dataPath = path.join(process.cwd(), "data", "wearables.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Array<{
    id: number;
    name: string;
    slotPositions: boolean[];
  }>;
}

async function fetchEquippedWearables() {
  const endpoint =
    "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
  const query = `query($owner: ID!){ user(id: $owner){ gotchisOwned { id equippedWearables } } }`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { owner: OWNER_WITH_GOTCHIS } }),
  });
  const json = await res.json();
  const gotchi = json?.data?.user?.gotchisOwned?.[0];
  const equipped = (gotchi?.equippedWearables || []).map((id: any) => Number(id) || 0);
  return new Set(equipped);
}

test("gotchi strip scrolls horizontally with buttons", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const strip = page.getByTestId("gotchi-carousel");
  await expect(strip).toBeVisible({ timeout: 20000 });

  const metrics = await strip.evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  if (metrics.scrollWidth <= metrics.clientWidth) {
    test.skip(true, "Strip does not overflow");
  }
  await page.getByRole("button", { name: "Scroll right" }).click();
  const after = await strip.evaluate((el) => el.scrollLeft);
  expect(after).toBeGreaterThan(metrics.scrollLeft);
});

test("gotchis sorted by modified score desc", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const cards = page.locator("[data-testid^='gotchi-card-']");
  const count = await cards.count();
  const scores: number[] = [];
  for (let i = 0; i < count; i++) {
    const scoreAttr = await cards.nth(i).getAttribute("data-modified-score");
    scores.push(Number(scoreAttr || 0));
  }
  const sorted = [...scores].sort((a, b) => b - a);
  expect(scores).toEqual(sorted);
});

test("clicking gotchi adds multiple editor instances", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const carousel = page.getByTestId("gotchi-carousel");
  const firstGotchi = carousel.locator("[data-testid^='gotchi-card-']").first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  const instances = page.locator("[data-testid^='editor-instance-']:visible");
  const beforeCount = await instances.count();
  await firstGotchi.click();
  await page.waitForTimeout(300);
  await firstGotchi.click();
  await expect(instances).toHaveCount(beforeCount + 2, { timeout: 20000 });
});

test("wearable thumbnails are visible in selector", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const thumbs = page.locator("[data-testid^='wearable-thumb-'] svg");
  await expect(thumbs.first()).toBeVisible({ timeout: 20000 });
});

test("dragging wearable updates preview svg", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  if (!idSuffix) test.skip(true, "Missing editor instance id");

  const wearables = loadWearables();
  const equipped = await fetchEquippedWearables();
  const valid = wearables.find(
    (w) => w.slotPositions[3] && !equipped.has(w.id)
  );
  if (!valid) {
    test.skip(true, "No wearable found for slot 0");
  }

  const searchInput = page.getByPlaceholder("Search wearables...");
  await searchInput.fill(valid!.name);

  const card = page.locator(`[data-testid='wearable-card-${valid!.id}']`);
  await expect(card).toBeVisible({ timeout: 20000 });

  const previewContainer = page
    .locator(`[data-testid='editor-gotchi-svg-${idSuffix}']`)
    .first();
  await expect(previewContainer).toBeVisible({ timeout: 20000 });
  const beforeKey = await previewContainer.getAttribute("data-request-key");

  const source = page.locator(`[data-testid='wearable-card-${valid!.id}']`);
  const target = page
    .locator(`[data-testid='slot-${idSuffix}-3']:visible`)
    .first();
  await expect(source).toBeVisible({ timeout: 20000 });
  await expect(target).toBeVisible({ timeout: 20000 });

  await source.dragTo(target);

  await expect
    .poll(
      async () => target.getAttribute("data-wearable-id"),
      { timeout: 20000 }
    )
    .toBe(String(valid!.id));
  await expect
    .poll(
      async () => previewContainer.getAttribute("data-request-key"),
      { timeout: 20000 }
    )
    .not.toBe(beforeKey);
});

test("hand wearable can be equipped in correct hand slot", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  if (!idSuffix) test.skip(true, "Missing editor instance id");

  const wearables = loadWearables();
  const equipped = await fetchEquippedWearables();
  const handWearable = wearables.find(
    (w) => (w.slotPositions[4] || w.slotPositions[5]) && !equipped.has(w.id)
  );
  if (!handWearable) {
    test.skip(true, "No hand wearable found");
  }

  const targetSlot = handWearable!.slotPositions[4] ? 4 : 5;
  const searchInput = page.getByPlaceholder("Search wearables...");
  await searchInput.fill(handWearable!.name);

  const source = page.locator(`[data-testid='wearable-card-${handWearable!.id}']`);
  const target = page
    .locator(`[data-testid='slot-${idSuffix}-${targetSlot}']:visible`)
    .first();
  await expect(source).toBeVisible({ timeout: 20000 });
  await expect(target).toBeVisible({ timeout: 20000 });

  await source.dragTo(target);

  await expect
    .poll(async () => target.getAttribute("data-wearable-id"), {
      timeout: 20000,
    })
    .toBe(String(handWearable!.id));
});

test("invalid drop rejected with toast", async ({ page }) => {
  const wearables = loadWearables();
  const invalid = wearables.find((w) => !w.slotPositions[0]);
  if (!invalid) {
    test.skip(true, "No invalid wearable found for slot 0");
  }

  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  if (!idSuffix) test.skip(true, "Missing editor instance id");

  const searchInput = page.getByPlaceholder("Search wearables...");
  await searchInput.fill(invalid!.name);

  const source = page.locator(`[data-testid='wearable-card-${invalid!.id}']`);
  const target = page
    .locator(`[data-testid='slot-${idSuffix}-0']:visible`)
    .first();
  await expect(source).toBeVisible({ timeout: 20000 });
  await expect(target).toBeVisible({ timeout: 20000 });

  const before = await target.getAttribute("data-wearable-id");
  await source.dragTo(target);

  await expect
    .poll(async () => target.getAttribute("data-wearable-id"), {
      timeout: 20000,
    })
    .toBe(before || "");
});

test("no rpc cors or 429 errors in console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  await expect(page.locator("[data-testid^='gotchi-card-']").first()).toBeVisible({
    timeout: 20000,
  });

  const filtered = errors.filter((text) => {
    const lower = text.toLowerCase();
    return (
      lower.includes("cors") ||
      lower.includes("429") ||
      lower.includes("jsonrpcprovider") ||
      lower.includes("access to fetch")
    );
  });
  expect(filtered).toEqual([]);
});

test("smoke: gotchi and wearable svgs render", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const gotchiSvgs = page.locator("[data-testid='gotchi-svg-content']");
  await expect
    .poll(async () => gotchiSvgs.count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(1);

  const wearableThumbs = page.locator("[data-testid^='wearable-thumb-'] svg");
  await expect
    .poll(async () => wearableThumbs.count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(1);

  const apiErrors = errors.filter((text) => text.includes("500"));
  expect(apiErrors).toEqual([]);
});

test("respec toggle shows steppers and updates SP left", async ({ page }) => {
  await page.goto(`/dress?address=${OWNER_WITH_GOTCHIS}`);
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const toggle = page.locator("[data-testid='respec-toggle']").first();
  await expect(toggle).toBeVisible({ timeout: 20000 });
  await toggle.click();

  const spBadge = page.locator("text=SP left:").first();
  await expect(spBadge).toBeVisible({ timeout: 20000 });

  const before = await spBadge.textContent();
  const incButton = page.getByLabel("Increase NRG").first();
  await incButton.click();
  const after = await spBadge.textContent();
  expect(before).not.toEqual(after);
});

