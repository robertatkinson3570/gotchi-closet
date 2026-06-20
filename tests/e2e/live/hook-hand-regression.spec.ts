import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

// CURRENT APP NOTES
// - Editor at /dress; owners come from localStorage["gc_multiWallet"] (no ?view).
// - Owned gotchis: `query GotchisByOwner` on the CORE subgraph. Wearables catalogue:
//   paginated `query Wearables` -> itemTypes (merged with local data/wearables.json).
// - Click a `gotchi-card` to open an `editor-instance-<id>`. Equip via dnd-kit drag
//   from `wearable-<id>` onto a slot (`slot-leftHand` is the slotIndex-4 wrapper).
// - The WearablesPanel search placeholder is now "Search..." (was "Search wearables...").
// - GotchiCard renders the modified trait in parens (`trait-<LABEL>`) only when it
//   differs from the base; BrsSummary exposes `rarity-with-wearables` (totalBrs) and
//   `rarity-base` (traitBase).
//
// Regression under test: swapping a wearable into the LEFT-HAND slot must recompute
// the gotchi's modifiers (hand-slot bug). Gotchi 21403's full equipped set after the
// swap is [31,263,86,30,223,32,361,0] which activates the "Jordan" set (30/31/32):
// final traits [9,5,120,115], total BRS 719, base trait BRS 570.

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

// dnd-kit's PointerSensor has an activation distance (4px); a plain dragAndDrop can
// fail to start the drag. Do a manual pointer drag with intermediate moves.
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
  // Move past the activation threshold first, then to the target in steps.
  await page.mouse.move(sb.x + sb.width / 2 + 12, sb.y + sb.height / 2 + 12, {
    steps: 5,
  });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 3 });
  await page.mouse.up();
}

test("left hand swap recalculates modifiers (hook hand regression)", async ({
  page,
}) => {
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
  await expect(instance.getByTestId("rarity-score")).toBeVisible();

  // Equip 1337 Laptop into the left hand, then swap it for the Hook Hand.
  await page.getByPlaceholder("Search...").fill("1337 Laptop");
  await expect(page.getByTestId("wearable-212")).toBeVisible({ timeout: 10000 });
  await dndDrag(page, '[data-testid="wearable-212"]', '[data-testid="slot-leftHand"]');

  await page.getByPlaceholder("Search...").fill("Hook Hand");
  await expect(page.getByTestId("wearable-223")).toBeVisible({ timeout: 10000 });
  await dndDrag(page, '[data-testid="wearable-223"]', '[data-testid="slot-leftHand"]');

  // Modifiers recalculated for the new left-hand wearable + active Jordan set.
  await expect(instance.getByTestId("rarity-with-wearables")).toHaveText("719");
  await expect(instance.getByTestId("rarity-base")).toHaveText("570");

  await expect(instance.getByTestId("trait-NRG")).toHaveText("9");
  await expect(instance.getByTestId("trait-AGG")).toHaveText("5");
  await expect(instance.getByTestId("trait-SPK")).toHaveText("120");
  await expect(instance.getByTestId("trait-BRN")).toHaveText("115");
});
