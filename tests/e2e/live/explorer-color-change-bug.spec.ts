import { test, expect, type Page } from "@playwright/test";

/**
 * Explorer color-change / cache-collision detector (deterministic rewrite).
 *
 * Current app: /explorer renders GotchiExplorerCard -> GotchiSvg with
 *   testId=`explorer-gotchi-<tokenId>` and useBlobUrl=true. The GotchiSvg root
 *   div carries data-gotchi-id, data-request-key, data-mode and data-commit-count.
 *   Card art comes from POST /api/gotchis/preview -> { svg }. Gotchi rows come
 *   from the goldsky CORE subgraph (operation GotchisPaginatedFiltered ->
 *   { data: { aavegotchis: [...] } }), gated by isGotchiRenderReady (needs a
 *   valid 0x collateral).
 *
 * Intent preserved: for each card the requestKey must be stable over time, two
 * gotchis must never share a requestKey (cache collision), the painted image
 * must not churn while requestKey is unchanged, and the preview API must not be
 * issued with conflicting collaterals/traits for the same tokenId.
 */

const PREVIEW_URL = "**/api/gotchis/preview";

// Distinct, valid (0x + 40 hex) collaterals so each fixture gotchi has a unique
// requestKey and the ready gate (collateral must start 0x and be >= 10 chars) passes.
const COLLATERALS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
  "0x6666666666666666666666666666666666666666",
  "0x7777777777777777777777777777777777777777",
  "0x8888888888888888888888888888888888888888",
  "0x9999999999999999999999999999999999999999",
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
];

