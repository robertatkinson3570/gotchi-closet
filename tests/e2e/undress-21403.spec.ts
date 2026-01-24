import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";
const THUMBS_URL = "**/api/wearables/thumbs";
const GOTCHI_SVGS_URL = "**/api/gotchis/svgs";

const OWNER = "0x0000000000000000000000000000000000000000";

const GOTCHI = {
  id: "21403",
  name: "Fixture Gotchi",
  numericTraits: [12, 15, 107, 109, 8, 13],
  modifiedNumericTraits: [7, 5, 116, 119, 8, 13],
  withSetsNumericTraits: [7, 5, 119, 119, 8, 13],
  equippedWearables: [31, 263, 86, 30, 212, 32, 361, 0],
  baseRarityScore: null,
  hauntId: "1",
  collateral: "0x0000000000000000000000000000000000000000",
  createdAt: "33201946",
};

const META_BLOCK = 41234245;

const WEARABLE_IDS = [
  31, 263, 86, 30, 212, 32, 361, 223,
];

const wearablesPath = join(process.cwd(), "data", "wearables.json");
const wearablesData = JSON.parse(readFileSync(wearablesPath, "utf8"));
const wearablesById = new Map(
  (wearablesData as any[]).map((w) => [Number(w.id), w])
);

const itemTypes = WEARABLE_IDS.map((id) => wearablesById.get(id)).filter(Boolean);

test("undress swap matches dapp total for 21403", async ({ page }) => {
  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query = body?.query || "";
    if (query.includes("itemTypes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            itemTypes: itemTypes.map((item: any) => ({
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
            id: OWNER,
            gotchisOwned: [GOTCHI],
          },
          _meta: { block: { number: META_BLOCK } },
        },
      }),
    });
  });

  await page.route(THUMBS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thumbs: {} }),
    });
  });

  await page.route(GOTCHI_SVGS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svgs: {} }),
    });
  });

  await page.goto(`/dress?view=${OWNER}`);

  await page.getByTestId("gotchi-card").first().click();

  await page.getByPlaceholder("Search wearables...").fill("Hook Hand");
  const wearable = page.getByTestId("wearable-card-223");

  const instance = page.locator('[data-testid^="editor-instance-"]').first();
  const instanceIdAttr = await instance.getAttribute("data-testid");
  const instanceId = instanceIdAttr?.replace("editor-instance-", "") || "";

  await page.dragAndDrop(
    `[data-testid="wearable-card-223"]`,
    `[data-testid="slot-${instanceId}-4"]`
  );

  await expect(
    instance.locator('[data-testid="rarity-score"]').first()
  ).toHaveText("Rarity Score 719 (570)");
});

