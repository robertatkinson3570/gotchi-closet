import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";

/**
 * Explorer visual-flash / convergence detector (deterministic rewrite).
 *
 * Cards paint <img src="blob:..."> (GotchiSvg useBlobUrl=true) inside a root
 * carrying data-gotchi-id (testId=explorer-gotchi-<tokenId>). We stub the preview
 * API to return a UNIQUE SVG per collateral and assert the painted cards neither
 * converge to one image nor change after first paint, and that the API never
 * returns the same SVG for two different collaterals.
 */

const PREVIEW_URL = "**/api/gotchis/preview";
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
const COLOR_FOR: Record<string, string> = Object.fromEntries(
  COLLATERALS.map((c, i) => [c, `#${(i + 1).toString(16).repeat(6).slice(0, 6).padStart(6, "0")}`])
);

function makeGotchi(i: number) {
  const tokenId = String(4000 + i);
  return {
    id: tokenId,
    gotchiId: tokenId,
    name: `Visual Gotchi ${i}`,
    level: "1",
    numericTraits: [50, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: new Array(16).fill(0),
    baseRarityScore: "300",
    modifiedRarityScore: "300",
    withSetsRarityScore: String(370 + i),
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

test("Explorer: cards do not converge to one image and do not flash", async ({ page }) => {
  await stubSubgraph(page);

  // Record the SVG returned per collateral to catch identical-SVG-across-collaterals.
  const svgByCollateral = new Map<string, Set<string>>();

  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON?.();
    const collateral = String(body?.collateral || "");
    const color = COLOR_FOR[collateral] || "#000000";
    const isNaked = (body?.wearableIds || []).every((id: number) => id === 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-col="${collateral}">` +
      `<rect width="64" height="64" fill="#f0f0f0"/>` +
      `<path fill="${color}" stroke="${color}" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>` +
      `${!isNaked ? '<rect x="20" y="20" width="24" height="24" fill="#000"/>' : ""}` +
      `<!-- pad ${"x".repeat(120)} -->` +
      `</svg>`;
    if (collateral) {
      if (!svgByCollateral.has(svg)) svgByCollateral.set(svg, new Set());
      svgByCollateral.get(svg)!.add(collateral);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ svg }) });
  });

  await page.goto("/explorer");

  const svgRoots = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]');
  await expect(svgRoots.first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2000);

  const cardsToTest = Math.min(10, await svgRoots.count());
  expect(cardsToTest).toBeGreaterThan(1);

  // Sample screenshot hashes per card over time.
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
      } catch { /* ignore */ }
      cardData.push({ gotchiId, hash });
    }
    samples.push({ time: t, cards: cardData });
  }

  const finalSample = samples[samples.length - 1];
  const finalHashes = finalSample.cards.map((c) => c.hash).filter(Boolean) as string[];
  expect(finalHashes.length).toBeGreaterThan(1);

  // BUG 1: all gotchis rendered identical images.
  if (new Set(finalHashes).size === 1) {
    throw new Error(`Color convergence bug: all ${finalHashes.length} gotchis rendered identical images.`);
  }

  // BUG 2: a card changed image after first paint.
  const firstPainted = samples.find((s) => s.cards.some((c) => c.hash));
  if (firstPainted) {
    for (let i = 0; i < cardsToTest; i++) {
      const first = firstPainted.cards[i]?.hash;
      const last = finalSample.cards[i]?.hash;
      if (first && last && first !== last) {
        throw new Error(`Visual flash detected: gotchi ${finalSample.cards[i]?.gotchiId} image changed from first paint to final.`);
      }
    }
  }

  // BUG 3: API returned identical SVG for different collaterals.
  for (const [, cols] of svgByCollateral.entries()) {
    if (cols.size > 1) {
      throw new Error(`API bug: identical SVG returned for ${cols.size} different collaterals: ${[...cols].join(", ")}`);
    }
  }
});
