import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";

/**
 * Explorer: no first-wrong-paint (deterministic rewrite).
 *
 * Once a card paints a real image (skeleton gone), that image must not change,
 * there must be exactly one painted art element per card, and no hidden/opacity-0
 * duplicate layers. Explorer paints via <img src="blob:..."> inside a GotchiSvg
 * root (testId=explorer-gotchi-<tokenId>, data-gotchi-id=<tokenId>).
 */

const TEST_GOTCHI_ID = "1455";
const PREVIEW_URL = "**/api/gotchis/preview";
const COLLATERAL = "0x1111111111111111111111111111111111111111";

function makeGotchi(id: string, collateral: string) {
  return {
    id,
    gotchiId: id,
    name: `Gotchi ${id}`,
    level: "1",
    numericTraits: [50, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: new Array(16).fill(0),
    baseRarityScore: "300",
    modifiedRarityScore: "300",
    withSetsRarityScore: "320",
    hauntId: "1",
    collateral,
    owner: { id: "0x000000000000000000000000000000000000dead" },
    kinship: "50",
    experience: "0",
    escrow: "0x000000000000000000000000000000000000beef",
    equippedSetID: "0",
    equippedSetName: "",
    usedSkillPoints: "0",
    createdAt: "1700000000",
    lastInteracted: "1700000000",
    minimumStake: "0",
    stakedAmount: "0",
  };
}

const FIXTURES = [
  makeGotchi(TEST_GOTCHI_ID, COLLATERAL),
  makeGotchi("1456", "0x2222222222222222222222222222222222222222"),
  makeGotchi("1457", "0x3333333333333333333333333333333333333333"),
];

async function stubAll(page: Page) {
  await page.route("**/api.goldsky.com/**", async (route) => {
    const body = route.request().postDataJSON?.();
    const query: string = body?.query || "";
    let data: Record<string, unknown> = {};
    if (query.includes("erc721Listings")) data = { erc721Listings: [] };
    else if (query.includes("aavegotchis")) data = { aavegotchis: FIXTURES };
    else if (query.includes("user(")) data = { user: { gotchisOwned: FIXTURES, gotchisLentOut: [] } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  await page.route("**/api/soul/seals", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, sealed: {} }) })
  );
}

test.beforeEach(async ({ page }) => {
  await stubAll(page);
  // Consistent SVG per request (pink outline). > 100 chars so the component commits it.
  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    const isNaked = (body?.wearableIds || []).every((id: number) => id === 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" fill="#f0f0f0"/>` +
      `<path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>` +
      `${!isNaked ? '<rect x="20" y="20" width="24" height="24" fill="#000"/>' : ""}` +
      `<!-- pad ${"x".repeat(120)} -->` +
      `</svg>`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg }) });
  });
});

test("Explorer gotchi: no visual flash after first paint", async ({ page }) => {
  await page.goto("/explorer");

  // The GotchiSvg root for #1455 is BOTH the card art and the data-gotchi-id holder.
  const svgRoot = page.locator(`[data-testid="explorer-gotchi-${TEST_GOTCHI_ID}"]`);
  await expect(svgRoot).toBeVisible({ timeout: 20000 });
  expect(await svgRoot.getAttribute("data-gotchi-id")).toBe(TEST_GOTCHI_ID);

  const content = svgRoot.locator(`[data-testid="explorer-gotchi-${TEST_GOTCHI_ID}-content"]`);
  const skeleton = svgRoot.locator(`[data-testid="explorer-gotchi-${TEST_GOTCHI_ID}-skeleton"]`);

  // PART A: sample skeleton-state and image hash from the moment the card exists.
  const samples: Array<{ time: number; hash: string | null; isSkeleton: boolean }> = [];
  const timePoints = [0, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000];
  for (const t of timePoints) {
    if (t > 0) await page.waitForTimeout(t - (timePoints[timePoints.indexOf(t) - 1] || 0));
    const isSkeleton = await skeleton.isVisible().catch(() => false);
    let hash: string | null = null;
    try {
      const shot = await svgRoot.screenshot({ timeout: 1000 });
      hash = crypto.createHash("md5").update(shot).digest("hex");
    } catch { /* ignore */ }
    samples.push({ time: t, hash, isSkeleton });
  }

  // PART B: all real (non-skeleton) frames must share the same hash.
  const realFrames = samples.filter((s) => !s.isSkeleton && s.hash !== null);
  if (realFrames.length > 1) {
    const firstHash = realFrames[0].hash;
    for (let i = 1; i < realFrames.length; i++) {
      if (realFrames[i].hash !== firstHash) {
        throw new Error(`Visual flash detected: image hash changed from ${firstHash?.slice(0, 8)} to ${realFrames[i].hash?.slice(0, 8)} at ${realFrames[i].time}ms`);
      }
    }
  }

  // PART C: once loaded there is exactly one painted content element, no extra layers.
  await expect(content).toBeVisible({ timeout: 10000 });
  expect(await content.count()).toBe(1);
  // The painted art is a blob-backed <img>.
  expect(await content.getAttribute("src")).toMatch(/^blob:/);
});

test("Explorer gotchi: DOM correctness - single painted art, no hidden layers", async ({ page }) => {
  await page.goto("/explorer");

  const firstRoot = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]').first();
  await expect(firstRoot).toBeVisible({ timeout: 20000 });
  const tokenId = await firstRoot.getAttribute("data-gotchi-id");
  expect(tokenId).toBeTruthy();

  // Exactly one GotchiSvg root (the testid is unique per token; the wrapper has no
  // nested second svg root).
  expect(await page.locator(`[data-testid="explorer-gotchi-${tokenId}"]`).count()).toBe(1);

  // Wait for the painted art and assert a single content element.
  const content = firstRoot.locator(`[data-testid="explorer-gotchi-${tokenId}-content"]`);
  await expect(content).toBeVisible({ timeout: 10000 });
  expect(await content.count()).toBe(1);

  // No opacity-0 / display:none duplicate art root.
  const hiddenLayers = await page.locator(`[data-testid="explorer-gotchi-${tokenId}"]`).evaluateAll((els) =>
    els.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.opacity === "0" || style.display === "none";
    }).length
  );
  expect(hiddenLayers).toBe(0);
});
