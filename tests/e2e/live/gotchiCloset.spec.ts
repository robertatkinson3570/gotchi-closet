import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * GotchiCloset editor (/dress) e2e.
 *
 * NOTE: although this lives under `tests/e2e/live/`, every external dependency
 * is stubbed in `beforeEach`, so the suite is deterministic (it does not touch
 * real subgraph/RPC/CDN data). The editor moved from `/` to `/dress`, and the
 * old `?view=<addr>` URL param was removed — owners now come from the connected
 * wallet and from `localStorage["gc_multiWallet"]` ({"wallets":[...]}). We seed
 * the latter via addInitScript before navigating.
 */

const OWNER_WITH_GOTCHIS = "0x1cf07f7c5853599dcaa5b3bb67ac0cf1ae7bdb82";

// urql (editor) + raw fetch (listings/baazaar) all hit the CORE subgraph.
const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";
const PREVIEW_URL = "**/api/gotchis/preview";
const SVG_URL = "**/api/gotchis/*/svg";
const THUMBS_URL = "**/api/wearables/thumbs";

function loadWearables() {
  const dataPath = path.join(process.cwd(), "data", "wearables.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Array<{
    id: number;
    name: string;
    traitModifiers: number[];
    slotPositions: boolean[];
    rarityScoreModifier: number;
    category?: number;
  }>;
}

const wearables = loadWearables();

// A real-looking, non-zero collateral so GotchiSvg takes the `/api/gotchis/preview`
// path (preview requires hauntId + collateral + non-empty numericTraits).
const COLLATERAL = "0xf0f5d65fa08b32d6a07a0ec84c7e3a0e0a8a8a8a";

// Three owned gotchis with distinct trait spreads so their computed BRS
// (the carousel sort key, also surfaced as `data-modified-score`) is distinct
// and deterministically ordered. No equipped wearables (all-zero slots) so BRS
// is the pure base-trait BRS.
function makeGotchi(id: string, name: string, numericTraits: number[], baseRarityScore: string) {
  return {
    id,
    name,
    level: "5",
    numericTraits,
    modifiedNumericTraits: numericTraits,
    withSetsNumericTraits: numericTraits,
    equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    baseRarityScore,
    modifiedRarityScore: baseRarityScore,
    withSetsRarityScore: baseRarityScore,
    usedSkillPoints: "5",
    hauntId: "1",
    collateral: COLLATERAL,
    createdAt: "1",
    lending: null,
    kinship: "50",
  };
}

const TEST_GOTCHIS = [
  // High BRS: two extreme traits.
  makeGotchi("21401", "AlphaGotchi", [2, 98, 5, 95, 25, 40], "600"),
  // Mid BRS.
  makeGotchi("21402", "BetaGotchi", [20, 80, 30, 70, 25, 40], "440"),
  // Low BRS: traits near the middle (50) contribute least.
  makeGotchi("21403", "GammaGotchi", [48, 52, 47, 53, 25, 40], "306"),
];

const previewSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" fill="#eee"/>` +
  `<circle cx="32" cy="32" r="14" fill="#bbb"/></svg>`;

/** Seed an owner into gc_multiWallet so /dress loads their gotchis. */
async function seedOwner(page: Page, owner: string) {
  await page.addInitScript((addr) => {
    localStorage.setItem("gc_multiWallet", JSON.stringify({ wallets: [addr] }));
  }, owner);
}

/**
 * Robust dnd-kit drag. Playwright's locator.dragTo can be too coarse for
 * dnd-kit's PointerSensor (activationConstraint distance: 4), so we drive an
 * explicit multi-step mouse drag from source center to target center.
 */
