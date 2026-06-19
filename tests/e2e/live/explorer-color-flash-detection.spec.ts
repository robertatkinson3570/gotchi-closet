import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";

/**
 * Explorer color-flash / convergence detector (deterministic rewrite).
 *
 * Current app paints Explorer art as <img src="blob:..."> (GotchiSvg
 * useBlobUrl=true) inside a root div that carries data-gotchi-id and
 * data-request-key (testId=explorer-gotchi-<tokenId>). We stub the preview API
 * to return a UNIQUE outline color per collateral, then assert (a) the painted
 * images do NOT all converge to one color, (b) a given card's image does not
 * change after first paint, and (c) the preview API is never called with two
 * different collaterals for the same tokenId.
 */

const PREVIEW_URL = "**/api/gotchis/preview";

// 5 distinct collaterals -> 5 distinct colors. Valid 0x+40hex so the ready gate passes.
const COLLATERALS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
];
const COLOR_FOR: Record<string, string> = {
  [COLLATERALS[0]]: "#FFC0CB",
  [COLLATERALS[1]]: "#FFA500",
  [COLLATERALS[2]]: "#00BFFF",
  [COLLATERALS[3]]: "#32CD32",
  [COLLATERALS[4]]: "#9932CC",
};

function makeGotchi(i: number) {
  const tokenId = String(2000 + i);
  return {
    id: tokenId,
    gotchiId: tokenId,
    name: `Flash Gotchi ${i}`,
    level: "1",
    numericTraits: [50, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: new Array(16).fill(0),
    baseRarityScore: "300",
    modifiedRarityScore: "300",
    withSetsRarityScore: String(350 + i),
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

const FIXTURES = Array.from({ length: 5 }, (_, i) => makeGotchi(i));

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

test("Explorer: gotchi colors do not converge or flash over time", async ({ page }) => {
  await stubSubgraph(page);

  const previewRequests: Array<{ tokenId: string; collateral: string }> = [];

  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    const collateral = String(body?.collateral || "");
    const tokenId = String(body?.tokenId ?? "");
    if (body) previewRequests.push({ tokenId, collateral });

    const color = COLOR_FOR[collateral] || "#000000";
    const isNaked = (body?.wearableIds || []).every((id: number) => id === 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" fill="#f0f0f0"/>` +
      `<path fill="${color}" stroke="${color}" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>` +
      `${!isNaked ? '<rect x="20" y="20" width="24" height="24" fill="#000"/>' : ""}` +
      `<!-- pad ${"x".repeat(120)} -->` +
      `</svg>`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg }) });
  });

  await page.goto("/explorer");

  const svgRoots = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]');
  await expect(svgRoots.first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1000);

  const cardsToTest = Math.min(5, await svgRoots.count());
  expect(cardsToTest).toBeGreaterThan(1);

  // Sample a screenshot hash per card over time (works for blob <img> art).
  const samples: Array<{ time: number; cards: Array<{ gotchiId: string; hash: string | null }> }> = [];
  const timePoints = [0, 1000, 2000, 4000, 6000, 8000];
  for (const t of timePoints) {
    if (t > 0) await page.waitForTimeout(t - (timePoints[timePoints.indexOf(t) - 1] || 0));
    const cardData: Array<{ gotchiId: string; hash: string | null }> = [];
    for (let i = 0; i < cardsToTest; i++) {
      const root = svgRoots.nth(i);
      const gotchiId = (await root.getAttribute("data-gotchi-id")) || `card-${i}`;
      let hash: string | null = null;
      try {
        const shot = await root.screenshot({ timeout: 2000 });
        hash = crypto.createHash("md5").update(shot).digest("hex");
      } catch { /* not painted yet */ }
      cardData.push({ gotchiId, hash });
    }
    samples.push({ time: t, cards: cardData });
  }

  const finalSample = samples[samples.length - 1];
  const finalHashes = finalSample.cards.map((c) => c.hash).filter(Boolean) as string[];
  expect(finalHashes.length).toBeGreaterThan(1);

  // BUG 1: all cards converged to one identical image.
  const uniqueFinal = new Set(finalHashes);
  if (uniqueFinal.size === 1) {
    throw new Error(`Color convergence bug: all ${finalHashes.length} gotchis rendered identical images.`);
  }

  // BUG 2: a card's image changed after first paint (flash).
  const firstPainted = samples.find((s) => s.cards.some((c) => c.hash));
  if (firstPainted) {
    for (let i = 0; i < cardsToTest; i++) {
      const first = firstPainted.cards[i]?.hash;
      const last = finalSample.cards[i]?.hash;
      if (first && last && first !== last) {
        throw new Error(`Color flash detected: gotchi ${finalSample.cards[i]?.gotchiId} image changed from first paint to final.`);
      }
    }
  }

  // BUG 3: preview API called with conflicting collaterals for one tokenId.
  const byToken = new Map<string, Set<string>>();
  for (const r of previewRequests) {
    if (!byToken.has(r.tokenId)) byToken.set(r.tokenId, new Set());
    byToken.get(r.tokenId)!.add(r.collateral);
  }
  for (const [tokenId, cols] of byToken.entries()) {
    if (cols.size > 1) throw new Error(`Gotchi ${tokenId} previewed with ${cols.size} different collaterals: ${[...cols].join(", ")}`);
  }
});
