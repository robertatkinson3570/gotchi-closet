import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

// CURRENT APP NOTES
// - Editor at /dress; owner seeded via localStorage["gc_multiWallet"] (no ?view).
// - `query GotchisByOwner` (CORE subgraph) loads the gotchi; `query Wearables`
//   (itemTypes) loads the catalogue. Art via /api/gotchis/preview.
// - Click a `gotchi-card` to open an `editor-instance-<id>`; each of its 8 slots is
//   `slot-<instanceId>-<slotIndex>` (slotIndex 4 = left hand).
// - GotchiCard's `trait-value-<LABEL>` cell reads "<base> (<modified>)" when the
//   modified value differs from base; BrsSummary `rarity-score` reads
//   "Rarity Score <totalBrs> (<traitBase>)".
//
// Dapp parity: equipping Hook Hand (223) into the left hand of 21403 gives the full
// set [31,263,86,30,223,32,361,0], activating the Jordan set (30/31/32) -> final
// traits [9,5,120,115], total BRS 719, base trait BRS 570.

const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";
const OWNER = "0x0000000000000000000000000000000000000000";

const GOTCHI = {
  id: "21403",
  name: "Fixture Gotchi",
  level: "1",
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
const WEARABLE_IDS = [31, 263, 86, 30, 212, 32, 361, 223];

const wearablesPath = join(process.cwd(), "data", "wearables.json");
const wearablesData = JSON.parse(readFileSync(wearablesPath, "utf8"));
const wearablesById = new Map(
  (wearablesData as any[]).map((w) => [Number(w.id), w])
);
const itemTypes = WEARABLE_IDS.map((id) => wearablesById.get(id)).filter(Boolean);

async function dndDrag(page: Page, sourceSelector: string, targetSelector: string) {
  // Editor instances render in a responsive desktop+mobile layout, so slot
  // testids appear twice (one hidden). Target the visible one.
  const source = page.locator(`${sourceSelector}:visible`).first();
  const target = page.locator(`${targetSelector}:visible`).first();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  if (!sb || !tb) throw new Error("drag source/target not visible");
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 12, sb.y + sb.height / 2 + 12, {
    steps: 5,
  });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 3 });
  await page.mouse.up();
}

test("undress swap matches dapp total for 21403", async ({ page }) => {
  await page.addInitScript((owner) => {
    localStorage.setItem("gc_multiWallet", JSON.stringify({ wallets: [owner] }));
  }, OWNER);

  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query: string = body?.query || "";

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
    if (query.includes("erc721Listings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { erc721Listings: [] } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: { id: OWNER, gotchisOwned: [GOTCHI], gotchisLentOut: [] },
          _meta: { block: { number: META_BLOCK } },
        },
      }),
    });
  });

  await page.route("**/api/wearables/thumbs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thumbs: {} }),
    })
  );
  await page.route("**/api/gotchis/*/svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg: "<svg xmlns='http://www.w3.org/2000/svg'/>" }),
    })
  );
  await page.route("**/api/gotchis/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#eee"/></svg>',
      }),
    })
  );
  await page.route("**/api/soul/seals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, sealed: {} }),
    })
  );

  await page.goto("/dress");

  await page.getByTestId("gotchi-card").first().click();

  const instance = page.locator('[data-testid^="editor-instance-"]').first();
  await expect(instance).toBeVisible({ timeout: 20000 });
  const instanceIdAttr = await instance.getAttribute("data-testid");
  const instanceId = instanceIdAttr?.replace("editor-instance-", "") || "";
  expect(instanceId).not.toBe("");

  await page.getByPlaceholder("Search...").fill("Hook Hand");
  await expect(page.getByTestId("wearable-223")).toBeVisible({ timeout: 10000 });

  await dndDrag(
    page,
    '[data-testid="wearable-223"]',
    `[data-testid="slot-${instanceId}-4"]`
  );

  await expect(
    instance.locator('[data-testid="rarity-score"]').first()
  ).toHaveText("Rarity Score 719 (570)");

  // The `trait-value-<LABEL>` cell renders "<base> (<modified>)" — in the editor it
  // is prefixed by a small W:/S: modifier-breakdown span, so assert containment for
  // the base+modified pair and assert the parenthesised modified value exactly via
  // the dedicated `trait-<LABEL>` span.
  await expect(
    instance.locator('[data-testid="trait-value-NRG"]').first()
  ).toContainText("12 (9)");
  await expect(instance.getByTestId("trait-NRG").first()).toHaveText("9");

  await expect(
    instance.locator('[data-testid="trait-value-AGG"]').first()
  ).toContainText("15 (5)");
  await expect(instance.getByTestId("trait-AGG").first()).toHaveText("5");

  await expect(
    instance.locator('[data-testid="trait-value-SPK"]').first()
  ).toContainText("107 (120)");
  await expect(instance.getByTestId("trait-SPK").first()).toHaveText("120");

  await expect(
    instance.locator('[data-testid="trait-value-BRN"]').first()
  ).toContainText("109 (115)");
  await expect(instance.getByTestId("trait-BRN").first()).toHaveText("115");
});