async function dndDrag(page: Page, source: Locator, target: Locator) {
  const sBox = await source.boundingBox();
  const tBox = await target.boundingBox();
  if (!sBox || !tBox) throw new Error("drag source/target not laid out");
  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + tBox.width / 2;
  const ty = tBox.y + tBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Several intermediate moves so the activation constraint trips and
  // pointerWithin collision resolves over the target.
  await page.mouse.move(sx + 8, sy + 8, { steps: 5 });
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 8 });
  await page.mouse.move(tx, ty, { steps: 8 });
  await page.mouse.move(tx, ty, { steps: 3 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await seedOwner(page, OWNER_WITH_GOTCHIS);

  // CORE subgraph: differentiate the Wearables (itemTypes) query from the
  // GotchisByOwner (user.gotchisOwned) query. Anything else (owner listings,
  // baazaar prices, lent-by-ids, etc.) gets an empty-but-well-formed payload so
  // those side queries resolve without errors.
  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query: string = body?.query || "";

    if (query.includes("itemTypes")) {
      const first = Number(body?.variables?.first ?? 1000);
      const skip = Number(body?.variables?.skip ?? 0);
      const slice = wearables.slice(skip, skip + first);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            itemTypes: slice.map((item) => ({
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

    if (query.includes("gotchisOwned")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            user: {
              id: OWNER_WITH_GOTCHIS,
              gotchisOwned: TEST_GOTCHIS,
              gotchisLentOut: [],
            },
            _meta: { block: { number: 1 } },
          },
        }),
      });
      return;
    }

    // Listings / baazaar / by-ids / anything else: empty.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          aavegotchis: [],
          erc721Listings: [],
          user: { gotchisOwned: [], gotchisLentOut: [], gotchisBorrowed: [] },
          _meta: { block: { number: 1 } },
        },
      }),
    });
  });

  // Any other goldsky subgraph (gbm/svg/gotchiverse) -> empty.
  await page.route("**/api.goldsky.com/**", async (route) => {
    if (route.request().url().includes("aavegotchi-core-base")) {
      // handled by SUBGRAPH_URL above; fall through just in case ordering differs
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {} }),
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

  // Respec mode fetches birth/base traits. Stub so it resolves cleanly (the
  // editor already has a baseline from numericTraits, but this avoids a console
  // error from the background fetch).
  await page.route("**/api/gotchis/base-traits", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ baseTraits: [50, 50, 50, 50, 25, 40] }),
    });
  });

  // Wearable icon CDNs (dapp.aavegotchi.com/brand/items/<id>.svg, etc.). Abort
  // so the card image errors fast and falls back to its inline placeholder SVG,
  // making `[data-testid^='wearable-thumb-'] svg` deterministically present.
  await page.route(/aavegotchi\.com\/(brand|images)\/items\//, (route) => route.abort());
  await page.route(/wiki\.aavegotchi\.com\/wearables\//, (route) => route.abort());
});

test("gotchi strip scrolls horizontally with buttons", async ({ page }) => {
  await page.goto("/dress");
  const strip = page.getByTestId("gotchi-carousel");
  await expect(strip).toBeVisible({ timeout: 20000 });
  // Wait for cards to render so the strip has real width.
  await expect(page.locator("[data-testid^='gotchi-card-']").first()).toBeVisible({
    timeout: 20000,
  });

  const metrics = await strip.evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  if (metrics.scrollWidth <= metrics.clientWidth) {
    test.skip(true, "Strip does not overflow");
  }
  await page.getByRole("button", { name: "Scroll right" }).click();
  await expect
    .poll(async () => strip.evaluate((el) => el.scrollLeft), { timeout: 5000 })
    .toBeGreaterThan(metrics.scrollLeft);
});

test("gotchis sorted by modified score desc", async ({ page }) => {
  await page.goto("/dress");
  const cards = page.locator("[data-testid^='gotchi-card-']");
  await expect(cards.first()).toBeVisible({ timeout: 20000 });
  // All three fixtures should be present.
  await expect.poll(async () => cards.count(), { timeout: 20000 }).toBeGreaterThanOrEqual(3);

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
  await page.goto("/dress");
  const carousel = page.getByTestId("gotchi-carousel");
  const firstGotchi = carousel.locator("[data-testid^='gotchi-card-']").first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  const instances = page.locator("[data-testid^='editor-instance-']:visible");
  const beforeCount = await instances.count();
  await firstGotchi.click();
  // The carousel debounces adds (250ms), so wait before the second click.
  await expect(instances).toHaveCount(beforeCount + 1, { timeout: 20000 });
  await page.waitForTimeout(400);
  await firstGotchi.click();
  await expect(instances).toHaveCount(beforeCount + 2, { timeout: 20000 });
});

test("wearable thumbnails are visible in selector", async ({ page }) => {
  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  // WearableCardView renders an inline fallback SVG once the CDN <img> errors
  // (we abort the CDNs in beforeEach), so the thumb always ends up with an svg.
  const thumbs = page.locator("[data-testid^='wearable-thumb-'] svg");
  await expect(thumbs.first()).toBeVisible({ timeout: 20000 });
});