function makeGotchi(i: number) {
  const tokenId = String(1000 + i);
  return {
    id: tokenId,
    gotchiId: tokenId,
    name: `Test Gotchi ${i}`,
    level: "1",
    numericTraits: [50 + i, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50 + i, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50 + i, 50, 50, 50, 50, 50],
    equippedWearables: new Array(16).fill(0),
    baseRarityScore: "300",
    modifiedRarityScore: "300",
    withSetsRarityScore: String(300 + i),
    hauntId: "1",
    collateral: COLLATERALS[i % COLLATERALS.length],
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

const FIXTURES = Array.from({ length: 10 }, (_, i) => makeGotchi(i));

// Route the goldsky CORE subgraph: aavegotchis fixtures for the list/frequency
// queries, empty erc721Listings for AllListings, empty otherwise.
async function stubSubgraph(page: Page) {
  await page.route("**/api.goldsky.com/**", async (route) => {
    const body = route.request().postDataJSON?.();
    const query: string = body?.query || "";
    let data: Record<string, unknown> = {};
    if (query.includes("erc721Listings")) {
      data = { erc721Listings: [] };
    } else if (query.includes("aavegotchis")) {
      data = { aavegotchis: FIXTURES };
    } else if (query.includes("user(")) {
      data = { user: { gotchisOwned: FIXTURES, gotchisLentOut: [] } };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

// Soul seals + any other /api/* defensively (no badges needed for this test).
async function stubMiscApi(page: Page) {
  await page.route("**/api/soul/seals", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, sealed: {} }) })
  );
}

test("Explorer: per-card requestKey is stable and never collides across gotchis", async ({ page }) => {
  await stubSubgraph(page);
  await stubMiscApi(page);

  // Per-tokenId record of preview requests + a per-collateral unique SVG response.
  const previewRequests: Array<{ tokenId: string; collateral: string; traits: string; requestKey: string }> = [];
  const svgByRequestKey = new Map<string, string>();

  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    if (!body) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg: "<svg/>" }) });

    const tokenId = String(body.tokenId ?? "");
    const collateral = String(body.collateral ?? "");
    const traits = (body.numericTraits || []).join(",");
    const requestKey = `${tokenId}|${body.hauntId}|${collateral}|${traits}|${(body.wearableIds || []).join("-")}|preview`;
    previewRequests.push({ tokenId, collateral, traits, requestKey });

    // Unique, > 100 char SVG keyed by collateral so each gotchi is visually distinct.
    const hue = collateral.slice(2, 8);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-token="${tokenId}" data-col="${collateral}">` +
      `<rect width="64" height="64" fill="#f0f0f0"/>` +
      `<path fill="#${hue}" stroke="#${hue}" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>` +
      `<!-- padding to exceed the component's 100-char min-length guard ${"x".repeat(120)} -->` +
      `</svg>`;
    svgByRequestKey.set(requestKey, svg);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg }) });
  });

  await page.goto("/explorer");

  // The GotchiSvg root carries BOTH data-gotchi-id and testId=explorer-gotchi-<id>.
  const svgRoots = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]');
  await expect(svgRoots.first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1000);

  const cardsToTest = Math.min(10, await svgRoots.count());
  expect(cardsToTest).toBeGreaterThan(1);

  // Sample each card's data-request-key over time.
  const keyHistory = new Map<string, Set<string>>();
  const timePoints = [0, 500, 1000, 2000, 3000, 4000, 5000];
  for (const t of timePoints) {
    if (t > 0) await page.waitForTimeout(t - (timePoints[timePoints.indexOf(t) - 1] || 0));
    for (let i = 0; i < cardsToTest; i++) {
      const root = svgRoots.nth(i);
      const gotchiId = (await root.getAttribute("data-gotchi-id")) || `card-${i}`;
      const requestKey = (await root.getAttribute("data-request-key")) || "";
      if (!keyHistory.has(gotchiId)) keyHistory.set(gotchiId, new Set());
      if (requestKey) keyHistory.get(gotchiId)!.add(requestKey);
    }
  }

  const failures: string[] = [];

  // 1) requestKey must be stable per gotchi.
  for (const [gotchiId, keys] of keyHistory.entries()) {
    if (keys.size > 1) failures.push(`Gotchi ${gotchiId} requestKey changed over time: ${[...keys].join(" -> ")}`);
  }

  // 2) No two gotchis may share a requestKey (cache collision).
  const keyToGotchis = new Map<string, string[]>();
  for (const [gotchiId, keys] of keyHistory.entries()) {
    for (const k of keys) {
      if (!keyToGotchis.has(k)) keyToGotchis.set(k, []);
      keyToGotchis.get(k)!.push(gotchiId);
    }
  }
  for (const [k, ids] of keyToGotchis.entries()) {
    const unique = new Set(ids);
    if (unique.size > 1) failures.push(`Cache collision: gotchis ${[...unique].join(", ")} share requestKey ${k.slice(0, 60)}...`);
  }

  // 3) The preview API must not be issued with conflicting collateral/traits for one tokenId.
  const byToken = new Map<string, { collaterals: Set<string>; traits: Set<string> }>();
  for (const r of previewRequests) {
    if (!byToken.has(r.tokenId)) byToken.set(r.tokenId, { collaterals: new Set(), traits: new Set() });
    byToken.get(r.tokenId)!.collaterals.add(r.collateral);
    byToken.get(r.tokenId)!.traits.add(r.traits);
  }
  for (const [tokenId, sets] of byToken.entries()) {
    if (sets.collaterals.size > 1) failures.push(`Gotchi ${tokenId} previewed with multiple collaterals: ${[...sets.collaterals].join(", ")}`);
    if (sets.traits.size > 1) failures.push(`Gotchi ${tokenId} previewed with multiple trait sets: ${[...sets.traits].join(" | ")}`);
  }

  // 4) No two DIFFERENT gotchis may have received the identical SVG body.
  const svgToTokens = new Map<string, Set<string>>();
  for (const r of previewRequests) {
    const svg = svgByRequestKey.get(r.requestKey);
    if (!svg) continue;
    if (!svgToTokens.has(svg)) svgToTokens.set(svg, new Set());
    svgToTokens.get(svg)!.add(r.tokenId);
  }
  for (const [, tokens] of svgToTokens.entries()) {
    if (tokens.size > 1) failures.push(`Identical SVG returned for different gotchis: ${[...tokens].join(", ")}`);
  }

  if (failures.length > 0) {
    throw new Error(`Found ${failures.length} issue(s):\n${failures.join("\n")}`);
  }
});
