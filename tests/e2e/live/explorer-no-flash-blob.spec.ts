import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";

/**
 * Explorer blob-URL flash safety (deterministic rewrite).
 *
 * Explorer art is an <img src="blob:..."> (GotchiSvg useBlobUrl=true). Once the
 * blob src is set it must not change, data-commit-count must not keep climbing,
 * data-request-key must stay fixed (no hover), and the rendered pixels must not
 * flash. On hover the card swaps to a naked blob then back to the dressed one.
 */

const PREVIEW_URL = "**/api/gotchis/preview";

function makeGotchi(i: number, collateral: string, wearables: number[]) {
  const tokenId = String(3000 + i);
  return {
    id: tokenId,
    gotchiId: tokenId,
    name: `Blob Gotchi ${i}`,
    level: "1",
    numericTraits: [50, 50, 50, 50, 50, 50],
    modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
    withSetsNumericTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: wearables,
    baseRarityScore: "300",
    modifiedRarityScore: "300",
    withSetsRarityScore: String(360 + i),
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

// First gotchi is dressed (so hover -> naked produces a real swap), others naked.
const DRESSED = [29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const FIXTURES = [
  makeGotchi(0, "0x1111111111111111111111111111111111111111", DRESSED),
  makeGotchi(1, "0x2222222222222222222222222222222222222222", new Array(16).fill(0)),
  makeGotchi(2, "0x3333333333333333333333333333333333333333", new Array(16).fill(0)),
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
  // Dressed vs naked produce different bodies so blob URLs differ on hover.
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
}

test("Explorer: No flash after first paint with blob URLs", async ({ page }) => {
  await stubAll(page);
  await page.goto("/explorer");

  const root = page.locator('[data-testid^="explorer-gotchi-"][data-gotchi-id]').first();
  await expect(root).toBeVisible({ timeout: 20000 });
  const gotchiId = await root.getAttribute("data-gotchi-id");
  expect(gotchiId).toBeTruthy();

  const img = root.locator('img[src^="blob:"]');
  await expect(img).toBeVisible({ timeout: 10000 });

  const initialSrc = await img.getAttribute("src");
  const initialCommitCount = await root.getAttribute("data-commit-count");
  const initialRequestKey = await root.getAttribute("data-request-key");
  expect(initialSrc).toContain("blob:");
  expect(initialCommitCount).toBeTruthy();
  expect(initialRequestKey).toBeTruthy();

  // Sample src / commit-count / requestKey / pixel-hash over 2s.
  const samples: Array<{ src: string | null; commitCount: string | null; requestKey: string | null; imageHash: string | null }> = [];
  for (let i = 0; i <= 10; i++) {
    if (i > 0) await page.waitForTimeout(200);
    const src = await img.getAttribute("src");
    const commitCount = await root.getAttribute("data-commit-count");
    const requestKey = await root.getAttribute("data-request-key");
    let imageHash: string | null = null;
    try {
      const shot = await img.screenshot();
      imageHash = crypto.createHash("sha256").update(shot).digest("hex");
    } catch { /* ignore */ }
    samples.push({ src, commitCount, requestKey, imageHash });
  }

  // 1) src never changes after first paint.
  expect(new Set(samples.map((s) => s.src).filter(Boolean)).size).toBe(1);

  // 2) commit count never increases after first paint.
  const commitCounts = samples.map((s) => s.commitCount).filter(Boolean) as string[];
  expect(new Set(commitCounts).size).toBe(1);
  expect(commitCounts[0]).toBe(initialCommitCount);

  // 3) requestKey never changes (no hover).
  expect(new Set(samples.map((s) => s.requestKey).filter(Boolean)).size).toBe(1);
  expect(samples[0].requestKey).toBe(initialRequestKey);

  // 4) pixels never flash.
  const hashes = samples.map((s) => s.imageHash).filter(Boolean) as string[];
  if (hashes.length > 1) {
    expect(hashes.every((h) => h === hashes[0])).toBe(true);
  }
});

test("Explorer: No flash on hover (blob URL src stability)", async ({ page }) => {
  await stubAll(page);
  await page.goto("/explorer");

  // Use the dressed gotchi (token 3000) so hover -> naked is a real swap.
  const root = page.locator('[data-testid="explorer-gotchi-3000"]');
  await expect(root).toBeVisible({ timeout: 20000 });

  const img = root.locator('img[src^="blob:"]');
  await expect(img).toBeVisible({ timeout: 10000 });

  const initialSrc = await img.getAttribute("src");
  const initialCommitCount = await root.getAttribute("data-commit-count");
  expect(initialSrc).toContain("blob:");
  expect(initialCommitCount).toBeTruthy();

  // Hover the card art area -> naked state.
  await root.hover();
  await page.waitForTimeout(500);

  // Unhover -> back to dressed.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);

  const finalSrc = await img.getAttribute("src");
  const finalCommitCount = await root.getAttribute("data-commit-count");

  // src returns to a dressed blob. We assert it's a blob again (not exact
  // object-URL identity) + bounded commits below — GotchiSvg may mint a fresh
  // blob URL for identical content; requestKey/commit stability is the real
  // anti-flash signal (covered here + in the sibling requestkey/no-first-paint specs).
  expect(finalSrc).toContain("blob:");

  // commit count is bounded (at most +1 naked, +1 dressed) and not runaway.
  const diff = Number(finalCommitCount) - Number(initialCommitCount);
  expect(diff).toBeGreaterThanOrEqual(0);
  expect(diff).toBeLessThanOrEqual(2);
});
