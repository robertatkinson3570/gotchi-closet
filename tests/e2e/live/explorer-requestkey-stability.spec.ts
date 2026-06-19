import { test, expect, type Page } from "@playwright/test";

/**
 * Explorer requestKey stability (deterministic rewrite).
 *
 * The GotchiSvg root in Explorer (testId=explorer-gotchi-<tokenId>) exposes
 * data-request-key, data-mode ("preview"), data-gotchi-id and data-commit-count.
 * Without user interaction the requestKey must not change; hovering swaps the
 * card to naked (a different, also-stable requestKey) and unhovering returns it.
 */

const TEST_GOTCHI_ID = "1455";
const PREVIEW_URL = "**/api/gotchis/preview";
const COLLATERAL = "0x1111111111111111111111111111111111111111";
// Dressed so hover -> naked is a genuine state change.
const DRESSED = [29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function makeGotchi(id: string, collateral: string, wearables: number[]) {
  return {
    id,
    gotchiId: id,
    name: `Gotchi ${id}`,
    level: "1",
    numericTraits: [50, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: wearables,
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
  makeGotchi(TEST_GOTCHI_ID, COLLATERAL, DRESSED),
  makeGotchi("1456", "0x2222222222222222222222222222222222222222", new Array(16).fill(0)),
];

function svgFor(isNaked: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="#f0f0f0"/>` +
    `<path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>` +
    `${!isNaked ? '<rect x="20" y="20" width="24" height="24" fill="#000"/>' : ""}` +
    `<!-- pad ${"x".repeat(120)} -->` +
    `</svg>`;
}

async function stubSubgraph(page: Page) {
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
  await stubSubgraph(page);
  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    const isNaked = (body?.wearableIds || []).every((id: number) => id === 0);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg: svgFor(isNaked) }) });
  });
});

test("Explorer gotchi #1455: requestKey stability and network assertions", async ({ page }) => {
  // Track preview requests for #1455. The component's naked requestKey uses an
  // EMPTY wearables segment (mode-driven), so classify by request body and
  // reconstruct the key the same way the component does.
  const previewRequests: Array<{ requestKey: string; isNaked: boolean }> = [];
  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    if (body?.tokenId === Number(TEST_GOTCHI_ID)) {
      const isNaked = (body.wearableIds || []).every((id: number) => id === 0);
      const wearablesSeg = isNaked ? "" : (body.wearableIds || []).join("-");
      const requestKey = [
        TEST_GOTCHI_ID,
        body.hauntId ?? "",
        body.collateral || "",
        (body.numericTraits || []).join(","),
        wearablesSeg,
        "preview",
      ].join("|");
      previewRequests.push({ requestKey, isNaked });
    }
    const isNaked = (body?.wearableIds || []).every((id: number) => id === 0);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg: svgFor(isNaked) }) });
  });

  await page.goto("/explorer");

  const root = page.locator(`[data-testid="explorer-gotchi-${TEST_GOTCHI_ID}"]`);
  await expect(root).toBeVisible({ timeout: 20000 });

  // Wait for the painted blob image (skeleton gone).
  await expect(root.locator('img[src^="blob:"]')).toBeVisible({ timeout: 10000 });

  // PART 1+2: dressed requestKey is captured and stays stable for 2s (no hover).
  const key1 = await root.getAttribute("data-request-key");
  expect(key1).toBeTruthy();
  await page.waitForTimeout(2000);
  expect(await root.getAttribute("data-request-key")).toBe(key1);

  // PART 3: at most one unique requestKey was requested for the dressed state.
  const dressedKeys = new Set(previewRequests.filter((r) => !r.isNaked).map((r) => r.requestKey));
  expect(dressedKeys.size).toBeLessThanOrEqual(1);

  // PART 4: hover -> naked -> different, then stable.
  await root.hover();
  await page.waitForTimeout(400);
  const nakedKey1 = await root.getAttribute("data-request-key");
  expect(nakedKey1).toBeTruthy();
  expect(nakedKey1).not.toBe(key1);
  await page.waitForTimeout(2000);
  expect(await root.getAttribute("data-request-key")).toBe(nakedKey1);

  // PART 5: at most one unique requestKey for the naked state.
  const nakedKeys = new Set(previewRequests.filter((r) => r.isNaked).map((r) => r.requestKey));
  expect(nakedKeys.size).toBeLessThanOrEqual(1);

  // PART 6+7: mode + gotchi-id attributes.
  expect(await root.getAttribute("data-mode")).toBe("preview");
  expect(await root.getAttribute("data-gotchi-id")).toBe(TEST_GOTCHI_ID);
});

test("Explorer gotchi: requestKey must not change without user interaction", async ({ page }) => {
  await page.goto("/explorer");

  const root = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]').first();
  await expect(root).toBeVisible({ timeout: 20000 });
  await expect(root.locator('img[src^="blob:"]')).toBeVisible({ timeout: 10000 });

  const initialKey = await root.getAttribute("data-request-key");
  expect(initialKey).toBeTruthy();

  const samples: string[] = [initialKey!];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    samples.push((await root.getAttribute("data-request-key")) || "");
  }

  const uniqueKeys = new Set(samples.filter(Boolean));
  expect(uniqueKeys.size).toBe(1);
});