test("dragging wearable updates preview svg", async ({ page }) => {
  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  await expect(instance).toBeVisible({ timeout: 20000 });
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  expect(idSuffix, "editor instance id").toBeTruthy();

  // A wearable valid for slot 3 (e.g. a hat).
  const valid = wearables.find((w) => w.slotPositions[3]);
  expect(valid, "a slot-3 wearable exists in fixtures").toBeTruthy();

  const searchInput = page.getByPlaceholder("Search...");
  await searchInput.fill(valid!.name);

  const source = page.locator(`[data-testid='wearable-${valid!.id}']`);
  await expect(source).toBeVisible({ timeout: 20000 });

  const previewContainer = page
    .locator(`[data-testid='editor-gotchi-svg-${idSuffix}']`)
    .first();
  await expect(previewContainer).toBeVisible({ timeout: 20000 });
  const beforeKey = await previewContainer.getAttribute("data-request-key");

  const target = page
    .locator(`[data-testid='slot-${idSuffix}-3']:visible`)
    .first();
  await expect(target).toBeVisible({ timeout: 20000 });

  await dndDrag(page, source, target);

  await expect
    .poll(async () => target.getAttribute("data-wearable-id"), { timeout: 20000 })
    .toBe(String(valid!.id));
  // The preview's requestKey embeds the equipped wearables, so it must change.
  await expect
    .poll(async () => previewContainer.getAttribute("data-request-key"), {
      timeout: 20000,
    })
    .not.toBe(beforeKey);
});

test("hand wearable can be equipped in correct hand slot", async ({ page }) => {
  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  await expect(instance).toBeVisible({ timeout: 20000 });
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  expect(idSuffix, "editor instance id").toBeTruthy();

  const handWearable = wearables.find(
    (w) => w.slotPositions[4] || w.slotPositions[5]
  );
  expect(handWearable, "a hand wearable exists in fixtures").toBeTruthy();

  const targetSlot = handWearable!.slotPositions[4] ? 4 : 5;
  const searchInput = page.getByPlaceholder("Search...");
  await searchInput.fill(handWearable!.name);

  const source = page.locator(`[data-testid='wearable-${handWearable!.id}']`);
  const target = page
    .locator(`[data-testid='slot-${idSuffix}-${targetSlot}']:visible`)
    .first();
  await expect(source).toBeVisible({ timeout: 20000 });
  await expect(target).toBeVisible({ timeout: 20000 });

  await dndDrag(page, source, target);

  await expect
    .poll(async () => target.getAttribute("data-wearable-id"), { timeout: 20000 })
    .toBe(String(handWearable!.id));
});

test("invalid drop rejected with toast", async ({ page }) => {
  // A wearable that cannot go in slot 0 (body). e.g. a hat (slot 3 only).
  const invalid = wearables.find((w) => !w.slotPositions[0] && w.slotPositions.some(Boolean));
  expect(invalid, "an invalid-for-slot-0 wearable exists").toBeTruthy();

  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  const instance = page.locator("[data-testid^='editor-instance-']:visible").first();
  await expect(instance).toBeVisible({ timeout: 20000 });
  const instanceId = await instance.getAttribute("data-testid");
  const idSuffix = instanceId?.replace("editor-instance-", "");
  expect(idSuffix, "editor instance id").toBeTruthy();

  const searchInput = page.getByPlaceholder("Search...");
  await searchInput.fill(invalid!.name);

  const source = page.locator(`[data-testid='wearable-${invalid!.id}']`);
  const target = page
    .locator(`[data-testid='slot-${idSuffix}-0']:visible`)
    .first();
  await expect(source).toBeVisible({ timeout: 20000 });
  await expect(target).toBeVisible({ timeout: 20000 });

  const before = await target.getAttribute("data-wearable-id");
  await dndDrag(page, source, target);

  // Rejected: the slot stays empty and an "Invalid Slot" toast appears.
  await expect(page.getByText("Invalid Slot")).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => target.getAttribute("data-wearable-id"), { timeout: 5000 })
    .toBe(before || "");
});

test("no rpc cors or 429 errors in console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  await page.goto("/dress");
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

  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  // Editor instance art renders via dangerouslySetInnerHTML in a *-content div.
  const gotchiSvgs = page.locator("[data-testid$='-content'][data-testid*='gotchi-svg']");
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
  await page.goto("/dress");
  const firstGotchi = page
    .getByTestId("gotchi-carousel")
    .locator("[data-testid^='gotchi-card-']")
    .first();
  await expect(firstGotchi).toBeVisible({ timeout: 20000 });
  await firstGotchi.click();

  // respec-toggle only renders inside EditorPanel instances (showRespec).
  const toggle = page.locator("[data-testid='respec-toggle']").first();
  await expect(toggle).toBeVisible({ timeout: 20000 });
  await toggle.click();

  const spBadge = page.locator("text=SP left:").first();
  await expect(spBadge).toBeVisible({ timeout: 20000 });

  const before = await spBadge.textContent();
  const incButton = page.getByLabel("Increase NRG").first();
  await expect(incButton).toBeVisible({ timeout: 20000 });
  await incButton.click();
  await expect
    .poll(async () => spBadge.textContent(), { timeout: 20000 })
    .not.toBe(before);
});
