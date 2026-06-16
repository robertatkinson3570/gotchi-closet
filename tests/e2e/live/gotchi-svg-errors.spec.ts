import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const OWNER_WITH_GOTCHIS = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";
const SUBGRAPH_URL =
  "**/subgraphs/aavegotchi-core-base/prod/gn";
const PREVIEW_URL = "**/api/gotchis/preview";
const SVG_URL = "**/api/gotchis/*/svg";
const THUMBS_URL = "**/api/wearables/thumbs";

const wearablesPath = path.join(process.cwd(), "data", "wearables.json");
const wearablesData = JSON.parse(fs.readFileSync(wearablesPath, "utf8"));
const TEST_GOTCHI = {
  id: "1",
  name: "FixtureGotchi",
  level: "5",
  numericTraits: [50, 45, 55, 52, 10, 20],
  modifiedNumericTraits: [48, 47, 58, 50, 10, 20],
  withSetsNumericTraits: [48, 47, 58, 50, 10, 20],
  equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
  baseRarityScore: "306",
  usedSkillPoints: "5",
  hauntId: "1",
  collateral: "0x0000000000000000000000000000000000000000",
  createdAt: "1",
};
const previewSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" fill="#eee"/>` +
  `<circle cx="32" cy="32" r="14" fill="#bbb"/></svg>`;

test.beforeEach(async ({ page }) => {
  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query = body?.query || "";
    if (query.includes("itemTypes")) {
      const first = Number(body?.variables?.first ?? 1000);
      const skip = Number(body?.variables?.skip ?? 0);
      const slice = (wearablesData as any[]).slice(skip, skip + first);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            itemTypes: slice.map((item: any) => ({
              id: String(item.id),
              name: item.name,
              traitModifiers: item.traitModifiers,
              slotPositions: item.slotPositions,
              rarityScoreModifier: item.rarityScoreModifier,
              category: item.category ?? 0,
            })),
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            id: OWNER_WITH_GOTCHIS,
            gotchisOwned: [TEST_GOTCHI],
          },
          _meta: { block: { number: 1 } },
        },
      }),
    });
  });

  await page.route(PREVIEW_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg: previewSvg }),
    });
  });

  await page.route(SVG_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg: previewSvg }),
    });
  });

  await page.route(THUMBS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thumbs: {} }),
    });
  });
});

test("gotchi svg loads without RPC CORS errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`/dress?view=${OWNER_WITH_GOTCHIS}`);
  await expect(page.locator("[data-testid^='gotchi-card-']").first()).toBeVisible({
    timeout: 20000,
  });

  const svgLocator = page.locator("[data-testid='gotchi-svg-content'] svg");
  await expect(svgLocator.first()).toBeVisible({ timeout: 20000 });

  const corsErrors = consoleErrors.filter((text) =>
    text.toLowerCase().includes("cors")
  );
  expect(corsErrors, `CORS errors detected: ${corsErrors.join("\n")}`).toEqual([]);
});

